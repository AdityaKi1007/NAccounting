import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";

// Feeds the "Open Bills" table in RecordPaymentMadeForm — the vendor-side mirror of
// /api/customers/[id]/unpaid-invoices. Only bills that have actually been marked Open (a
// Draft bill hasn't been finalized yet; a fully Paid one has nothing left to settle) and
// still carry a balance are eligible for a payment to be applied against.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const rows = await query<{
    id: string;
    bill_number: string;
    bill_date: string;
    total: string;
    balance_due: string;
  }>(
    `SELECT id, bill_number, bill_date, total, balance_due
     FROM bills
     WHERE organization_id = $1 AND vendor_id = $2
       AND status IN ('open', 'partially_paid', 'overdue') AND balance_due > 0
     ORDER BY bill_date ASC, created_at ASC`,
    [ctx.orgId, params.id]
  );

  return NextResponse.json({
    bills: rows.map((r) => ({
      id: r.id,
      billNumber: r.bill_number,
      billDate: r.bill_date,
      total: Number(r.total),
      balanceDue: Number(r.balance_due),
    })),
  });
}
