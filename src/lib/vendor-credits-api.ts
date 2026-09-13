import { pool, query, queryOne } from "@/lib/db";
import { claimNextNumber, getOrCreateNumberSeries } from "@/lib/number-series";
import { syncVendorCreditJournal } from "@/lib/auto-journal";
import { idBelongsToOrg, idsBelongToOrg } from "@/lib/tenant-guard";

// Bespoke create/update for Vendor Credits — this document type never had line items at all
// before (vendor_credits was a plain flat total+reason record), so this is a from-scratch
// build, not a generic-shape override like bills-api.ts. Modeled directly on bills-api.ts:
// same per-line account_id/tax_rate_id/customer_id shape, same subtotal/tax_total/total
// computation, because a vendor credit's "proper accounting" (what this was built for) means
// reversing the exact accounts a bill would have posted to — see auto-journal.ts's
// syncVendorCreditJournal for the actual GL entries this produces.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface VendorCreditLineInput {
  item_id?: string | null;
  description?: string;
  quantity?: number;
  rate?: number;
  account_id?: string | null;
  tax_rate_id?: string | null;
  customer_id?: string | null;
}

export interface VendorCreditBody {
  credit_note_number?: string;
  vendor_id?: string;
  credit_date?: string;
  order_number?: string;
  subject?: string;
  accounts_payable_account_id?: string | null;
  discount_percent?: number;
  status?: string; // open | closed
  reason?: string;
  lines?: VendorCreditLineInput[];
}

export interface VendorCreditActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

interface PreparedLine {
  item_id: string | null;
  description: string | null;
  quantity: number;
  rate: number;
  account_id: string;
  tax_rate_id: string | null;
  amount: number;
  taxAmount: number;
  customer_id: string | null;
}

async function prepareLines(orgId: string, rawLines: VendorCreditLineInput[] | undefined): Promise<{ lines: PreparedLine[]; error?: string }> {
  const candidates = (rawLines ?? []).filter((l) => (l.description || l.item_id) && Number(l.quantity) > 0);
  if (candidates.length === 0) return { lines: [], error: "Add at least one line item." };

  // Same reasoning as bills-api.ts's prepareLines: only tax_rate_id was ever checked before
  // (below) — account_id/customer_id/item_id must belong to this org too.
  const lineAccountIds = [...new Set(candidates.map((l) => l.account_id).filter((v): v is string => Boolean(v)))];
  if (lineAccountIds.length > 0 && !(await idsBelongToOrg("accounts", lineAccountIds, orgId))) {
    return { lines: [], error: "One or more selected Accounts are invalid." };
  }
  const lineCustomerIds = [...new Set(candidates.map((l) => l.customer_id).filter((v): v is string => Boolean(v)))];
  if (lineCustomerIds.length > 0 && !(await idsBelongToOrg("customers", lineCustomerIds, orgId))) {
    return { lines: [], error: "One or more selected Customers are invalid." };
  }
  const lineItemIds = [...new Set(candidates.map((l) => l.item_id).filter((v): v is string => Boolean(v)))];
  if (lineItemIds.length > 0 && !(await idsBelongToOrg("items", lineItemIds, orgId))) {
    return { lines: [], error: "One or more selected Items are invalid." };
  }

  const taxRateIds = [...new Set(candidates.map((l) => l.tax_rate_id).filter((v): v is string => Boolean(v)))];
  const rateMap = new Map<string, number>();
  if (taxRateIds.length > 0) {
    const rows = await query<{ id: string; rate: string }>(
      `SELECT id, rate FROM tax_rates WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [orgId, taxRateIds]
    );
    for (const r of rows) rateMap.set(r.id, Number(r.rate));
  }

  const lines: PreparedLine[] = [];
  for (const l of candidates) {
    if (!l.account_id) return { lines: [], error: "Select an Account for every line item." };
    const quantity = Number(l.quantity ?? 0);
    const rate = Number(l.rate ?? 0);
    const amount = round2(quantity * rate);
    const taxRate = l.tax_rate_id ? rateMap.get(l.tax_rate_id) ?? 0 : 0;
    const taxAmount = round2((amount * taxRate) / 100);
    lines.push({
      item_id: l.item_id || null,
      description: l.description || null,
      quantity,
      rate,
      account_id: l.account_id,
      tax_rate_id: l.tax_rate_id || null,
      amount,
      taxAmount,
      customer_id: l.customer_id || null,
    });
  }
  return { lines };
}

function totals(lines: PreparedLine[], discountPercent: number) {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.taxAmount, 0));
  const discount = Math.min(Math.max(discountPercent || 0, 0), 100);
  const discountAmount = round2((subtotal * discount) / 100);
  const total = round2(subtotal - discountAmount + taxTotal);
  return { subtotal, taxTotal, total, discount };
}

export async function createVendorCredit(orgId: string, body: VendorCreditBody): Promise<VendorCreditActionResult> {
  if (!body.vendor_id) return { ok: false, error: "Vendor Name is required.", status: 400 };
  if (!body.credit_date) return { ok: false, error: "Vendor Credit Date is required.", status: 400 };

  const vendor = await queryOne<{ id: string }>(`SELECT id FROM vendors WHERE id = $1 AND organization_id = $2`, [
    body.vendor_id,
    orgId,
  ]);
  if (!vendor) return { ok: false, error: "Select a valid vendor.", status: 400 };

  const { lines, error } = await prepareLines(orgId, body.lines);
  if (error) return { ok: false, error, status: 400 };

  if (body.accounts_payable_account_id && !(await idBelongsToOrg("accounts", body.accounts_payable_account_id, orgId))) {
    return { ok: false, error: "Select a valid Accounts Payable account.", status: 400 };
  }

  const { subtotal, taxTotal, total, discount } = totals(lines, Number(body.discount_percent ?? 0));
  const requestedStatus = body.status === "closed" ? "closed" : "open";

  let number = body.credit_note_number?.trim();
  if (!number) {
    const series = await getOrCreateNumberSeries(orgId, "vendor-credits");
    if (series.mode === "manual") return { ok: false, error: "Vendor Credit# is required.", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!number) number = await claimNextNumber(client, orgId, "vendor-credits");

    const headerResult = await client.query<{ id: string }>(
      `INSERT INTO vendor_credits
         (organization_id, credit_note_number, vendor_id, credit_date, order_number, subject,
          accounts_payable_account_id, discount_percent, status, subtotal, tax_total, total, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        orgId,
        number,
        body.vendor_id,
        body.credit_date,
        body.order_number || null,
        body.subject || null,
        body.accounts_payable_account_id || null,
        discount,
        requestedStatus,
        subtotal,
        taxTotal,
        total,
        body.reason || null,
      ]
    );
    const creditId = headerResult.rows[0].id;

    for (const l of lines) {
      await client.query(
        `INSERT INTO vendor_credit_items
           (vendor_credit_id, item_id, description, quantity, rate, amount, account_id, tax_rate_id, tax_amount, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [creditId, l.item_id, l.description, l.quantity, l.rate, l.amount, l.account_id, l.tax_rate_id, l.taxAmount, l.customer_id]
      );
    }

    await syncVendorCreditJournal(client, orgId, creditId);

    await client.query("COMMIT");
    return { ok: true, id: creditId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? "Database schema is out of date for Vendor Credits — run `npm run migrate:up` and try again."
        : "Could not save this vendor credit.";
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}

export async function updateVendorCredit(orgId: string, id: string, body: VendorCreditBody): Promise<VendorCreditActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(`SELECT * FROM vendor_credits WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [
      orgId,
      id,
    ]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found", status: 404 };
    }

    const { lines, error } = await prepareLines(orgId, body.lines);
    if (error) {
      await client.query("ROLLBACK");
      return { ok: false, error, status: 400 };
    }

    // A changed vendor_id/accounts_payable_account_id must belong to this org too — createVendorCredit
    // above already checks these at creation time, but an edit that reassigns them went unchecked.
    if (body.vendor_id && !(await idBelongsToOrg("vendors", body.vendor_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid vendor.", status: 400 };
    }
    if (body.accounts_payable_account_id && !(await idBelongsToOrg("accounts", body.accounts_payable_account_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid Accounts Payable account.", status: 400 };
    }

    const { subtotal, taxTotal, total, discount } = totals(lines, Number(body.discount_percent ?? current.discount_percent ?? 0));
    const requestedStatus = body.status === "closed" ? "closed" : body.status || current.status;

    await client.query(
      `UPDATE vendor_credits SET
         vendor_id = $3, credit_date = $4, order_number = $5, subject = $6, accounts_payable_account_id = $7,
         discount_percent = $8, status = $9, subtotal = $10, tax_total = $11, total = $12, reason = $13
       WHERE organization_id = $1 AND id = $2`,
      [
        orgId,
        id,
        body.vendor_id || current.vendor_id,
        body.credit_date || current.credit_date,
        body.order_number || null,
        body.subject || null,
        body.accounts_payable_account_id || null,
        discount,
        requestedStatus,
        subtotal,
        taxTotal,
        total,
        body.reason || null,
      ]
    );

    await client.query(`DELETE FROM vendor_credit_items WHERE vendor_credit_id = $1`, [id]);
    for (const l of lines) {
      await client.query(
        `INSERT INTO vendor_credit_items
           (vendor_credit_id, item_id, description, quantity, rate, amount, account_id, tax_rate_id, tax_amount, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, l.item_id, l.description, l.quantity, l.rate, l.amount, l.account_id, l.tax_rate_id, l.taxAmount, l.customer_id]
      );
    }

    await syncVendorCreditJournal(client, orgId, id);

    await client.query("COMMIT");
    return { ok: true, id };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not update this vendor credit.", status: 500 };
  } finally {
    client.release();
  }
}

export async function getVendorCreditForEdit(orgId: string, id: string) {
  const header = await queryOne<Record<string, unknown>>(`SELECT * FROM vendor_credits WHERE id = $1 AND organization_id = $2`, [
    id,
    orgId,
  ]);
  if (!header) return null;
  const lines = await query(`SELECT * FROM vendor_credit_items WHERE vendor_credit_id = $1 ORDER BY id`, [id]);
  return { header, lines };
}
