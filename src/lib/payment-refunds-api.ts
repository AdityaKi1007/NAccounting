import { pool } from "@/lib/db";
import { syncPaymentRefundJournal } from "@/lib/auto-journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Backs the "Refund" action on a Paid Payment Received — see payment_refunds (migration
// 1771000000000_payment_refunds.js) and RefundForm.tsx/PaymentDetailView.tsx. Modeled on
// receipts-api.ts's applyReceiptToInvoice: a single FOR UPDATE-locked transaction that
// re-derives "how much is actually left to refund" from the payment's own current
// allocations + any refunds already issued against it, rather than trusting a client-supplied
// figure, then inserts the refund row and posts its journal in the same transaction.

export interface PaymentRefundBody {
  amount?: number;
  refunded_on?: string;
  payment_mode?: string;
  from_account_id?: string;
  reference_number?: string;
  description?: string;
}

export interface PaymentRefundActionResult {
  ok: boolean;
  id?: string;
  error?: string;
  status?: number;
}

export async function createPaymentRefund(
  orgId: string,
  paymentId: string,
  body: PaymentRefundBody
): Promise<PaymentRefundActionResult> {
  const amount = round2(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Refund amount must be greater than 0.", status: 400 };
  }
  if (!body.refunded_on) return { ok: false, error: "Refunded On is required.", status: 400 };
  if (!body.from_account_id) return { ok: false, error: "From Account is required.", status: 400 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentResult = await client.query<{ id: string; amount: string; status: string }>(
      `SELECT id, amount, status FROM payments_received WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [paymentId, orgId]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Payment not found.", status: 404 };
    }
    if (payment.status !== "paid") {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only a Paid payment can be refunded.", status: 400 };
    }

    const fromAccount = await client.query<{ id: string }>(
      `SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`,
      [body.from_account_id, orgId]
    );
    if (!fromAccount.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Select a valid From Account.", status: 400 };
    }

    // Excess available = amount received, minus whatever's currently applied to invoices,
    // minus whatever's already been refunded before now — recomputed fresh every time rather
    // than trusting anything the client sent, same reasoning as applyReceiptToInvoice's own
    // "unapplied" check.
    const [allocSum, refundSum] = await Promise.all([
      client.query<{ s: string | null }>(`SELECT SUM(amount) AS s FROM payment_allocations WHERE payment_id = $1`, [paymentId]),
      client.query<{ s: string | null }>(`SELECT SUM(amount) AS s FROM payment_refunds WHERE payment_received_id = $1`, [paymentId]),
    ]);
    const applied = round2(Number(allocSum.rows[0]?.s ?? 0));
    const alreadyRefunded = round2(Number(refundSum.rows[0]?.s ?? 0));
    const excess = round2(Math.max(0, round2(Number(payment.amount)) - applied - alreadyRefunded));

    if (amount > excess + 0.005) {
      await client.query("ROLLBACK");
      return { ok: false, error: `Only ${excess} is available to refund on this payment.`, status: 400 };
    }

    const refundResult = await client.query<{ id: string }>(
      `INSERT INTO payment_refunds
         (organization_id, payment_received_id, refund_type, amount, refunded_on, payment_mode, from_account_id, reference_number, description)
       VALUES ($1, $2, 'excess_amount', $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        orgId,
        paymentId,
        amount,
        body.refunded_on,
        body.payment_mode || "cash",
        body.from_account_id,
        body.reference_number || null,
        body.description || null,
      ]
    );
    const refundId = refundResult.rows[0].id;

    await syncPaymentRefundJournal(client, orgId, refundId);

    await client.query("COMMIT");
    return { ok: true, id: refundId };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    const pgCode = (err as { code?: string } | null)?.code;
    const message =
      pgCode === "42703" || pgCode === "42P01"
        ? "Database schema is out of date for Payment Refunds — run `npm run migrate:up` and try again."
        : "Could not save this refund.";
    return { ok: false, error: message, status: 500 };
  } finally {
    client.release();
  }
}
