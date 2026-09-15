import { pool, query, queryOne } from "@/lib/db";
import { getOrCreateNumberSeries, claimNextNumber } from "@/lib/number-series";
import { syncBillJournal } from "@/lib/auto-journal";
import { idBelongsToOrg, idsBelongToOrg } from "@/lib/tenant-guard";
import { recordAuditLog, type AuditActor } from "@/lib/audit-log";

// Bespoke create/update for Bills — NOT the generic createDocument/updateDocument in
// documents-api.ts (which bills is still registered with in src/lib/documents.ts, kept
// around so nothing else that reads documentConfigs.bills breaks) because a bill line needs
// its own account_id/tax_rate_id/customer_id, none of which the generic document shape
// supports — see migrations/1761000000000_bills_payments_vendor_credits_gl.js for why this
// bill is a deliberate exception to the rest of the app's single-account-per-document
// convention. Modeled directly on receipts-api.ts's createReceipt (transactional header+
// lines insert, safe partial update) rather than documents-api.ts, since the per-line tax
// computation here is closer to what a receipt/expense already does than what a generic
// document does.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface BillLineInput {
  item_id?: string | null;
  description?: string;
  quantity?: number;
  rate?: number;
  account_id?: string | null;
  tax_rate_id?: string | null;
  customer_id?: string | null;
}

export interface BillBody {
  bill_number?: string;
  vendor_id?: string;
  bill_date?: string;
  due_date?: string;
  order_number?: string;
  permit_number?: string;
  subject?: string;
  payment_terms?: string;
  accounts_payable_account_id?: string | null;
  status?: string; // draft | open — never paid/partially_paid/overdue directly, see below
  notes?: string;
  /** Optional Property Master tags — see bills.project_id/unit_id (migration
   * 1770000000000_bills_payments_made_project_unit.js). */
  project_id?: string | null;
  unit_id?: string | null;
  lines?: BillLineInput[];
}

export interface BillActionResult {
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

/** Validates + computes amount/tax_amount for every line, using each line's own tax_rate_id
 * (not a single document-wide tax percent — see entities.ts's expenses.tax_rate_id for the
 * same per-record pattern this mirrors at the line level instead). Returns an error string
 * the very first time a line is missing an account, rather than silently dropping it — an
 * unaccounted-for line is exactly what would make syncBillJournal bail and post nothing. */
async function prepareLines(orgId: string, rawLines: BillLineInput[] | undefined): Promise<{ lines: PreparedLine[]; error?: string }> {
  const candidates = (rawLines ?? []).filter((l) => (l.description || l.item_id) && Number(l.quantity) > 0);
  if (candidates.length === 0) return { lines: [], error: "Add at least one line item." };

  // Every account_id/customer_id/item_id a line submits must belong to this org — only
  // tax_rate_id was ever checked before (below); an unvalidated account_id let a bill post
  // straight into another organization's chart of accounts (or leak another org's item/
  // customer names into this org's records via the DataTable ref-link).
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

export async function createBill(orgId: string, body: BillBody, actor: AuditActor = {}): Promise<BillActionResult> {
  if (!body.vendor_id) return { ok: false, error: "Vendor Name is required.", status: 400 };
  if (!body.bill_date) return { ok: false, error: "Bill Date is required.", status: 400 };

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
  if (body.project_id && !(await idBelongsToOrg("projects", body.project_id, orgId))) {
    return { ok: false, error: "Select a valid Project.", status: 400 };
  }
  if (body.unit_id && !(await idBelongsToOrg("inventory", body.unit_id, orgId))) {
    return { ok: false, error: "Select a valid Unit.", status: 400 };
  }

  const requestedStatus = body.status === "draft" ? "draft" : "open";

  let number = body.bill_number?.trim();
  if (!number) {
    const series = await getOrCreateNumberSeries(orgId, "bills");
    if (series.mode === "manual") return { ok: false, error: "Bill# is required.", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (!number) number = await claimNextNumber(client, orgId, "bills");

    const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    const taxTotal = round2(lines.reduce((sum, l) => sum + l.taxAmount, 0));
    const total = round2(subtotal + taxTotal);

    const headerResult = await client.query<{ id: string }>(
      `INSERT INTO bills
         (organization_id, bill_number, vendor_id, bill_date, due_date, order_number, permit_number,
          subject, payment_terms, accounts_payable_account_id, status, subtotal, tax_total, total,
          balance_due, notes, project_id, unit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        orgId,
        number,
        body.vendor_id,
        body.bill_date,
        body.due_date || null,
        body.order_number || null,
        body.permit_number || null,
        body.subject || null,
        body.payment_terms || "due_on_receipt",
        body.accounts_payable_account_id || null,
        requestedStatus,
        subtotal,
        taxTotal,
        total,
        total,
        body.notes || null,
        body.project_id || null,
        body.unit_id || null,
      ]
    );
    const billId = headerResult.rows[0].id;

    for (const l of lines) {
      await client.query(
        `INSERT INTO bill_items
           (bill_id, item_id, description, quantity, rate, amount, account_id, tax_rate_id, tax_amount, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [billId, l.item_id, l.description, l.quantity, l.rate, l.amount, l.account_id, l.tax_rate_id, l.taxAmount, l.customer_id]
      );
    }

    await syncBillJournal(client, orgId, billId);

    const auditNewRow = (await client.query(`SELECT * FROM bills WHERE id = $1`, [billId])).rows[0] as
      | Record<string, unknown>
      | undefined;

    await client.query("COMMIT");

    await recordAuditLog({
      orgId,
      actor,
      action: "create",
      module: "bills",
      entityId: billId,
      entityLabel: auditNewRow ? String(auditNewRow.bill_number ?? "") : null,
      oldData: null,
      newData: auditNewRow ?? null,
    });

    return { ok: true, id: billId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? "Database schema is out of date for Bills — run `npm run migrate:up` and try again."
        : "Could not save this bill.";
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}

export async function updateBill(
  orgId: string,
  id: string,
  body: BillBody,
  actor: AuditActor = {}
): Promise<BillActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(`SELECT * FROM bills WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [
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

    // A changed vendor_id/accounts_payable_account_id/project_id/unit_id must belong to this
    // org too — createBill above already checks these at creation time, but an edit that
    // reassigns them went unchecked until now.
    if (body.vendor_id && !(await idBelongsToOrg("vendors", body.vendor_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid vendor.", status: 400 };
    }
    if (body.accounts_payable_account_id && !(await idBelongsToOrg("accounts", body.accounts_payable_account_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid Accounts Payable account.", status: 400 };
    }
    if (body.project_id && !(await idBelongsToOrg("projects", body.project_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid Project.", status: 400 };
    }
    if (body.unit_id && !(await idBelongsToOrg("inventory", body.unit_id, orgId))) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid Unit.", status: 400 };
    }

    const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
    const taxTotal = round2(lines.reduce((sum, l) => sum + l.taxAmount, 0));
    const total = round2(subtotal + taxTotal);
    // Same re-basing trick documents-api.ts's updateDocument uses: whatever's already been
    // paid against this bill (the gap between its current total and current balance_due)
    // survives an unrelated edit instead of being wiped back to the full new total.
    const alreadyApplied = Math.max(0, round2(Number(current.total) - Number(current.balance_due)));
    const balanceDue = Math.max(0, round2(total - alreadyApplied));

    const requestedStatus = body.status === "draft" ? "draft" : body.status || current.status;

    await client.query(
      `UPDATE bills SET
         vendor_id = $3, bill_date = $4, due_date = $5, order_number = $6, permit_number = $7,
         subject = $8, payment_terms = $9, accounts_payable_account_id = $10, status = $11,
         subtotal = $12, tax_total = $13, total = $14, balance_due = $15, notes = $16,
         project_id = $17, unit_id = $18
       WHERE organization_id = $1 AND id = $2`,
      [
        orgId,
        id,
        body.vendor_id || current.vendor_id,
        body.bill_date || current.bill_date,
        body.due_date || null,
        body.order_number || null,
        body.permit_number || null,
        body.subject || null,
        body.payment_terms || current.payment_terms,
        body.accounts_payable_account_id || null,
        requestedStatus,
        subtotal,
        taxTotal,
        total,
        balanceDue,
        body.notes || null,
        body.project_id || null,
        body.unit_id || null,
      ]
    );

    await client.query(`DELETE FROM bill_items WHERE bill_id = $1`, [id]);
    for (const l of lines) {
      await client.query(
        `INSERT INTO bill_items
           (bill_id, item_id, description, quantity, rate, amount, account_id, tax_rate_id, tax_amount, customer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, l.item_id, l.description, l.quantity, l.rate, l.amount, l.account_id, l.tax_rate_id, l.taxAmount, l.customer_id]
      );
    }

    await syncBillJournal(client, orgId, id);

    const auditNewRow = (await client.query(`SELECT * FROM bills WHERE id = $1`, [id])).rows[0] as
      | Record<string, unknown>
      | undefined;

    await client.query("COMMIT");

    await recordAuditLog({
      orgId,
      actor,
      action: "update",
      module: "bills",
      entityId: id,
      entityLabel: auditNewRow ? String(auditNewRow.bill_number ?? "") : null,
      oldData: current as Record<string, unknown>,
      newData: auditNewRow ?? null,
    });

    return { ok: true, id };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not update this bill.", status: 500 };
  } finally {
    client.release();
  }
}

// Voids a bill — a dedicated action rather than routing through updateBill above, because
// updateBill always requires (and unconditionally deletes/re-inserts) the full line list; a
// pure status change has no business touching bill_items at all. Guarded to only ever void a
// bill nothing has been paid against yet (balance_due still equals total): once even one
// payment has been applied, voiding would leave that Payment Made allocated against a
// cancelled bill with no way to reconcile it back, so the user has to unapply/delete the
// payment first, same "don't leave the books in an inconsistent state" philosophy as every
// other guard in this codebase (e.g. purchase-orders' cancel-items route blocking once a PO's
// already been converted to a bill). Clears balance_due to 0 (nothing is owed on a voided
// bill) but deliberately leaves subtotal/tax_total/total untouched — the historical record of
// what the bill said, same as a voided Purchase Order keeps its own totals visible.
export async function voidBill(orgId: string, id: string, actor: AuditActor = {}): Promise<BillActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(`SELECT * FROM bills WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [
      orgId,
      id,
    ]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Not found", status: 404 };
    }
    if (current.status === "void") {
      await client.query("ROLLBACK");
      return { ok: false, error: "This bill is already void.", status: 400 };
    }
    if (round2(Number(current.balance_due)) < round2(Number(current.total))) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "This bill has payments applied to it — remove them before voiding.",
        status: 400,
      };
    }

    await client.query(`UPDATE bills SET status = 'void', balance_due = 0 WHERE organization_id = $1 AND id = $2`, [
      orgId,
      id,
    ]);
    await syncBillJournal(client, orgId, id);

    const auditNewRow = (await client.query(`SELECT * FROM bills WHERE id = $1`, [id])).rows[0] as
      | Record<string, unknown>
      | undefined;

    await client.query("COMMIT");

    await recordAuditLog({
      orgId,
      actor,
      action: "update",
      module: "bills",
      entityId: id,
      entityLabel: auditNewRow ? String(auditNewRow.bill_number ?? "") : null,
      oldData: current as Record<string, unknown>,
      newData: auditNewRow ?? null,
    });

    return { ok: true, id };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not void this bill.", status: 500 };
  } finally {
    client.release();
  }
}

export async function getBillForEdit(orgId: string, id: string) {
  const header = await queryOne<Record<string, unknown>>(`SELECT * FROM bills WHERE id = $1 AND organization_id = $2`, [
    id,
    orgId,
  ]);
  if (!header) return null;
  const lines = await query(`SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY id`, [id]);
  return { header, lines };
}
