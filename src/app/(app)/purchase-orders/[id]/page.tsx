import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
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
  description: string | null;
  quantity: string;
  rate: string;
  discount_percent: string;
  amount: string;
  item_name: string | null;
}

export default async function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const po = await queryOne<PurchaseOrderRow>(
    `SELECT id, po_number, vendor_id, order_date, expected_delivery_date, reference_number, status,
            subtotal, tax_total, total, notes, terms_conditions
     FROM purchase_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!po) notFound();

  const [vendor, org, lines, logoDataUri] = await Promise.all([
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
      `SELECT poi.description, poi.quantity, poi.rate, poi.discount_percent, poi.amount, i.name AS item_name
       FROM purchase_order_items poi
       LEFT JOIN items i ON i.id = poi.item_id
       WHERE poi.purchase_order_id = $1
       ORDER BY poi.id ASC`,
      [po.id]
    ),
    getOrgLogoDataUri(ctx.orgId),
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
      }}
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
        description: l.description || l.item_name || "",
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        discountPercent: Number(l.discount_percent),
        amount: Number(l.amount),
      }))}
    />
  );
}
