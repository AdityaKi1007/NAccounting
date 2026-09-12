import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";

// Feeds the standalone "+ New Credit Note" picker (src/app/(app)/credit-notes/new/page.tsx).
// Deliberately broader than /api/customers/[id]/unpaid-invoices (which only offers invoices
// that still carry a balance, for Record Payment): CreditDebitNoteFormPage's own guard is
// simply "not draft, not void" (see its comment), with no balance_due requirement — a credit
// note against an already fully-paid invoice is a legitimate real-world case (e.g. a refund
// after the fact). This endpoint mirrors that exact rule so the picker never offers an
// invoice the actual creation endpoint would then reject.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "credit-notes", "view");
  if (accessError) return accessError;

  const rows = await query<{
    id: string;
    invoice_number: string;
    invoice_date: string;
    status: string;
    total: string;
    balance_due: string;
  }>(
    `SELECT id, invoice_number, invoice_date, status, total, balance_due
     FROM invoices
     WHERE organization_id = $1 AND customer_id = $2 AND status NOT IN ('draft', 'void')
     ORDER BY invoice_date DESC, created_at DESC`,
    [ctx.orgId, params.id]
  );

  return NextResponse.json({
    invoices: rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      status: r.status,
      total: Number(r.total),
      balanceDue: Number(r.balance_due),
    })),
  });
}
