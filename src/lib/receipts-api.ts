import type { PoolClient } from "pg";
import { pool, query, queryOne } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";
import { syncPaymentJournal } from "@/lib/auto-journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Shared create logic for a payment / receipt: allocating one payment across zero or more
// unpaid invoices and (when saved as Paid) reducing each invoice's balance in the same
// transaction. Pulled out of /api/payments-received/route.ts so /api/v1/receipts can call
// the exact same logic a third-party system's "record a payment" call needs — see that
// route's own comment for why this can't just be the generic entity CRUD route.

export interface ReceiptBody {
  customer_id?: string;
  payment_number?: string;
  payment_date?: string;
  amount?: number;
  bank_charges?: number;
  payment_mode?: string;
  bank_account_id?: string;
  reference_number?: string;
  notes?: string;
  status?: string;
  allocations?: { invoice_id: string; amount: number }[];
  /** Optional Property Master tags — see payments_received.project_id/unit_id. */
  project_id?: string | null;
  unit_id?: string | null;
}

export interface ReceiptActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

export async function createReceipt(orgId: string, body: ReceiptBody): Promise<ReceiptActionResult> {
  if (!body.customer_id) {
    return { ok: false, error: "Customer is required.", status: 400 };
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount Received must be greater than 0.", status: 400 };
  }
  if (!body.bank_account_id) {
    return { ok: false, error: "Deposit To account is required.", status: 400 };
  }

  const customer = await queryOne<{ id: string }>(
    `SELECT id FROM customers WHERE id = $1 AND organization_id = $2`,
    [body.customer_id, orgId]
  );
  if (!customer) return { ok: false, error: "Select a valid customer.", status: 400 };

  const bankAccount = await queryOne<{ id: string }>(
    `SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`,
    [body.bank_account_id, orgId]
  );
  if (!bankAccount) return { ok: false, error: "Select a valid Deposit To account.", status: 400 };

  const status = body.status === "draft" ? "draft" : "paid";
  const allocations = (body.allocations ?? []).filter(
    (a) => a.invoice_id && Number.isFinite(Number(a.amount)) && Number(a.amount) > 0
  );

  const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  if (totalAllocated > amount + 0.005) {
    return { ok: false, error: "Total payment applied to invoices cannot exceed Amount Received.", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentNumber = body.payment_number?.trim() || (await claimNextNumber(client, orgId, "payments-received"));

    const paymentResult = await client.query(
      `INSERT INTO payments_received
         (organization_id, payment_number, customer_id, payment_date, amount, bank_charges, payment_mode, bank_account_id, reference_number, notes, status, project_id, unit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        orgId,
        paymentNumber,
        body.customer_id,
        body.payment_date || new Date().toISOString().slice(0, 10),
        amount,
        Number(body.bank_charges) || 0,
        body.payment_mode || "cash",
        body.bank_account_id,
        body.reference_number || null,
        body.notes || null,
        status,
        body.project_id || null,
        body.unit_id || null,
      ]
    );
    const paymentId = paymentResult.rows[0].id as string;

    for (const alloc of allocations) {
      const invoiceResult = await client.query(
        `SELECT id, balance_due FROM invoices
         WHERE id = $1 AND organization_id = $2 AND customer_id = $3
         FOR UPDATE`,
        [alloc.invoice_id, orgId, body.customer_id]
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) continue;

      const currentDue = Number(invoice.balance_due);
      const applied = Math.min(Number(alloc.amount), currentDue);
      if (applied <= 0) continue;

      await client.query(
        `INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1, $2, $3)`,
        [paymentId, alloc.invoice_id, applied]
      );

      if (status === "paid") {
        const newDue = Math.max(0, currentDue - applied);
        const newStatus = newDue <= 0.005 ? "paid" : "partially_paid";
        await client.query(`UPDATE invoices SET balance_due = $1, status = $2 WHERE id = $3`, [
          newDue,
          newStatus,
          alloc.invoice_id,
        ]);
      }
    }

    await syncPaymentJournal(client, orgId, paymentId);

    await client.query("COMMIT");
    return { ok: true, id: paymentId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? "Database schema is out of date for Payments Received — run `npm run migrate:up` and try again."
        : "Could not save this payment.";
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}

/** Adds the amount back to one invoice's balance_due (capped at its total) and re-derives
 * status the same way voidCreditOrDebitNote does for the credit/debit note case — this is
 * the shared "undo one applied amount" primitive both unapplyReceiptAllocation and the
 * payments-received DELETE-route fix below use, so an invoice's balance can never end up
 * inconsistent depending on which path reversed it. Caller must already hold FOR UPDATE (or
 * be inside the same transaction that will) on the invoice — this just issues the UPDATE. */
export async function restoreInvoiceBalance(client: PoolClient, orgId: string, invoiceId: string, amount: number) {
  const inv = await client.query<{ total: string; balance_due: string }>(
    `SELECT total, balance_due FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [invoiceId, orgId]
  );
  if (!inv.rowCount) return;
  const total = round2(Number(inv.rows[0].total));
  const currentDue = round2(Number(inv.rows[0].balance_due));
  const newDue = Math.min(total, round2(currentDue + amount));
  const newStatus = newDue <= 0.005 ? "paid" : newDue < total ? "partially_paid" : "sent";
  await client.query(`UPDATE invoices SET balance_due = $1, status = $2 WHERE id = $3 AND organization_id = $4`, [
    newDue,
    newStatus,
    invoiceId,
    orgId,
  ]);
}

/** Reverses every allocation a receipt currently has against invoices — used right before
 * deleting a payments_received row (see the payments-received branch of
 * /api/entities/[entity]/[id]/route.ts's DELETE handler) so a deleted receipt doesn't leave
 * every invoice it had been applied to permanently stuck at whatever balance_due/status the
 * payment last left them at. A no-op for a receipt that was never Paid (its allocations, if
 * any, never touched an invoice's balance in the first place — see createReceipt above). Must
 * be called BEFORE the payment row is deleted (payment_allocations cascade-deletes with it). */
export async function reverseReceiptApplication(client: PoolClient, orgId: string, paymentId: string) {
  const payment = await client.query<{ status: string }>(
    `SELECT status FROM payments_received WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [paymentId, orgId]
  );
  if (!payment.rowCount || payment.rows[0].status !== "paid") return;

  const allocations = await client.query<{ invoice_id: string; amount: string }>(
    `SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = $1`,
    [paymentId]
  );
  for (const a of allocations.rows) {
    await restoreInvoiceBalance(client, orgId, a.invoice_id, round2(Number(a.amount)));
  }
}

/** Applies more of an already-recorded, Paid receipt to one more invoice — the "application"
 * half of the receipt apply/unapply API (see unapplyReceiptAllocation below for the reverse).
 * Distinct from the `allocations` array on createReceipt: this operates on a receipt that
 * already exists, e.g. one originally recorded with no allocations at all (Zoho's "excess
 * payment") or one that still has headroom left after its first round of allocations. Merges
 * into an existing payment_allocations row for the same invoice rather than creating a
 * second one, so a given receipt/invoice pair is always at most one row. */
export async function applyReceiptToInvoice(
  orgId: string,
  paymentId: string,
  invoiceId: string,
  amount: number
): Promise<ReceiptActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount must be greater than 0.", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<{ id: string; customer_id: string; amount: string; status: string }>(
      `SELECT id, customer_id, amount, status FROM payments_received WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [paymentId, orgId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Receipt not found.", status: 404 };
    }
    if (payment.status !== "paid") {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only a Paid receipt can be applied to an invoice.", status: 400 };
    }

    const allocSum = await client.query<{ s: string | null }>(
      `SELECT SUM(amount) AS s FROM payment_allocations WHERE payment_id = $1`,
      [paymentId]
    );
    const alreadyApplied = round2(Number(allocSum.rows[0]?.s ?? 0));
    const unapplied = round2(Number(payment.amount) - alreadyApplied);
    if (round2(amount) > unapplied + 0.005) {
      await client.query("ROLLBACK");
      return { ok: false, error: `Only ${unapplied} is unapplied on this receipt.`, status: 400 };
    }

    const invoiceResult = await client.query<{ id: string; balance_due: string }>(
      `SELECT id, balance_due FROM invoices WHERE id = $1 AND organization_id = $2 AND customer_id = $3 FOR UPDATE`,
      [invoiceId, orgId, payment.customer_id]
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Invoice not found for this receipt's customer.", status: 404 };
    }

    const currentDue = round2(Number(invoice.balance_due));
    const applied = Math.min(round2(amount), currentDue);
    if (applied <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This invoice has no remaining balance to apply to.", status: 400 };
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM payment_allocations WHERE payment_id = $1 AND invoice_id = $2`,
      [paymentId, invoiceId]
    );
    if (existing.rowCount) {
      await client.query(`UPDATE payment_allocations SET amount = amount + $1 WHERE id = $2`, [applied, existing.rows[0].id]);
    } else {
      await client.query(`INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1, $2, $3)`, [
        paymentId,
        invoiceId,
        applied,
      ]);
    }

    const newDue = Math.max(0, round2(currentDue - applied));
    const newStatus = newDue <= 0.005 ? "paid" : "partially_paid";
    await client.query(`UPDATE invoices SET balance_due = $1, status = $2 WHERE id = $3`, [newDue, newStatus, invoiceId]);

    await client.query("COMMIT");
    return { ok: true, id: paymentId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not apply this receipt.", status: 500 };
  } finally {
    client.release();
  }
}

/** Reverses one specific invoice allocation on a receipt — the receipt itself and any of its
 * OTHER allocations are untouched, so this is a true partial "unapplication", not a delete.
 * The invoice's balance_due goes back up by exactly what this one allocation had applied
 * (restoreInvoiceBalance, same reversal primitive the DELETE-route fix uses), and the freed
 * amount becomes available on the receipt to apply elsewhere via applyReceiptToInvoice above. */
export async function unapplyReceiptAllocation(orgId: string, paymentId: string, invoiceId: string): Promise<ReceiptActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM payments_received WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [paymentId, orgId]
    );
    if (!paymentResult.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Receipt not found.", status: 404 };
    }

    const allocResult = await client.query<{ id: string; amount: string }>(
      `SELECT id, amount FROM payment_allocations WHERE payment_id = $1 AND invoice_id = $2`,
      [paymentId, invoiceId]
    );
    if (!allocResult.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This receipt isn't applied to that invoice.", status: 404 };
    }

    const amount = round2(Number(allocResult.rows[0].amount));
    await client.query(`DELETE FROM payment_allocations WHERE id = $1`, [allocResult.rows[0].id]);

    if (paymentResult.rows[0].status === "paid") {
      await restoreInvoiceBalance(client, orgId, invoiceId, amount);
    }

    await client.query("COMMIT");
    return { ok: true, id: paymentId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not unapply this receipt.", status: 500 };
  } finally {
    client.release();
  }
}

export async function listReceipts(orgId: string, opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Math.trunc(opts.offset ?? 0), 0);
  return query(
    `SELECT * FROM payments_received WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [orgId, limit, offset]
  );
}

export async function getReceipt(orgId: string, id: string) {
  const header = await queryOne(`SELECT * FROM payments_received WHERE organization_id = $1 AND id = $2`, [orgId, id]);
  if (!header) return null;
  const allocations = await query(
    `SELECT pa.invoice_id, i.invoice_number, pa.amount
     FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id
     WHERE pa.payment_id = $1 ORDER BY pa.id`,
    [id]
  );
  return { header, allocations };
}

// Deliberately narrow: amount/allocations/status touch invoice balances and the auto-journal,
// so changing those goes through a full payment edit in the app itself. The API can safely
// patch the metadata fields below without risking balance_due getting out of sync.
export async function updateReceiptMeta(
  orgId: string,
  id: string,
  body: Pick<ReceiptBody, "payment_date" | "reference_number" | "notes" | "payment_mode">
): Promise<ReceiptActionResult> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 3;
  if (body.payment_date !== undefined) {
    fields.push(`payment_date = $${i++}`);
    values.push(body.payment_date);
  }
  if (body.reference_number !== undefined) {
    fields.push(`reference_number = $${i++}`);
    values.push(body.reference_number || null);
  }
  if (body.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    values.push(body.notes || null);
  }
  if (body.payment_mode !== undefined) {
    fields.push(`payment_mode = $${i++}`);
    values.push(body.payment_mode);
  }
  if (fields.length === 0) return { ok: false, error: "Nothing to update.", status: 400 };

  const result = await pool.query(
    `UPDATE payments_received SET ${fields.join(", ")} WHERE organization_id = $1 AND id = $2 RETURNING id`,
    [orgId, id, ...values]
  );
  if (result.rowCount === 0) return { ok: false, error: "Not found", status: 404 };
  return { ok: true, id };
}
