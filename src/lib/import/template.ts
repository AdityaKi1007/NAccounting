import ExcelJS from "exceljs";
import { getImportConfig } from "./import-catalog";

// Builds the downloadable blank .xlsx template for one importable object type — the header
// row (exact column names the importer expects back) plus one filled example row, so a user
// starting from scratch has a concrete pattern to copy rather than guessing formats (dates,
// Yes/No booleans, etc). Uses `exceljs`, not `xlsx`/SheetJS — see the addendum doc for why
// (SheetJS has an unpatched high-severity prototype-pollution/ReDoS advisory on npm and this
// workbook-parsing code path handles user-uploaded files, so that risk was avoided up front).
export async function buildImportTemplate(entity: string): Promise<Buffer | null> {
  const cfg = getImportConfig(entity);
  if (!cfg) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NeoAccounting";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(cfg.label.slice(0, 31) || "Import");

  sheet.columns = cfg.columns.map((col) => ({
    header: col.required ? `${col.header} *` : col.header,
    key: col.field,
    width: Math.max(18, col.header.length + 4),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
  });

  const exampleRow: Record<string, unknown> = {};
  for (const col of cfg.columns) {
    exampleRow[col.field] = col.example ?? "";
  }
  sheet.addRow(exampleRow);

  // A second sheet documenting each column's type, whether it's required, and (for
  // select/relation columns) exactly what values are accepted — so the file is self-
  // explanatory without needing to come back to the app for the rules.
  const notes = workbook.addWorksheet("Instructions");
  notes.columns = [
    { header: "Column", key: "column", width: 28 },
    { header: "Required", key: "required", width: 12 },
    { header: "Notes", key: "notes", width: 70 },
  ];
  notes.getRow(1).font = { bold: true };
  for (const col of cfg.columns) {
    let note = "";
    if (col.relation) {
      note = `Must exactly match an existing ${col.relation.entityLabel}'s name in this organization (case-insensitive). Leave blank to skip.`;
    } else if (col.kind === "select" && col.options) {
      note = `One of: ${col.options.map((o) => o.label).join(", ")}.`;
    } else if (col.kind === "boolean") {
      note = `Yes or No. Leave blank to use the default (${col.defaultValue ? "Yes" : "No"}).`;
    } else if (col.kind === "date") {
      note = `Date, e.g. 2026-09-01.`;
    } else if (col.scope === "line") {
      note = `Line item field — this template supports one line item per row.`;
    }
    notes.addRow({ column: col.header, required: col.required ? "Yes" : "No", notes: note });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
