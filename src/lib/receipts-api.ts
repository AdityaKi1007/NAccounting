import { pool, query, queryOne } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";
import { syncPaymentJournal } from "@/lib/auto-journal";

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
         (organization_id, payment_number, customer_id, payment_date, amount, bank_charges, payment_mode, bank_account_id, reference_number, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
