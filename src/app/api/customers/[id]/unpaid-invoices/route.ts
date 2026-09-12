import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";

// Feeds the "Unpaid Invoices" table in the Record Payment form. Only invoices that have
// actually been sent to the customer and still carry a balance are eligible for a payment
// to be applied against (draft invoices haven't been billed yet; paid ones have nothing
// left to collect). Oldest first, so the client's auto-apply logic settles older invoices
// before newer ones, matching how Zoho applies a payment by default.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "payments-received", "view");
  if (accessError) return accessError;

  const rows = await query<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    total: string;
    balance_due: string;
  }>(
    `SELECT id, invoice_number, invoice_date, total, balance_due
     FROM invoices
     WHERE organization_id = $1 AND customer_id = $2
       AND status IN ('sent', 'partially_paid', 'overdue') AND balance_due > 0
     ORDER BY invoice_date ASC, created_at ASC`,
    [ctx.orgId, params.id]
  );

  return NextResponse.json({
    invoices: rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      total: Number(r.total),
      balanceDue: Number(r.balance_due),
    })),
  });
}
