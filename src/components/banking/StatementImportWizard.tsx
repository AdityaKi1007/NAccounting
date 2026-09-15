"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { parseStatementDate, parseStatementAmount, type DateFormatHint } from "@/lib/statement-values";

// The Banks -> "Import Statement" wizard, modeled on the reference screenshot's 3-step flow
// (Configure -> Map Fields -> Preview). See src/lib/statement-import.ts for why only
// CSV/TSV/XLS/PDF actually parse (OFX/QIF/MT940/N43/CAMT.053/054 are listed to match the
// reference UI but rejected server-side with a clear message) and
// src/lib/bank-statement-imports.ts for what happens after: rows land as "pending" in the
// Imported Transactions list, nothing posts to the books until a human categorizes + posts it.

const SUPPORTED = [
  { value: "csv", label: "CSV", accept: ".csv" },
  { value: "tsv", label: "TSV", accept: ".tsv" },
  { value: "xls", label: "XLS / XLSX", accept: ".xls,.xlsx" },
  { value: "pdf", label: "PDF", accept: ".pdf" },
] as const;
const UNSUPPORTED = [
  { value: "ofx", label: "OFX" },
  { value: "qif", label: "QIF" },
  { value: "mt940", label: "MT940" },
  { value: "n43", label: "N43" },
  { value: "camt053", label: "CAMT.053" },
  { value: "camt054", label: "CAMT.054" },
];

type Format = (typeof SUPPORTED)[number]["value"];

interface ParsedTable {
  headers: string[];
  rows: string[][];
  autoMapped: boolean;
  autoMapping?: { dateCol: number; descriptionCol: number; amountCol: number };
  warnings: string[];
}

interface BankAccountOption {
  id: string;
  account_name: string;
  bank_name: string | null;
}

const NONE = "__none__";

export default function StatementImportWizard({
  open,
  onClose,
  bankAccountOptions,
}: {
  open: boolean;
  onClose: () => void;
  bankAccountOptions: BankAccountOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 — Configure
  const [bankAccountId, setBankAccountId] = useState("");
  const [format, setFormat] = useState<Format | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<"utf-8" | "latin1">("utf-8");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);

  // Step 2 — Map Fields
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [refCol, setRefCol] = useState(NONE);
  const [amountMode, setAmountMode] = useState<"single" | "split">("single");
  const [amountCol, setAmountCol] = useState("");
  const [signConvention, setSignConvention] = useState<"positive_in" | "positive_out">("positive_in");
  const [debitCol, setDebitCol] = useState(NONE);
  const [creditCol, setCreditCol] = useState(NONE);
  const [dateHint, setDateHint] = useState<DateFormatHint>("DMY");

  // Step 3 — Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [duplicateIndexes, setDuplicateIndexes] = useState<Set<number>>(new Set());
  const [skippedIndexes, setSkippedIndexes] = useState<Map<number, string>>(new Map());
  const [includedRows, setIncludedRows] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; duplicateCount: number } | null>(null);

  function reset() {
    setStep(1);
    setBankAccountId("");
    setFormat("");
    setFile(null);
    setEncoding("utf-8");
    setParseError(null);
    setParsed(null);
    setDateCol("");
    setDescCol("");
    setRefCol(NONE);
    setAmountMode("single");
    setAmountCol("");
    setSignConvention("positive_in");
    setDebitCol(NONE);
    setCreditCol(NONE);
    setDateHint("DMY");
    setPreviewError(null);
    setDuplicateIndexes(new Set());
    setSkippedIndexes(new Map());
    setIncludedRows(new Set());
    setImportError(null);
    setImportResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function pickFormatFromName(name: string): Format | "" {
    const lower = name.toLowerCase();
    if (lower.endsWith(".csv")) return "csv";
    if (lower.endsWith(".tsv")) return "tsv";
    if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "xls";
    if (lower.endsWith(".pdf")) return "pdf";
    for (const u of UNSUPPORTED) {
      if (lower.endsWith(`.${u.value}`)) return "" as Format | "";
    }
    return "";
  }

  // Signature-sniffs a text sample when the file's own extension doesn't tell us anything
  // (".txt", ".sta", ".xml", no extension, or anything unrecognized) — real-world exports very
  // often carry a generic extension instead of the "correct" one (the reference sample used to
  // scope this feature is itself a real MT940 statement named "...MT940_Sample_AED.txt"), and
  // without this the wizard had no way to explain *why* it couldn't read the file, so it fell
  // through to the Next button's generic "Choose a file to import" guard — misleading, since a
  // file plainly had been chosen.
  function sniffFormatFromContent(
    text: string
  ): { kind: "supported"; format: Format } | { kind: "unsupported"; label: string } | { kind: "unknown" } {
    const sample = text.slice(0, 8000);
    const upper = sample.toUpperCase();

    // MT940 (SWIFT): a real message carries several ":TAG:" field markers — requiring a few of
    // them avoids a false hit off one coincidental colon-wrapped substring.
    const mt940Tags = [":20:", ":25:", ":28C:", ":60F:", ":61:", ":86:", ":62F:"];
    if (mt940Tags.filter((t) => sample.includes(t)).length >= 3) return { kind: "unsupported", label: "MT940" };

    if (upper.includes("OFXHEADER") || upper.includes("<OFX>")) return { kind: "unsupported", label: "OFX" };
    if (/^!type:/im.test(sample)) return { kind: "unsupported", label: "QIF" };
    if (upper.includes("CAMT.054")) return { kind: "unsupported", label: "CAMT.054" };
    if (upper.includes("CAMT.053")) return { kind: "unsupported", label: "CAMT.053" };
    if (upper.includes("<DOCUMENT") && upper.includes("BKTOCSTMT")) return { kind: "unsupported", label: "CAMT.053" };

    // N43 (Spanish banking Norma 43): fixed-width, most non-empty lines open with a 2-digit
    // record code from a small known set.
    const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 30);
    if (lines.length >= 5) {
      const n43Codes = new Set(["11", "22", "23", "24", "33", "88"]);
      if (lines.filter((l) => n43Codes.has(l.slice(0, 2))).length / lines.length > 0.8) {
        return { kind: "unsupported", label: "N43" };
      }
    }

    // Otherwise, a genuine CSV/TSV export sometimes carries a generic .txt extension — sniff
    // the delimiter directly rather than leaving it unrecognized.
    if (lines.length >= 2) {
      const countOf = (ch: string) => lines.map((l) => (l.match(new RegExp(`\\${ch}`, "g")) || []).length);
      const consistent = (counts: number[]) => counts[0] > 0 && counts.every((c) => c === counts[0]);
      const tabCounts = countOf("\t");
      const commaCounts = countOf(",");
      if (consistent(tabCounts)) return { kind: "supported", format: "tsv" };
      if (consistent(commaCounts)) return { kind: "supported", format: "csv" };
    }

    return { kind: "unknown" };
  }

  async function onFileChosen(f: File) {
    setFile(f);
    setParseError(null);
    setFormat("");
    const guessed = pickFormatFromName(f.name);
    if (guessed) {
      setFormat(guessed);
      return;
    }
    const lower = f.name.toLowerCase();
    const unsupportedHit = UNSUPPORTED.find((u) => lower.endsWith(`.${u.value}`));
    if (unsupportedHit) {
      setParseError(
        `${unsupportedHit.label} isn't supported yet — this build can import CSV, TSV, XLS/XLSX and PDF statements. Export your statement in one of those formats and try again.`
      );
      return;
    }
    try {
      const sample = await f.slice(0, 8000).text();
      const sniffed = sniffFormatFromContent(sample);
      if (sniffed.kind === "supported") {
        setFormat(sniffed.format);
      } else if (sniffed.kind === "unsupported") {
        setParseError(
          `This looks like a ${sniffed.label} statement — that format isn't supported yet — this build can import CSV, TSV, XLS/XLSX and PDF statements. Export your statement in one of those formats and try again.`
        );
      } else {
        setParseError(
          `Couldn't tell what format "${f.name}" is from its name or contents. Rename it with a .csv, .tsv, .xls/.xlsx or .pdf extension if it's one of those, or note that OFX/QIF/MT940/N43/CAMT.053/CAMT.054 statements aren't supported yet.`
        );
      }
    } catch {
      setParseError(`Couldn't read "${f.name}" to determine its format. Try a different file.`);
    }
  }

  async function goToMapFields() {
    if (!bankAccountId) return setParseError("Select an account to import into.");
    if (!file) return setParseError("Choose a file to import.");
    // A file IS selected here but format resolution came up empty — onFileChosen always sets a
    // specific parseError explaining why (unsupported format detected, or unrecognized
    // entirely) whenever that happens, so surfacing the generic "Choose a file to import" in
    // this branch was misleading. Keep a fallback only for the unlikely case format is still
    // being sniffed (async) when Next is clicked.
    if (!format) return setParseError((prev) => prev ?? "Still checking this file's format — try Next again in a moment, or choose a different file.");
    setParsing(true);
    setParseError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("format", format);
      form.append("encoding", encoding);
      const res = await fetch("/api/banking/statement-imports/parse", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setParseError(typeof data.error === "string" ? data.error : "Could not read this file.");
        return;
      }
      const table = data as ParsedTable;
      setParsed(table);
      if (table.rows.length === 0) {
        setParseError(table.warnings[0] || "No rows were found in this file.");
        return;
      }
      if (table.autoMapped && table.autoMapping) {
        setDateCol(String(table.autoMapping.dateCol));
        setDescCol(String(table.autoMapping.descriptionCol));
        setAmountCol(String(table.autoMapping.amountCol));
        setAmountMode("single");
      } else {
        // Best-effort auto-guess by header name, so the user usually just confirms rather than
        // picking every column by hand.
        const findByNames = (names: string[]) =>
          table.headers.findIndex((h) => names.some((n) => h.toLowerCase().includes(n)));
        const guessedDate = findByNames(["date"]);
        const guessedDesc = findByNames(["description", "narration", "details", "particulars"]);
        const guessedRef = findByNames(["reference", "cheque", "ref no", "ref#"]);
        const guessedDebit = findByNames(["debit", "withdrawal"]);
        const guessedCredit = findByNames(["credit", "deposit"]);
        const guessedAmount = findByNames(["amount"]);
        setDateCol(guessedDate >= 0 ? String(guessedDate) : "");
        setDescCol(guessedDesc >= 0 ? String(guessedDesc) : "");
        setRefCol(guessedRef >= 0 ? String(guessedRef) : NONE);
        if (guessedDebit >= 0 || guessedCredit >= 0) {
          setAmountMode("split");
          setDebitCol(guessedDebit >= 0 ? String(guessedDebit) : NONE);
          setCreditCol(guessedCredit >= 0 ? String(guessedCredit) : NONE);
        } else {
          setAmountMode("single");
          setAmountCol(guessedAmount >= 0 ? String(guessedAmount) : "");
        }
      }
      setStep(2);
    } finally {
      setParsing(false);
    }
  }

  // Builds { date, description, reference, amount, direction } per row from the current
  // column mapping — used both for the live Map Fields preview and to build the payload sent
  // to /confirm (dry-run first, then for real).
  const buildRawRows = useMemo(() => {
    return () => {
      if (!parsed) return [] as { date: string; description: string; reference: string; amount: string; direction: "in" | "out" }[];
      const dCol = Number(dateCol);
      const descColN = Number(descCol);
      const refColN = refCol === NONE ? -1 : Number(refCol);
      return parsed.rows.map((row) => {
        const date = row[dCol] ?? "";
        const description = row[descColN] ?? "";
        const reference = refColN >= 0 ? row[refColN] ?? "" : "";
        let amount = 0;
        let direction: "in" | "out" = "in";
        if (amountMode === "single") {
          const raw = row[Number(amountCol)] ?? "";
          const parsedAmt = parseStatementAmount(raw);
          if (parsedAmt !== null) {
            const isNegative = parsedAmt < 0;
            direction = signConvention === "positive_in" ? (isNegative ? "out" : "in") : isNegative ? "in" : "out";
            amount = Math.abs(parsedAmt);
          }
        } else {
          const debitRaw = debitCol === NONE ? "" : row[Number(debitCol)] ?? "";
          const creditRaw = creditCol === NONE ? "" : row[Number(creditCol)] ?? "";
          const debitVal = debitRaw ? parseStatementAmount(debitRaw) : null;
          const creditVal = creditRaw ? parseStatementAmount(creditRaw) : null;
          if (debitVal && Math.abs(debitVal) > 0) {
            amount = Math.abs(debitVal);
            direction = "out";
          } else if (creditVal && Math.abs(creditVal) > 0) {
            amount = Math.abs(creditVal);
            direction = "in";
          }
        }
        return { date, description, reference, amount: String(amount), direction };
      });
    };
  }, [parsed, dateCol, descCol, refCol, amountMode, amountCol, signConvention, debitCol, creditCol]);

  const mappingIsValid =
    parsed?.autoMapped ||
    (dateCol !== "" && descCol !== "" && (amountMode === "single" ? amountCol !== "" : debitCol !== NONE || creditCol !== NONE));

  async function goToPreview() {
    if (!mappingIsValid) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const rawRows = buildRawRows();
      const res = await fetch("/api/banking/statement-imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: bankAccountId,
          file_name: file?.name ?? null,
          file_format: format,
          date_hint: dateHint,
          rows: rawRows,
          dry_run: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPreviewError(typeof data.error === "string" ? data.error : "Could not validate these rows.");
        return;
      }
      const skipped = new Map<number, string>((data.skipped ?? []).map((s: { index: number; reason: string }) => [s.index, s.reason]));
      const dupes = new Set<number>(data.duplicateIndexes ?? []);
      setSkippedIndexes(skipped);
      setDuplicateIndexes(dupes);
      const allValid = new Set<number>((rawRows as unknown[]).map((_, i) => i).filter((i) => !skipped.has(i)));
      setIncludedRows(allValid);
      setStep(3);
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleRow(i: number) {
    setIncludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function confirmImport() {
    setImporting(true);
    setImportError(null);
    try {
      const rawRows = buildRawRows().filter((_, i) => includedRows.has(i));
      if (rawRows.length === 0) {
        setImportError("Select at least one transaction to import.");
        return;
      }
      const res = await fetch("/api/banking/statement-imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_account_id: bankAccountId,
          file_name: file?.name ?? null,
          file_format: format,
          date_hint: dateHint,
          rows: rawRows,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportError(typeof data.error === "string" ? data.error : "Import failed.");
        return;
      }
      setImportResult({ imported: data.imported ?? rawRows.length, duplicateCount: data.duplicateCount ?? 0 });
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  const rawRowsPreview = step >= 2 ? buildRawRows() : [];
  const columnOptions = parsed && !parsed.autoMapped ? parsed.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })) : [];

  return (
    <Modal open={open} onClose={handleClose} title="Import Statement" width="max-w-3xl">
      <div className="mb-5 flex items-center gap-2 text-xs font-medium">
        {(["Configure", "Map Fields", "Preview"] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  active ? "bg-brand-600 text-white" : done ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <CheckCircle2 size={14} /> : n}
              </div>
              <span className={active ? "text-ink-800" : done ? "text-emerald-600" : "text-gray-400"}>{label}</span>
              {n < 3 && <div className="h-px flex-1 bg-gray-200" />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-ink-700">
              Select an account<span className="text-red-500">*</span>
            </label>
            <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="input w-full">
              <option value="">Choose your account for import</option>
              {bankAccountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                  {a.bank_name ? ` (${a.bank_name})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFileChosen(f);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${
              dragOver ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm">
              <Upload size={20} />
            </div>
            {file ? (
              <p className="mb-3 text-sm font-medium text-ink-800">{file.name}</p>
            ) : (
              <p className="mb-3 text-sm font-medium text-ink-800">Drag and drop file to import</p>
            )}
            <label className="btn-primary cursor-pointer px-4 py-2 text-sm">
              <Upload size={14} />
              Choose File
              <input
                type="file"
                accept=".csv,.tsv,.xls,.xlsx,.pdf,.ofx,.qif,.mt940,.sta,.n43,.xml,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileChosen(f);
                }}
              />
            </label>
            <p className="mt-3 text-xs text-gray-400">
              Maximum File Size: 1 MB for CSV, TSV, XLS, OFX, QIF, MT940, N43, CAMT.053 and CAMT.054 • 5 MB for PDF files.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
            {SUPPORTED.map((f) => (
              <span key={f.value} className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                {f.label}
              </span>
            ))}
            {UNSUPPORTED.map((f) => (
              <span key={f.value} className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-400" title="Not yet supported — shown for reference">
                {f.label}
              </span>
            ))}
          </div>

          <div className="mt-5">
            <label className="mb-1 block text-sm font-medium text-ink-700">Character Encoding</label>
            <select value={encoding} onChange={(e) => setEncoding(e.target.value as "utf-8" | "latin1")} className="input w-full sm:w-64">
              <option value="utf-8">UTF-8 (Unicode)</option>
              <option value="latin1">Windows-1252 (Latin-1)</option>
            </select>
          </div>

          {parseError && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <button type="button" onClick={handleClose} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={goToMapFields} disabled={parsing} className="btn-primary">
              {parsing ? <Loader2 size={14} className="animate-spin" /> : null}
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && parsed && (
        <div>
          {parsed.autoMapped ? (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>Columns are auto-detected from the PDF&apos;s text layout — check the preview below carefully.</span>
            </div>
          ) : null}

          {!parsed.autoMapped && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">
                  Date Column<span className="text-red-500">*</span>
                </label>
                <select value={dateCol} onChange={(e) => setDateCol(e.target.value)} className="input w-full">
                  <option value="">Select column</option>
                  {columnOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">
                  Description Column<span className="text-red-500">*</span>
                </label>
                <select value={descCol} onChange={(e) => setDescCol(e.target.value)} className="input w-full">
                  <option value="">Select column</option>
                  {columnOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Reference Column</label>
                <select value={refCol} onChange={(e) => setRefCol(e.target.value)} className="input w-full">
                  <option value={NONE}>None</option>
                  {columnOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Date Format</label>
                <select value={dateHint} onChange={(e) => setDateHint(e.target.value as DateFormatHint)} className="input w-full">
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="MDY">MM/DD/YYYY</option>
                  <option value="YMD">YYYY/MM/DD</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-ink-700">Amount</label>
                <div className="mb-2 flex gap-4 text-sm text-ink-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={amountMode === "single"} onChange={() => setAmountMode("single")} />
                    Single Amount column
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={amountMode === "split"} onChange={() => setAmountMode("split")} />
                    Separate Debit / Credit columns
                  </label>
                </div>

                {amountMode === "single" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <select value={amountCol} onChange={(e) => setAmountCol(e.target.value)} className="input w-full">
                      <option value="">Select column</option>
                      {columnOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={signConvention}
                      onChange={(e) => setSignConvention(e.target.value as "positive_in" | "positive_out")}
                      className="input w-full"
                    >
                      <option value="positive_in">Positive = Money In (Deposit)</option>
                      <option value="positive_out">Positive = Money Out (Withdrawal)</option>
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Debit / Withdrawal column</label>
                      <select value={debitCol} onChange={(e) => setDebitCol(e.target.value)} className="input w-full">
                        <option value={NONE}>None</option>
                        {columnOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Credit / Deposit column</label>
                      <select value={creditCol} onChange={(e) => setCreditCol(e.target.value)} className="input w-full">
                        <option value={NONE}>None</option>
                        {columnOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {parsed.autoMapped && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Date Format</label>
                <select value={dateHint} onChange={(e) => setDateHint(e.target.value as DateFormatHint)} className="input w-full">
                  <option value="DMY">DD/MM/YYYY</option>
                  <option value="MDY">MM/DD/YYYY</option>
                  <option value="YMD">YYYY/MM/DD</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-700">Amount Sign</label>
                <select
                  value={signConvention}
                  onChange={(e) => setSignConvention(e.target.value as "positive_in" | "positive_out")}
                  className="input w-full"
                >
                  <option value="positive_in">Positive = Money In (Deposit)</option>
                  <option value="positive_out">Positive = Money Out (Withdrawal)</option>
                </select>
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Preview (first 5 rows)</p>
            <div className="overflow-x-auto rounded-md border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2.5 py-1.5">Date</th>
                    <th className="px-2.5 py-1.5">Description</th>
                    <th className="px-2.5 py-1.5">Reference</th>
                    <th className="px-2.5 py-1.5">Amount</th>
                    <th className="px-2.5 py-1.5">Direction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rawRowsPreview.slice(0, 5).map((r, i) => {
                    const iso = parseStatementDate(r.date, dateHint);
                    return (
                      <tr key={i}>
                        <td className={`px-2.5 py-1.5 ${iso ? "text-ink-700" : "text-red-500"}`}>{iso ?? (r.date || "—")}</td>
                        <td className="max-w-[200px] truncate px-2.5 py-1.5 text-ink-700">{r.description || "—"}</td>
                        <td className="px-2.5 py-1.5 text-ink-700">{r.reference || "—"}</td>
                        <td className="px-2.5 py-1.5 text-ink-700">{Number(r.amount).toFixed(2)}</td>
                        <td className="px-2.5 py-1.5 text-ink-700">{r.direction === "in" ? "Money In" : "Money Out"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {previewError && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary">
              Back
            </button>
            <button type="button" onClick={goToPreview} disabled={!mappingIsValid || previewLoading} className="btn-primary">
              {previewLoading ? <Loader2 size={14} className="animate-spin" /> : null}
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          {importResult ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={22} />
              </div>
              <p className="text-sm font-semibold text-ink-800">
                Imported {importResult.imported} transaction{importResult.imported === 1 ? "" : "s"}
              </p>
              {importResult.duplicateCount > 0 && (
                <p className="max-w-sm text-xs text-amber-600">
                  {importResult.duplicateCount} of these looked like a possible duplicate of an already-imported transaction —
                  review them under Imported Transactions.
                </p>
              )}
              <p className="max-w-sm text-xs text-gray-500">
                Nothing has posted to your books yet — review each transaction under Imported Transactions, pick a category, and
                post it.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    router.push("/banking/imports");
                  }}
                  className="btn-primary"
                >
                  View Imported Transactions
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-800">
                  {includedRows.size} of {rawRowsPreview.length} transaction{rawRowsPreview.length === 1 ? "" : "s"} selected
                </p>
                {duplicateIndexes.size > 0 && (
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertTriangle size={13} /> {duplicateIndexes.size} possible duplicate{duplicateIndexes.size === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              <div className="max-h-96 overflow-auto rounded-md border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="w-8 px-2.5 py-1.5" />
                      <th className="px-2.5 py-1.5">Date</th>
                      <th className="px-2.5 py-1.5">Description</th>
                      <th className="px-2.5 py-1.5">Amount</th>
                      <th className="px-2.5 py-1.5">Direction</th>
                      <th className="px-2.5 py-1.5">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rawRowsPreview.map((r, i) => {
                      const skippedReason = skippedIndexes.get(i);
                      const isDuplicate = duplicateIndexes.has(i);
                      const iso = parseStatementDate(r.date, dateHint);
                      return (
                        <tr key={i} className={skippedReason ? "bg-gray-50 text-gray-400" : isDuplicate ? "bg-amber-50/50" : ""}>
                          <td className="px-2.5 py-1.5">
                            <input
                              type="checkbox"
                              disabled={!!skippedReason}
                              checked={includedRows.has(i)}
                              onChange={() => toggleRow(i)}
                            />
                          </td>
                          <td className="px-2.5 py-1.5">{iso ?? (r.date || "—")}</td>
                          <td className="max-w-[220px] truncate px-2.5 py-1.5">{r.description || "—"}</td>
                          <td className="px-2.5 py-1.5">{Number(r.amount).toFixed(2)}</td>
                          <td className="px-2.5 py-1.5">{r.direction === "in" ? "Money In" : "Money Out"}</td>
                          <td className="px-2.5 py-1.5">
                            {skippedReason ? (
                              <span className="text-red-500">{skippedReason}</span>
                            ) : isDuplicate ? (
                              <span className="text-amber-600">Possible duplicate</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {importError && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <button type="button" onClick={() => setStep(2)} className="btn-secondary">
                  Back
                </button>
                <button type="button" onClick={confirmImport} disabled={importing || includedRows.size === 0} className="btn-primary">
                  {importing ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                  Import {includedRows.size} Transaction{includedRows.size === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
