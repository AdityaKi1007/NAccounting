import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { documentConfigs } from "@/lib/documents";
import { createDocument } from "@/lib/documents-api";

interface SalesOrderRow {
  id: string;
  customer_id: string | null;
  status: string;
  notes: string | null;
  converted_invoice_id: string | null;
}

interface LineRow {
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  amount: string;
}

// Creates a real invoice from a sales order's customer + line items, reusing the exact same
// createDocument() transaction (number claiming, auto-journal sync) the invoice form itself
// goes through — see src/lib/documents-api.ts. A converted sales order is auto-confirmed if
// it was still in Draft, per the user's request; already-confirmed/closed status is left
// alone. Each sales order can only be converted to an invoice once (converted_invoice_id
// guards against duplicates) — re-run this after deleting that invoice to convert again,
// since the FK's ON DELETE SET NULL clears the reference.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  // Converting a sales order into an invoice needs write access to both — creating the
  // invoice is the whole point, so both modules must be enabled/permitted for this member.
  const soAccessError = await moduleAccessErrorResponse(ctx, "sales-orders", "write");
  if (soAccessError) return soAccessError;
  const invoiceAccessError = await moduleAccessErrorResponse(ctx, "invoices", "write");
  if (invoiceAccessError) return invoiceAccessError;

  const so = await queryOne<SalesOrderRow>(
    `SELECT id, customer_id, status, notes, converted_invoice_id FROM sales_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!so) return NextResponse.json({ error: "Sales order not found." }, { status: 404 });
  if (so.status === "void") return NextResponse.json({ error: "A void sales order can't be converted." }, { status: 400 });
  if (so.converted_invoice_id) {
    return NextResponse.json({ error: "This sales order has already been converted to an invoice.", invoiceId: so.converted_invoice_id }, { status: 400 });
  }
  if (!so.customer_id) return NextResponse.json({ error: "This sales order has no customer to invoice." }, { status: 400 });

  const lines = await query<LineRow>(
    `SELECT item_id, description, quantity, rate, amount FROM sales_order_items WHERE sales_order_id = $1 ORDER BY id`,
    [so.id]
  );
  if (lines.length === 0) {
    return NextResponse.json({ error: "This sales order has no line items to invoice." }, { status: 400 });
  }

  const result = await createDocument(documentConfigs.invoices, ctx.orgId, {
    header: {
      customer_id: so.customer_id,
      invoice_date: new Date().toISOString().slice(0, 10),
      notes: so.notes,
      // Lets the invoice remember which sales order it came from — see entities.ts's
      // "sales_order_id" field on invoices and documents.ts's extraHeaderFields entry.
      sales_order_id: so.id,
    },
    // Bake each line's sales-order discount into a flat per-unit rate — invoice_items has no
    // discount column of its own, so this is what keeps the invoice's dollar total matching
    // the (already-discounted) sales order total exactly.
    lines: lines.map((l) => ({
      item_id: l.item_id,
      description: l.description ?? undefined,
      quantity: Number(l.quantity),
      rate: Number(l.quantity) > 0 ? Number(l.amount) / Number(l.quantity) : Number(l.rate),
    })),
    taxPercent: 0,
  }, { userId: ctx.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  await pool.query(
    `UPDATE sales_orders
     SET converted_invoice_id = $1, status = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END
     WHERE id = $2 AND organization_id = $3`,
    [result.id, so.id, ctx.orgId]
  );

  return NextResponse.json({ invoiceId: result.id }, { status: 201 });
}
