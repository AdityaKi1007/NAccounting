import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import RefundForm from "@/components/payments/RefundForm";

const round2 = (n: number) => Math.round(n * 100) / 100;

interface PaymentRow {
  id: string;
  payment_number: string;
  amount: string;
  status: string;
  bank_account_id: string | null;
  customer_id: string | null;
}

/** Server wrapper for RefundForm — the "Refund" action reached from a Paid Payment Received's
 * own detail view (see PaymentDetailView.tsx). Loads everything the screenshot's info box
 * needs (Total Amount Received / Amount Applied to Invoices / Previously Refunded Amount /
 * Excess Amount) plus the bank account options for "From Account", then hands them to the
 * client form as plain props — same shape as RecordPaymentFormPage.tsx. */
export default async function RefundFormPage({ id }: { id: string }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "payments-received", "write");

  const payment = await queryOne<PaymentRow>(
    `SELECT id, payment_number, amount, status, bank_account_id, customer_id
     FROM payments_received WHERE id = $1 AND organization_id = $2`,
    [id, ctx.orgId]
  );
  if (!payment) notFound();

  const [customer, bankAccounts, allocSum, refundSum, org] = await Promise.all([
    payment.customer_id
      ? queryOne<{ display_name: string; company_name: string | null }>(
          `SELECT display_name, company_name FROM customers WHERE id = $1 AND organization_id = $2`,
          [payment.customer_id, ctx.orgId]
        )
      : Promise.resolve(null),
    query<{ id: string; account_name: string; is_primary: boolean }>(
      `SELECT id, account_name, is_primary FROM bank_accounts WHERE organization_id = $1 ORDER BY is_primary DESC, account_name ASC`,
      [ctx.orgId]
    ),
    queryOne<{ s: string | null }>(`SELECT SUM(amount) AS s FROM payment_allocations WHERE payment_id = $1`, [id]),
    queryOne<{ s: string | null }>(`SELECT SUM(amount) AS s FROM payment_refunds WHERE payment_received_id = $1`, [id]),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
  ]);

  const totalAmountReceived = round2(Number(payment.amount));
  const amountApplied = round2(Number(allocSum?.s ?? 0));
  const previouslyRefunded = round2(Number(refundSum?.s ?? 0));
  const excessAmount = round2(Math.max(0, totalAmountReceived - amountApplied - previouslyRefunded));

  return (
    <RefundForm
      paymentId={payment.id}
      paymentNumber={payment.payment_number}
      isPaid={payment.status === "paid"}
      customerName={
        customer ? (customer.company_name ? `${customer.display_name} (${customer.company_name})` : customer.display_name) : "-"
      }
      totalAmountReceived={totalAmountReceived}
      amountApplied={amountApplied}
      previouslyRefunded={previouslyRefunded}
      excessAmount={excessAmount}
      bankAccountOptions={bankAccounts.map((b) => ({ value: b.id, label: b.account_name }))}
      defaultFromAccountId={payment.bank_account_id ?? bankAccounts[0]?.id ?? ""}
      currency={org?.currency ?? "AED"}
    />
  );
}
