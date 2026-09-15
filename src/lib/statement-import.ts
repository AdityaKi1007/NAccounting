import ExcelJS from "exceljs";
import { parseString as parseCsvString } from "fast-csv";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import crypto from "crypto";

// Parsing engine behind the Banks -> "Import Statement" wizard (see
// src/components/banking/StatementImportWizard.tsx and
// src/app/api/banking/statement-imports/parse/route.ts). The reference screenshot's format
// list includes several real banking-interchange standards (OFX, QIF, MT940, N43, CAMT.053,
// CAMT.054) this build does NOT actually parse — see SUPPORTED_FORMATS/UNSUPPORTED_FORMATS
// below and the parse route's own comment for why (asked the user directly: build real
// parsers for the common formats, or all nine; "CSV/TSV/XLS + PDF only" was chosen).

export type StatementFormat = "csv" | "tsv" | "xls" | "pdf";

export const SUPPORTED_FORMATS: { value: StatementFormat; label: string; extensions: string[] }[] = [
  { value: "csv", label: "CSV", extensions: [".csv"] },
  { value: "tsv", label: "TSV", extensions: [".tsv"] },
  { value: "xls", label: "XLS / XLSX", extensions: [".xls", ".xlsx"] },
  { value: "pdf", label: "PDF", extensions: [".pdf"] },
];

// Shown in the Configure step's format list (matching the reference screenshot) but rejected
// by the parse route with a clear message — not silently mis-parsed. Real support for any of
// these would mean implementing a genuine SWIFT MT940 / ISO 20022 CAMT.053-054 XML / OFX SGML
// / QIF parser, each validated against real bank sample files this build has none of.
export const UNSUPPORTED_FORMATS: { value: string; label: string; extensions: string[] }[] = [
  { value: "ofx", label: "OFX", extensions: [".ofx"] },
  { value: "qif", label: "QIF", extensions: [".qif"] },
  { value: "mt940", label: "MT940", extensions: [".mt940", ".sta"] },
  { value: "n43", label: "N43", extensions: [".n43"] },
  { value: "camt053", label: "CAMT.053", extensions: [".camt053", ".xml"] },
  { value: "camt054", label: "CAMT.054", extensions: [".camt054"] },
];

export const MAX_FILE_BYTES: Record<StatementFormat, number> = {
  csv: 1024 * 1024,
  tsv: 1024 * 1024,
  xls: 1024 * 1024,
  pdf: 5 * 1024 * 1024,
};

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** true for PDF's best-effort auto-detected table, where there are no real column headers
   * to map — the wizard skips the Map Fields step and shows the auto-detected columns as-is. */
  autoMapped: boolean;
  /** Set when autoMapped and a heuristic column index was found (Date/Description/Amount). */
  autoMapping?: { dateCol: number; descriptionCol: number; amountCol: number };
  warnings: string[];
}

function decodeBuffer(buffer: Buffer, encoding: "utf-8" | "latin1"): string {
  // Node's Buffer natively supports both without any extra dependency; latin1 covers the
  // handful of legacy Windows-1252 bank exports that aren't valid UTF-8 (smart quotes,
  // accented branch names, etc.) well enough for a statement import's purposes.
  return buffer.toString(encoding === "latin1" ? "latin1" : "utf-8");
}

async function parseDelimited(text: string, delimiter: "," | "\t"): Promise<ParsedTable> {
  const allRows: string[][] = await new Promise((resolve, reject) => {
    const out: string[][] = [];
    parseCsvString(text, { delimiter, ignoreEmpty: true, trim: true })
      .on("error", reject)
      .on("data", (row: string[]) => out.push(row))
      .on("end", () => resolve(out));
  });
  if (allRows.length === 0) return { headers: [], rows: [], autoMapped: false, warnings: ["The file has no rows."] };
  return { headers: allRows[0], rows: allRows.slice(1), autoMapped: false, warnings: [] };
}

async function parseXls(buffer: Buffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      headers: [],
      rows: [],
      autoMapped: false,
      warnings: [
        "This file isn't in a format we can read as XLS/XLSX (legacy binary .xls files aren't supported — re-export as .xlsx or .csv from your bank's portal and try again).",
      ],
    };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    return { headers: [], rows: [], autoMapped: false, warnings: ["The workbook's first sheet is empty."] };
  }
  const toCell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object" && v !== null && "result" in (v as Record<string, unknown>)) {
      return String((v as { result: unknown }).result ?? "");
    }
    if (typeof v === "object" && v !== null && "text" in (v as Record<string, unknown>)) {
      return String((v as { text: unknown }).text ?? "");
    }
    return String(v);
  };
  const headerRow = sheet.getRow(1);
  const colCount = Math.max(sheet.columnCount, headerRow.cellCount);
  const headers: string[] = [];
  for (let c = 1; c <= colCount; c++) headers.push(toCell(headerRow.getCell(c).value) || `Column ${c}`);

  const rows: string[][] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    let hasValue = false;
    for (let c = 1; c <= colCount; c++) {
      const v = toCell(row.getCell(c).value);
      if (v.trim()) hasValue = true;
      cells.push(v);
    }
    if (hasValue) rows.push(cells);
  }
  return { headers, rows, autoMapped: false, warnings: [] };
}

// Bank statement PDFs have no standard layout, so this is genuinely best-effort: extract text
// with poppler's pdftotext -layout (preserves column spacing far better than a raw text dump),
// then look for lines that start with a date and end with a number — the shape almost every
// bank statement line has, regardless of the bank. Anything that doesn't match that shape
// (headers, footers, page numbers, running-balance-only lines) is silently skipped, and if
// nothing at all matches, a warning says so plainly rather than returning a fabricated table.
const PDF_LINE_RE =
  /^\s*(\d{1,2}[\/\-. ][A-Za-z0-9]{2,9}[\/\-. ]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+([+-]?\(?\d[\d,]*\.\d{2}\)?\s?(?:DR|CR|Dr|Cr)?)\s*$/;

async function parsePdf(buffer: Buffer): Promise<ParsedTable> {
  const tmpPath = path.join(tmpdir(), `stmt-${crypto.randomUUID()}.pdf`);
  await writeFile(tmpPath, buffer);
  let text: string;
  try {
    text = await new Promise<string>((resolve, reject) => {
      const proc = spawn("pdftotext", ["-layout", tmpPath, "-"]);
      let out = "";
      let err = "";
      proc.stdout.on("data", (d) => (out += d.toString("utf-8")));
      proc.stderr.on("data", (d) => (err += d.toString("utf-8")));
      proc.on("error", reject);
      proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `pdftotext exited ${code}`))));
    });
  } finally {
    await unlink(tmpPath).catch(() => {});
  }

  const rows: string[][] = [];
  for (const line of text.split("\n")) {
    const m = PDF_LINE_RE.exec(line);
    if (m) rows.push([m[1].trim(), m[2].trim(), m[3].trim()]);
  }

  if (rows.length === 0) {
    return {
      headers: [],
      rows: [],
      autoMapped: true,
      warnings: [
        "Couldn't automatically detect any date/description/amount rows in this PDF's text layout. PDF statement parsing is best-effort and works best with a simple, single-column transaction table — try CSV or XLS from your bank's portal instead if this keeps happening.",
      ],
    };
  }

  return {
    headers: ["Date", "Description", "Amount"],
    rows,
    autoMapped: true,
    autoMapping: { dateCol: 0, descriptionCol: 1, amountCol: 2 },
    warnings: [`Auto-detected ${rows.length} row${rows.length === 1 ? "" : "s"} from the PDF's text layout — double-check them in the preview step below before importing.`],
  };
}

export async function parseStatementFile(
  buffer: Buffer,
  format: StatementFormat,
  encoding: "utf-8" | "latin1"
): Promise<ParsedTable> {
  if (buffer.byteLength > MAX_FILE_BYTES[format]) {
    const maxMb = MAX_FILE_BYTES[format] / (1024 * 1024);
    return { headers: [], rows: [], autoMapped: false, warnings: [`File is larger than the ${maxMb}MB limit for ${format.toUpperCase()} files.`] };
  }
  switch (format) {
    case "csv":
      return parseDelimited(decodeBuffer(buffer, encoding), ",");
    case "tsv":
      return parseDelimited(decodeBuffer(buffer, encoding), "\t");
    case "xls":
      return parseXls(buffer);
    case "pdf":
      return parsePdf(buffer);
  }
}

// Date/amount value parsing (parseStatementDate, parseStatementAmount) lives in
// statement-values.ts, not here — this file pulls in fs/child_process/exceljs, which can't be
// bundled into the "use client" wizard component that also needs those value parsers.
