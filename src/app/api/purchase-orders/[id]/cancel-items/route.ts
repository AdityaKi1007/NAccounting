import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";

interface PurchaseOrderRow {
  id: string;
  status: string;
  converted_bill_id: string | null;
}

// Sets which of a purchase order's line items are cancelled (full replace of the cancelled
// set each call — the "Cancel Items" modal always sends every currently-checked item id, so
// there's no separate toggle-on/toggle-off endpoint to keep in sync). Recomputes the PO's own
// subtotal/tax/total from only the non-cancelled lines afterward, preserving whatever tax %
// the PO was already using (documents-api.ts's createDocument/updateDocument never store a
// literal taxPercent column, only subtotal/tax_total — so it's re-derived from their current
// ratio, same trick DocumentForm.tsx's own "load existing document" path already uses).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "purchase-orders", "write");
  if (accessError) return accessError;

  const body = await req.json().catch(() => ({}));
  const cancelledIds: string[] = Array.isArray(body.cancelled_item_ids)
    ? body.cancelled_item_ids.filter((v: unknown): v is string => typeof v === "string")
    : [];

  const po = await queryOne<PurchaseOrderRow>(
    `SELECT id, status, converted_bill_id FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!po) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
  if (po.converted_bill_id) {
    return NextResponse.json(
      { error: "This purchase order has already been converted to a bill — its items can no longer be changed." },
      { status: 400 }
    );
  }
  if (po.status === "void") {
    return NextResponse.json({ error: "This purchase order is already cancelled." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Every id in cancelledIds must actually belong to this PO — a stray/foreign id would
    // otherwise be silently ignored by the WHERE below, which is fine, but we still scope the
    // whole UPDATE to this purchase_order_id so nothing outside it can ever be touched.
    await client.query(
      `UPDATE purchase_order_items SET cancelled = (id = ANY($1::uuid[])) WHERE purchase_order_id = $2`,
      [cancelledIds, po.id]
    );

    const totals = await client.query<{ subtotal: string; current_subtotal: string; current_tax_total: string }>(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE NOT cancelled), 0) AS subtotal,
         (SELECT subtotal FROM purchase_orders WHERE id = $1) AS current_subtotal,
         (SELECT tax_total FROM purchase_orders WHERE id = $1) AS current_tax_total
       FROM purchase_order_items WHERE purchase_order_id = $1`,
      [po.id]
    );
    const row = totals.rows[0];
    const subtotal = Math.round(Number(row.subtotal) * 100) / 100;
    const currentSubtotal = Number(row.current_subtotal);
    const currentTaxTotal = Number(row.current_tax_total);
    const taxPercent = currentSubtotal > 0 ? (currentTaxTotal / currentSubtotal) * 100 : 0;
    const taxTotal = Math.round(subtotal * (taxPercent / 100) * 100) / 100;
    const total = Math.round((subtotal + taxTotal) * 100) / 100;

    await client.query(
      `UPDATE purchase_orders SET subtotal = $1, tax_total = $2, total = $3 WHERE id = $4 AND organization_id = $5`,
      [subtotal, taxTotal, total, po.id, ctx.orgId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not update cancelled items." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
