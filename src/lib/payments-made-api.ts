import type { PoolClient } from "pg";
import { pool, query, queryOne } from "@/lib/db";
import { claimNextNumber } from "@/lib/number-series";
import { syncPaymentMadeJournal, recomputeBillBalance } from "@/lib/auto-journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The vendor-side mirror of receipts-api.ts, built for the "settling against open bills"
// half of the request: a single payment made can now be applied across multiple open bills
// (Zoho's "Unpaid Bills" table with a per-row Payment column), the same way Record Payment
// already works for customers/invoices — see RecordPaymentMadeForm.tsx. The old payments_made
// .bill_id column (a single FK, one payment -> one bill) is left in place for any pre-existing
// rows but is no longer written by this flow; bill_payment_allocations is the source of truth
// going forward, and recomputeBillBalance in auto-journal.ts always re-derives a bill's
// balance_due/status from that table rather than from bill_id.

export interface PaymentMadeBody {
  vendor_id?: string;
  payment_number?: string;
  payment_date?: string;
  amount?: number;
  payment_mode?: string;
  bank_account_id?: string;
  reference_number?: string;
  notes?: string;
  status?: string;
  allocations?: { bill_id: string; amount: number }[];
}

export interface PaymentMadeActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

export async function createPaymentMade(orgId: string, body: PaymentMadeBody): Promise<PaymentMadeActionResult> {
  if (!body.vendor_id) return { ok: false, error: "Vendor Name is required.", status: 400 };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount Paid must be greater than 0.", status: 400 };
  if (!body.bank_account_id) return { ok: false, error: "Paid Through account is required.", status: 400 };

  const vendor = await queryOne<{ id: string }>(`SELECT id FROM vendors WHERE id = $1 AND organization_id = $2`, [
    body.vendor_id,
    orgId,
  ]);
  if (!vendor) return { ok: false, error: "Select a valid vendor.", status: 400 };

  const bankAccount = await queryOne<{ id: string }>(`SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`, [
    body.bank_account_id,
    orgId,
  ]);
  if (!bankAccount) return { ok: false, error: "Select a valid Paid Through account.", status: 400 };

  const status = body.status === "draft" ? "draft" : "paid";
  const allocations = (body.allocations ?? []).filter(
    (a) => a.bill_id && Number.isFinite(Number(a.amount)) && Number(a.amount) > 0
  );
  const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  if (totalAllocated > amount + 0.005) {
    return { ok: false, error: "Total payment applied to bills cannot exceed Amount Paid.", status: 400 };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentNumber = body.payment_number?.trim() || (await claimNextNumber(client, orgId, "payments-made"));

    const paymentResult = await client.query<{ id: string }>(
      `INSERT INTO payments_made
         (organization_id, payment_number, vendor_id, payment_date, amount, payment_mode, bank_account_id, reference_number, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        orgId,
        paymentNumber,
        body.vendor_id,
        body.payment_date || new Date().toISOString().slice(0, 10),
        amount,
        body.payment_mode || "cash",
        body.bank_account_id,
        body.reference_number || null,
        body.notes || null,
        status,
      ]
    );
    const paymentId = paymentResult.rows[0].id;

    const touchedBills = new Set<string>();
    for (const alloc of allocations) {
      const billResult = await client.query<{ id: string; balance_due: string }>(
        `SELECT id, balance_due FROM bills WHERE id = $1 AND organization_id = $2 AND vendor_id = $3 FOR UPDATE`,
        [alloc.bill_id, orgId, body.vendor_id]
      );
      const bill = billResult.rows[0];
      if (!bill) continue;

      const applied = Math.min(Number(alloc.amount), Number(bill.balance_due));
      if (applied <= 0) continue;

      await client.query(`INSERT INTO bill_payment_allocations (payment_made_id, bill_id, amount) VALUES ($1, $2, $3)`, [
        paymentId,
        alloc.bill_id,
        applied,
      ]);
      touchedBills.add(alloc.bill_id);
    }

    if (status === "paid") {
      for (const billId of touchedBills) await recomputeBillBalance(client, orgId, billId);
    }

    await syncPaymentMadeJournal(client, orgId, paymentId);

    await client.query("COMMIT");
    return { ok: true, id: paymentId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? "Database schema is out of date for Payments Made — run `npm run migrate:up` and try again."
        : "Could not save this payment.";
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}

/** Applies more of an already-Paid payment to one more bill — the "application" half of
 * apply/unapply, mirroring receipts-api.ts's applyReceiptToInvoice. Merges into an existing
 * bill_payment_allocations row for the same bill rather than creating a second one. */
export async function applyPaymentToBill(
  orgId: string,
  paymentMadeId: string,
  billId: string,
  amount: number
): Promise<PaymentMadeActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount must be greater than 0.", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<{ id: string; vendor_id: string; amount: string; status: string }>(
      `SELECT id, vendor_id, amount, status FROM payments_made WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [paymentMadeId, orgId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Payment not found.", status: 404 };
    }
    if (payment.status !== "paid") {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only a Paid payment can be applied to a bill.", status: 400 };
    }

    const allocSum = await client.query<{ s: string | null }>(
      `SELECT SUM(amount) AS s FROM bill_payment_allocations WHERE payment_made_id = $1`,
      [paymentMadeId]
    );
    const alreadyApplied = round2(Number(allocSum.rows[0]?.s ?? 0));
    const unapplied = round2(Number(payment.amount) - alreadyApplied);
    if (round2(amount) > unapplied + 0.005) {
      await client.query("ROLLBACK");
      return { ok: false, error: `Only ${unapplied} is unapplied on this payment.`, status: 400 };
    }

    const billResult = await client.query<{ id: string; balance_due: string }>(
      `SELECT id, balance_due FROM bills WHERE id = $1 AND organization_id = $2 AND vendor_id = $3 FOR UPDATE`,
      [billId, orgId, payment.vendor_id]
    );
    const bill = billResult.rows[0];
    if (!bill) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Bill not found for this payment's vendor.", status: 404 };
    }

    const applied = Math.min(round2(amount), round2(Number(bill.balance_due)));
    if (applied <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This bill has no remaining balance to apply to.", status: 400 };
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM bill_payment_allocations WHERE payment_made_id = $1 AND bill_id = $2`,
      [paymentMadeId, billId]
    );
    if (existing.rowCount) {
      await client.query(`UPDATE bill_payment_allocations SET amount = amount + $1 WHERE id = $2`, [applied, existing.rows[0].id]);
    } else {
      await client.query(`INSERT INTO bill_payment_allocations (payment_made_id, bill_id, amount) VALUES ($1, $2, $3)`, [
        paymentMadeId,
        billId,
        applied,
      ]);
    }

    await recomputeBillBalance(client, orgId, billId);

    await client.query("COMMIT");
    return { ok: true, id: paymentMadeId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not apply this payment.", status: 500 };
  } finally {
    client.release();
  }
}

/** Reverses one specific bill allocation on a payment — the payment itself and any of its
 * OTHER allocations are untouched. Mirrors receipts-api.ts's unapplyReceiptAllocation. */
export async function unapplyPaymentFromBill(orgId: string, paymentMadeId: string, billId: string): Promise<PaymentMadeActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<{ id: string }>(
      `SELECT id FROM payments_made WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [paymentMadeId, orgId]
    );
    if (!paymentResult.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Payment not found.", status: 404 };
    }

    const allocResult = await client.query<{ id: string }>(
      `SELECT id FROM bill_payment_allocations WHERE payment_made_id = $1 AND bill_id = $2`,
      [paymentMadeId, billId]
    );
    if (!allocResult.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This payment isn't applied to that bill.", status: 404 };
    }

    await client.query(`DELETE FROM bill_payment_allocations WHERE id = $1`, [allocResult.rows[0].id]);
    await recomputeBillBalance(client, orgId, billId);

    await client.query("COMMIT");
    return { ok: true, id: paymentMadeId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not unapply this payment.", status: 500 };
  } finally {
    client.release();
  }
}

/** Every bill this payment currently has an allocation against — used right before deleting
 * a payments_made row (the generic entities DELETE route) so the bill(s) it touched get their
 * balance_due/status recomputed once the cascade-deleted allocations are gone. Must be called
 * BEFORE the delete (bill_payment_allocations cascades with the payment row). */
export async function billsAllocatedByPayment(orgId: string, paymentMadeId: string): Promise<string[]> {
  const rows = await query<{ bill_id: string }>(
    `SELECT DISTINCT bpa.bill_id FROM bill_payment_allocations bpa
     JOIN payments_made pm ON pm.id = bpa.payment_made_id
     WHERE bpa.payment_made_id = $1 AND pm.organization_id = $2`,
    [paymentMadeId, orgId]
  );
  return rows.map((r) => r.bill_id);
}

export async function recomputeBills(client: PoolClient, orgId: string, billIds: string[]) {
  for (const id of billIds) await recomputeBillBalance(client, orgId, id);
}
