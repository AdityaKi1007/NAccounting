import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { getOrgLogoDataUri } from "@/lib/s3";
import PurchaseOrderDetailView from "@/components/purchase-orders/PurchaseOrderDetailView";

interface PurchaseOrderRow {
  id: string;
  po_number: string;
  vendor_id: string | null;
  order_date: string;
  expected_delivery_date: string | null;
  reference_number: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string | null;
  terms_conditions: string | null;
  converted_bill_id: string | null;
}

interface BillRow {
  id: string;
  bill_number: string;
  status: string;
  total: string;
  balance_due: string;
}

interface VendorRow {
  display_name: string;
  company_name: string | null;
  billing_address: string | null;
  email: string | null;
}

interface OrgRow {
  name: string;
  address_street1: string | null;
  address_street2: string | null;
  address_city: string | null;
  address_state: string | null;
  location_country: string | null;
  currency: string;
}

interface LineRow {
  id: string;
  description: string | null;
  quantity: string;
  rate: string;
  discount_percent: string;
  amount: string;
  item_name: string | null;
  cancelled: boolean;
}

export default async function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "purchase-orders", "view");

  const po = await queryOne<PurchaseOrderRow>(
    `SELECT id, po_number, vendor_id, order_date, expected_delivery_date, reference_number, status,
            subtotal, tax_total, total, notes, terms_conditions, converted_bill_id
     FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!po) notFound();

  const [vendor, org, lines, logoDataUri, bill, accountRows] = await Promise.all([
    po.vendor_id
      ? queryOne<VendorRow>(
          `SELECT display_name, company_name, billing_address, email FROM vendors WHERE id = $1 AND organization_id = $2`,
          [po.vendor_id, ctx.orgId]
        )
      : Promise.resolve(null),
    queryOne<OrgRow>(
      `SELECT name, address_street1, address_street2, address_city, address_state, location_country, currency
       FROM organizations WHERE id = $1`,
      [ctx.orgId]
    ),
    query<LineRow>(
      `SELECT poi.id, poi.description, poi.quantity, poi.rate, poi.discount_percent, poi.amount, i.name AS item_name, poi.cancelled
       FROM purchase_order_items poi
       LEFT JOIN items i ON i.id = poi.item_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id ASC`,
      [po.id]
    ),
    getOrgLogoDataUri(ctx.orgId),
    // The bill this PO was converted into, if any — see the "Bills" panel in
    // PurchaseOrderDetailView.tsx and src/app/api/purchase-orders/[id]/convert-to-bill/route.ts.
    po.converted_bill_id
      ? queryOne<BillRow>(`SELECT id, bill_number, status, total, balance_due FROM bills WHERE id = $1 AND organization_id = $2`, [
          po.converted_bill_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    // Same expense-like account filter BillFormPage.tsx offers for a bill's per-line Account —
    // a converted-from-PO bill needs exactly one of these picked up front, since purchase order
    // line items don't carry their own account_id (see the convert-to-bill route's own comment).
    query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM accounts
       WHERE organization_id = $1 AND is_active AND type IN ('expense', 'cost_of_goods_sold', 'fixed_asset', 'other_asset')
       ORDER BY code NULLS LAST, name ASC`,
      [ctx.orgId]
    ),
  ]);

  return (
    <PurchaseOrderDetailView
      purchaseOrder={{
        id: po.id,
        poNumber: po.po_number,
        orderDate: po.order_date,
        expectedDeliveryDate: po.expected_delivery_date,
        referenceNumber: po.reference_number,
        status: po.status,
        subtotal: Number(po.subtotal),
        taxTotal: Number(po.tax_total),
        total: Number(po.total),
        notes: po.notes,
        termsConditions: po.terms_conditions,
        convertedBillId: po.converted_bill_id,
      }}
      bill={
        bill
          ? { id: bill.id, billNumber: bill.bill_number, status: bill.status, total: Number(bill.total), balanceDue: Number(bill.balance_due) }
          : null
      }
      accountOptions={accountRows.map((r) => ({ value: r.id, label: r.code ? `${r.code} - ${r.name}` : r.name }))}
      vendor={
        vendor
          ? {
              displayName: vendor.display_name,
              companyName: vendor.company_name,
              billingAddress: vendor.billing_address,
              email: vendor.email,
            }
          : null
      }
      org={{
        name: org?.name ?? "",
        addressLines: [org?.address_street1, org?.address_street2, org?.address_city, org?.address_state, org?.location_country].filter(
          (v): v is string => Boolean(v && v.trim())
        ),
        logoDataUri,
      }}
      currency={org?.currency ?? "AED"}
      lines={lines.map((l) => ({
        id: l.id,
        description: l.description || l.item_name || "",
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        discountPercent: Number(l.discount_percent),
        amount: Number(l.amount),
        cancelled: l.cancelled,
      }))}
    />
  );
}
