import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { documentConfigs } from "@/lib/documents";
import { createDocument } from "@/lib/documents-api";

interface SalesOrderRow {
  id: string;
  status: string;
  notes: string | null;
  terms_conditions: string | null;
  so_number: string | null;
  converted_purchase_order_id: string | null;
}

interface LineRow {
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
}

interface ItemCostRow {
  id: string;
  purchase_price: string | null;
}

// Creates a purchase order from a sales order's line items, letting the caller pick which
// vendor to buy from (a sales order has no vendor of its own — the customer relationship is
// separate). Reuses the item catalog's Cost Price (purchase_price) for each line's rate where
// available, falling back to the sales order line's own rate when the item has no cost price
// or the line is a free-text line (no item_id). Unlike convert-to-invoice, this never touches
// the sales order's status — the user's auto-confirm instruction was scoped to the invoice
// conversion path only.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const soAccessError = await moduleAccessErrorResponse(ctx, "sales-orders", "write");
  if (soAccessError) return soAccessError;
  const poAccessError = await moduleAccessErrorResponse(ctx, "purchase-orders", "write");
  if (poAccessError) return poAccessError;

  let body: { vendor_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const vendorId = body.vendor_id;
  if (!vendorId) return NextResponse.json({ error: "A vendor is required to convert to a purchase order." }, { status: 400 });

  const vendor = await queryOne<{ id: string }>(
    `SELECT id FROM vendors WHERE id = $1 AND organization_id = $2`,
    [vendorId, ctx.orgId]
  );
  if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });

  const so = await queryOne<SalesOrderRow>(
    `SELECT id, status, notes, terms_conditions, so_number, converted_purchase_order_id FROM sales_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!so) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  if (so.status === "void") return NextResponse.json({ error: "A void sales order can't be converted." }, { status: 400 });
  if (so.converted_purchase_order_id) {
    return NextResponse.json(
      { error: "This sales order has already been converted to a purchase order.", purchaseOrderId: so.converted_purchase_order_id },
      { status: 400 }
    );
  }

  const lines = await query<LineRow>(
    `SELECT item_id, description, quantity, rate FROM sales_order_items WHERE sales_order_id = $1 ORDER BY id`,
    [so.id]
  );
  if (lines.length === 0) {
    return NextResponse.json({ error: "This sales order has no line items to purchase." }, { status: 400 });
  }

  const itemIds = [...new Set(lines.map((l) => l.item_id).filter((id): id is string => !!id))];
  const costById = new Map<string, number>();
  if (itemIds.length > 0) {
    const items = await query<ItemCostRow>(
      `SELECT id, purchase_price FROM items WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [ctx.orgId, itemIds]
    );
    for (const it of items) {
      if (it.purchase_price != null) costById.set(it.id, Number(it.purchase_price));
    }
  }

  const result = await createDocument(documentConfigs["purchase-orders"], ctx.orgId, {
    header: {
      vendor_id: vendorId,
      order_date: new Date().toISOString().slice(0, 10),
      notes: so.notes,
      reference_number: so.so_number,
      terms_conditions: so.terms_conditions,
    },
    lines: lines.map((l) => ({
      item_id: l.item_id,
      description: l.description ?? undefined,
      quantity: Number(l.quantity),
      rate: l.item_id && costById.has(l.item_id) ? (costById.get(l.item_id) as number) : Number(l.rate),
    })),
    taxPercent: 0,
  }, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  await pool.query(
    `UPDATE sales_orders SET converted_purchase_order_id = $1 WHERE id = $2 AND organization_id = $3`,
    [result.id, so.id, ctx.orgId]
  );

  return NextResponse.json({ purchaseOrderId: result.id }, { status: 201 });
}
