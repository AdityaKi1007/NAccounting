import { pool, queryOne } from "@/lib/db";

export interface NumberSeriesRow {
  id: string;
  organization_id: string;
  entity_key: string;
  mode: "auto" | "manual";
  prefix: string;
  next_number: number;
  padding: number;
  restart_yearly: boolean;
  last_reset_year: number | null;
}

const DEFAULT_PREFIXES: Record<string, string> = {
  quotes: "QT-",
  invoices: "INV-",
  bills: "BILL-",
  "sales-orders": "SO-",
  "purchase-orders": "PO-",
  "credit-notes": "CN-",
  "debit-notes": "DN-",
  "payments-received": "PMT-",
  "payments-made": "PAY-",
  "vendor-credits": "VC-",
  "delivery-challans": "DC-",
  "manual-journals": "JNL-",
};

/** Every module with a real sequential number series, in the order the Transaction Number
 * Series settings page (src/components/settings/NumberSeriesSettings.tsx) lists them —
 * mirrors Zoho Books' own "Default Series" table, minus the two modules this build doesn't
 * implement (Retainer Invoice, Sales Return). `entityKey` is the number_series.entity_key /
 * DEFAULT_PREFIXES key above; `label` is what the settings table and each module's own
 * "Configure" modal show. */
export const NUMBER_SERIES_MODULES: { entityKey: string; label: string }[] = [
  { entityKey: "quotes", label: "Quote" },
  { entityKey: "sales-orders", label: "Sales Order" },
  { entityKey: "invoices", label: "Invoice" },
  { entityKey: "credit-notes", label: "Credit Note" },
  { entityKey: "debit-notes", label: "Debit Note" },
  { entityKey: "delivery-challans", label: "Delivery Challan" },
  { entityKey: "payments-received", label: "Customer Payment" },
  { entityKey: "purchase-orders", label: "Purchase Order" },
  { entityKey: "bills", label: "Bill" },
  { entityKey: "vendor-credits", label: "Vendor Credits" },
  { entityKey: "payments-made", label: "Vendor Payment" },
  { entityKey: "manual-journals", label: "Journal" },
];

/** Fetches an org's numbering preferences for a document type, seeding sensible defaults on first use. */
export async function getOrCreateNumberSeries(orgId: string, entityKey: string): Promise<NumberSeriesRow> {
  const existing = await queryOne<NumberSeriesRow>(
    `SELECT * FROM number_series WHERE organization_id = $1 AND entity_key = $2`,
    [orgId, entityKey]
  );
  if (existing) return existing;

  const prefix = DEFAULT_PREFIXES[entityKey] ?? `${entityKey.toUpperCase()}-`;
  const created = await queryOne<NumberSeriesRow>(
    `INSERT INTO number_series (organization_id, entity_key, mode, prefix, next_number, padding, restart_yearly)
     VALUES ($1, $2, 'auto', $3, 1, 6, false)
     ON CONFLICT (organization_id, entity_key) DO UPDATE SET entity_key = EXCLUDED.entity_key
     RETURNING *`,
    [orgId, entityKey, prefix]
  );
  return created as NumberSeriesRow;
}

export function formatSeriesNumber(series: Pick<NumberSeriesRow, "prefix" | "next_number" | "padding">) {
  return `${series.prefix}${String(series.next_number).padStart(series.padding, "0")}`;
}

interface TxClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: NumberSeriesRow[] }>;
}

/**
 * Atomically claims and formats the next number for a document type, applying the
 * calendar-year reset when "restart yearly" is enabled. Must be called with a
 * transactional client so the row lock is held for the duration of the insert.
 */
export async function claimNextNumber(client: TxClient, orgId: string, entityKey: string): Promise<string> {
  const prefixDefault = DEFAULT_PREFIXES[entityKey] ?? `${entityKey.toUpperCase()}-`;

  await client.query(
    `INSERT INTO number_series (organization_id, entity_key, mode, prefix, next_number, padding, restart_yearly)
     VALUES ($1, $2, 'auto', $3, 1, 6, false)
     ON CONFLICT (organization_id, entity_key) DO NOTHING`,
    [orgId, entityKey, prefixDefault]
  );

  const result = await client.query(
    `SELECT * FROM number_series WHERE organization_id = $1 AND entity_key = $2 FOR UPDATE`,
    [orgId, entityKey]
  );
  const series = result.rows[0];

  const currentYear = new Date().getFullYear();
  const nextNumber = series.restart_yearly && series.last_reset_year !== currentYear ? 1 : series.next_number;
  const formatted = formatSeriesNumber({ ...series, next_number: nextNumber });

  await client.query(`UPDATE number_series SET next_number = $1, last_reset_year = $2 WHERE id = $3`, [
    nextNumber + 1,
    currentYear,
    series.id,
  ]);

  return formatted;
}

export async function updateNumberSeries(
  orgId: string,
  entityKey: string,
  input: { mode: "auto" | "manual"; prefix: string; next_number: number; restart_yearly: boolean }
): Promise<NumberSeriesRow> {
  await getOrCreateNumberSeries(orgId, entityKey);
  const result = await pool.query(
    `UPDATE number_series SET mode = $1, prefix = $2, next_number = $3, restart_yearly = $4
     WHERE organization_id = $5 AND entity_key = $6 RETURNING *`,
    [input.mode, input.prefix, input.next_number, input.restart_yearly, orgId, entityKey]
  );
  return result.rows[0];
}
