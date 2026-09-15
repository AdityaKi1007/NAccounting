import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { idBelongsToOrg } from "@/lib/tenant-guard";
import { createBill } from "@/lib/bills-api";

interface PurchaseOrderRow {
  id: string;
  vendor_id: string | null;
  status: string;
  notes: string | null;
  po_number: string;
  converted_bill_id: string | null;
}

interface LineRow {
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  discount_percent: string;
  amount: string;
}

// Creates a real bill from a purchase order's vendor + line items, the purchases-side mirror
// of sales-orders' convert-to-invoice. Unlike that route (which reuses createDocument), this
// goes through bills-api.ts's createBill, because Bills bypass the generic document engine
// entirely and require a real per-line account_id before syncBillJournal will post anything
// (see bills-api.ts's own header comment and migration 1761000000000). Purchase order line
// items have no account_id of their own — a PO never had a reason to carry one — so the
// caller must supply one `account_id` here, applied to every converted line, rather than this
// route silently creating a bill that posts no journal entry at all (this app's existing
// "don't post an incomplete/unbalanced entry" philosophy, applied one step earlier here).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  // Converting a purchase order into a bill needs write access to both — creating the bill is
  // the whole point, so both modules must be enabled/permitted for this member.
  const poAccessError = await moduleAccessErrorResponse(ctx, "purchase-orders", "write");
  if (poAccessError) return poAccessError;
  const billAccessError = await moduleAccessErrorResponse(ctx, "bills", "write");
  if (billAccessError) return billAccessError;

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  if (!accountId) return NextResponse.json({ error: "Select an Account to post these items against." }, { status: 400 });
  if (!(await idBelongsToOrg("accounts", accountId, ctx.orgId))) {
    return NextResponse.json({ error: "Select a valid Account." }, { status: 400 });
  }

  const po = await queryOne<PurchaseOrderRow>(
    `SELECT id, vendor_id, status, notes, po_number, converted_bill_id FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!po) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  if (po.status === "void") return NextResponse.json({ error: "A void purchase order can't be converted." }, { status: 400 });
  if (po.converted_bill_id) {
    return NextResponse.json({ error: "This purchase order has already been converted to a bill.", billId: po.converted_bill_id }, { status: 400 });
  }
  if (!po.vendor_id) return NextResponse.json({ error: "This purchase order has no vendor to bill." }, { status: 400 });

  // Cancelled lines (see migration 1788000000000 / cancel-items/route.ts) never make it into
  // the bill — a line the vendor can't supply shouldn't be billed just because the rest of
  // the PO is being converted.
  const lines = await query<LineRow>(
    `SELECT item_id, description, quantity, rate, discount_percent, amount FROM purchase_order_items
     WHERE purchase_order_id = $1 AND NOT cancelled ORDER BY id`,
    [po.id]
  );
  if (lines.length === 0) {
    return NextResponse.json({ error: "This purchase order has no (non-cancelled) line items to bill." }, { status: 400 });
  }

  const result = await createBill(
    ctx.orgId,
    {
      vendor_id: po.vendor_id,
      bill_date: new Date().toISOString().slice(0, 10),
      order_number: po.po_number,
      notes: po.notes || undefined,
      status: "open",
      // Bake each line's PO discount into a flat per-unit rate — bill_items has no discount
      // column of its own, same trick convert-to-invoice uses so the bill's dollar total keeps
      // matching the (already-discounted) purchase order total exactly.
      lines: lines.map((l) => ({
        item_id: l.item_id,
        description: l.description ?? undefined,
        quantity: Number(l.quantity),
        rate: Number(l.quantity) > 0 ? Number(l.amount) / Number(l.quantity) : Number(l.rate),
        account_id: accountId,
      })),
    },
    { userId: ctx.userId }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  await pool.query(
    `UPDATE purchase_orders
     SET converted_bill_id = $1, status = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END
     WHERE id = $2 AND organization_id = $3`,
    [result.id, po.id, ctx.orgId]
  );

  return NextResponse.json({ billId: result.id }, { status: 201 });
}
