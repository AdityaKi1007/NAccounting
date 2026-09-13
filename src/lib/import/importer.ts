import ExcelJS from "exceljs";
import { pool, query } from "@/lib/db";
import { createRow } from "@/lib/crud";
import { documentConfigs } from "@/lib/documents";
import { createDocument, type DocumentBody } from "@/lib/documents-api";
import { createReceipt, type ReceiptBody } from "@/lib/receipts-api";
import { getImportConfig, type ImportColumn } from "./import-catalog";

// Core bulk-Excel-import engine backing the new "Import" nav item. Parses an uploaded
// workbook with `exceljs` (never `xlsx`/SheetJS — see template.ts's comment for why),
// resolves Project/Unit/Customer/Bank Account references by name (case-insensitive, scoped
// to the importing org), then calls the exact same creation functions the app's own forms
// use (createRow for Customers/Vendors, createDocument for Invoices/Sales Orders,
// createReceipt for Receipts) so an imported record behaves identically to a hand-entered
// one — same auto-numbering, same GL postings, same validation.
//
// Every spreadsheet row produces exactly one import_log_rows entry, success or failure —
// per the account owner's explicit "log failed records" instruction, a failed row is never
// just shown once and discarded; it's durably recorded with the reason and the row's raw
// values so the user can fix and re-upload just those rows.

export interface ImportRowOutcome {
  rowNumber: number;
  status: "success" | "failed";
  errorMessage?: string;
  rowData: Record<string, unknown>;
  createdRecordId?: string;
}

export interface ImportRunSummary {
  logId: string;
  entity: string;
  fileName: string | null;
  totalRows: number;
  successCount: number;
  failureCount: number;
  rows: ImportRowOutcome[];
}

function normalizeHeader(h: string): string {
  return h.replace(/\*/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

interface ParsedSheet {
  rows: { rowNumber: number; cells: Record<string, unknown>; hasValue: boolean }[];
}

async function parseWorkbook(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet =
    workbook.worksheets.find((ws) => ws.name.toLowerCase() !== "instructions") ?? workbook.worksheets[0];
  if (!sheet) return { rows: [] };

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: ParsedSheet["rows"] = [];
  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    let hasValue = false;
    const cells: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      let value: unknown = cell.value;
      if (value && typeof value === "object" && "result" in (value as Record<string, unknown>)) {
        value = (value as { result: unknown }).result;
      }
      if (value && typeof value === "object" && "text" in (value as Record<string, unknown>)) {
        value = (value as { text: unknown }).text;
      }
      if (value !== null && value !== undefined && String(value).trim() !== "") hasValue = true;
      cells[header] = value;
    });
    if (hasValue) rows.push({ rowNumber: r, cells, hasValue });
  }
  return { rows };
}

function getCell(cells: Record<string, unknown>, header: string): unknown {
  const target = normalizeHeader(header);
  for (const key of Object.keys(cells)) {
    if (normalizeHeader(key) === target) return cells[key];
  }
  return undefined;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function toDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function toNumber(value: unknown, fallback: number | undefined): number | undefined {
  const text = toText(value);
  if (!text) return fallback;
  const n = typeof value === "number" ? value : parseFloat(text);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  const text = toText(value).toLowerCase();
  if (!text) return fallback;
  if (["yes", "y", "true", "1"].includes(text)) return true;
  if (["no", "n", "false", "0"].includes(text)) return false;
  return fallback;
}

function toSelect(value: unknown, column: ImportColumn): string | undefined {
  const text = toText(value);
  if (!text) return column.defaultValue as string | undefined;
  const norm = text.toLowerCase();
  const match = column.options?.find((o) => o.label.toLowerCase() === norm || o.value.toLowerCase() === norm);
  return match ? match.value : text;
}

type RelationOutcome = { id: string } | { error: string } | { skipped: true };

async function resolveRelation(orgId: string, column: ImportColumn, rawValue: unknown): Promise<RelationOutcome> {
  const name = toText(rawValue);
  if (!name) return { skipped: true };
  const rel = column.relation!;
  const rows = await query<{ id: string }>(
    `SELECT id FROM ${rel.table} WHERE organization_id = $1 AND lower(${rel.labelColumn}) = lower($2)`,
    [orgId, name]
  );
  if (rows.length === 0) return { error: `${rel.entityLabel} "${name}" was not found.` };
  if (rows.length > 1) {
    return { error: `${rel.entityLabel} "${name}" matches more than one record — cannot resolve automatically.` };
  }
  return { id: rows[0].id };
}

/** Resolves every column for one row (coercion + relation lookups) and reports the first
 *  problem found, so the caller can fail the row with one clear reason rather than a stack
 *  trace from whatever create function it would otherwise have been handed. */
async function resolveRowValues(
  orgId: string,
  columns: ImportColumn[],
  cells: Record<string, unknown>
): Promise<{ values: Record<string, unknown>; error?: string }> {
  const values: Record<string, unknown> = {};
  for (const column of columns) {
    const raw = getCell(cells, column.header);
    const key = column.targetField ?? column.field;

    if (column.relation) {
      const outcome = await resolveRelation(orgId, column, raw);
      if ("error" in outcome) {
        if (column.required) return { values, error: outcome.error };
        return { values, error: outcome.error }; // an unresolved name is always reported, even for an optional column, rather than silently dropped
      }
      if ("skipped" in outcome) {
        if (column.required) return { values, error: `${column.header} is required.` };
        continue;
      }
      values[key] = outcome.id;
      continue;
    }

    switch (column.kind) {
      case "boolean":
        values[key] = toBoolean(raw, Boolean(column.defaultValue));
        break;
      case "number":
      case "currency": {
        const n = toNumber(raw, column.defaultValue as number | undefined);
        if (column.required && (n === undefined || n === null)) {
          return { values, error: `${column.header} is required.` };
        }
        values[key] = n;
        break;
      }
      case "date":
        values[key] = toDate(raw);
        break;
      case "select":
        values[key] = toSelect(raw, column);
        break;
      default: {
        const text = toText(raw);
        if (!text && column.defaultValue !== undefined) {
          values[key] = column.defaultValue;
        } else {
          values[key] = text;
        }
        if (column.required && !toText(values[key])) {
          return { values, error: `${column.header} is required.` };
        }
      }
    }
  }
  return { values };
}

async function createOneRecord(
  entity: string,
  orgId: string,
  values: Record<string, unknown>,
  userId: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (entity === "customers" || entity === "vendors") {
    const row = await createRow(entity, orgId, values, { userId });
    return { ok: true, id: (row as { id?: string })?.id };
  }

  if (entity === "invoices" || entity === "sales-orders") {
    const cfg = documentConfigs[entity];
    const header: Record<string, unknown> = { ...values };
    delete header.description;
    delete header.quantity;
    delete header.rate;
    delete header.taxPercent;
    const body: DocumentBody = {
      header,
      lines: [
        {
          description: values.description as string,
          quantity: Number(values.quantity ?? 0),
          rate: Number(values.rate ?? 0),
        },
      ],
      taxPercent: Number(values.taxPercent ?? 0),
    };
    const result = await createDocument(cfg, orgId, body, { userId });
    if (!result.ok) return { ok: false, error: result.error ?? "Could not save this record." };
    return { ok: true, id: result.id };
  }

  if (entity === "receipts") {
    const body = values as ReceiptBody;
    const result = await createReceipt(orgId, body, { userId });
    if (!result.ok) return { ok: false, error: result.error ?? "Could not save this record." };
    return { ok: true, id: result.id };
  }

  return { ok: false, error: `Unsupported import entity "${entity}".` };
}

export async function runImport(
  orgId: string,
  userId: string,
  entity: string,
  fileName: string,
  buffer: Buffer
): Promise<ImportRunSummary> {
  const cfg = getImportConfig(entity);
  if (!cfg) throw new Error(`Unknown import entity "${entity}"`);

  const { rows } = await parseWorkbook(buffer);

  const outcomes: ImportRowOutcome[] = [];
  for (const row of rows) {
    const rawRowData: Record<string, unknown> = {};
    for (const column of cfg.columns) {
      const raw = getCell(row.cells, column.header);
      if (raw !== undefined) rawRowData[column.header] = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
    }

    try {
      const { values, error } = await resolveRowValues(orgId, cfg.columns, row.cells);
      if (error) {
        outcomes.push({ rowNumber: row.rowNumber, status: "failed", errorMessage: error, rowData: rawRowData });
        continue;
      }
      const result = await createOneRecord(entity, orgId, values, userId);
      if (!result.ok) {
        outcomes.push({
          rowNumber: row.rowNumber,
          status: "failed",
          errorMessage: result.error ?? "Could not save this record.",
          rowData: rawRowData,
        });
        continue;
      }
      outcomes.push({ rowNumber: row.rowNumber, status: "success", rowData: rawRowData, createdRecordId: result.id });
    } catch (err) {
      console.error("Import row failed", entity, row.rowNumber, err);
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unexpected error while importing this row.",
        rowData: rawRowData,
      });
    }
  }

  const successCount = outcomes.filter((o) => o.status === "success").length;
  const failureCount = outcomes.length - successCount;

  const client = await pool.connect();
  let logId = "";
  try {
    await client.query("BEGIN");
    const logResult = await client.query<{ id: string }>(
      `INSERT INTO import_logs (organization_id, entity, file_name, total_rows, success_count, failure_count, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [orgId, entity, fileName || null, outcomes.length, successCount, failureCount, userId || null]
    );
    logId = logResult.rows[0].id;
    for (const outcome of outcomes) {
      await client.query(
        `INSERT INTO import_log_rows (import_log_id, row_number, status, error_message, row_data, created_record_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          logId,
          outcome.rowNumber,
          outcome.status,
          outcome.errorMessage || null,
          JSON.stringify(outcome.rowData ?? {}),
          outcome.createdRecordId || null,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    logId,
    entity,
    fileName: fileName || null,
    totalRows: outcomes.length,
    successCount,
    failureCount,
    rows: outcomes,
  };
}
