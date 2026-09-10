import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { query, queryOne } from "@/lib/db";
import SalesOrderDetailView from "@/components/sales-orders/SalesOrderDetailView";

interface SalesOrderRow {
  id: string;
  so_number: string;
  customer_id: string | null;
  order_date: string;
  shipment_date: string | null;
  reference_number: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string | null;
  terms_conditions: string | null;
  converted_invoice_id: string | null;
  converted_purchase_order_id: string | null;
}

interface CustomerRow {
  display_name: string;
  company_name: string | null;
  billing_address: string | null;
  shipping_address: string | null;
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

interface VendorRow {
  id: string;
  display_name: string;
}

export default async function SalesOrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();

  const so = await queryOne<SalesOrderRow>(
    `SELECT id, so_number, customer_id, order_date, shipment_date, reference_number, status,
            subtotal, tax_total, total, notes, terms_conditions, converted_invoice_id, converted_purchase_order_id
     FROM sales_orders WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!so) notFound();

  const [customer, org, lines, vendors] = await Promise.all([
    so.customer_id
      ? queryOne<CustomerRow>(
          `SELECT display_name, company_name, billing_address, shipping_address FROM customers WHERE id = $1 AND organization_id = $2`,
          [so.customer_id, ctx.orgId]
        )
      : Promise.resolve(null),
    queryOne<OrgRow>(
      `SELECT name, address_street1, address_street2, address_city, address_state, location_country, currency
       FROM organizations WHERE id = $1`,
      [ctx.orgId]
    ),
    query<LineRow>(
      `SELECT soi.description, soi.quantity, soi.rate, soi.discount_percent, soi.amount, i.name AS item_name
       FROM sales_order_items soi
       LEFT JOIN items i ON i.id = soi.item_id
       WHERE soi.sales_order_id = $1
       ORDER BY soi.id ASC`,
      [so.id]
    ),
    query<VendorRow>(
      `SELECT id, display_name FROM vendors WHERE organization_id = $1 AND is_active = true ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
  ]);

  return (
    <SalesOrderDetailView
      salesOrder={{
        id: so.id,
        soNumber: so.so_number,
        orderDate: so.order_date,
        shipmentDate: so.shipment_date,
        referenceNumber: so.reference_number,
        status: so.status,
        subtotal: Number(so.subtotal),
        taxTotal: Number(so.tax_total),
        total: Number(so.total),
        notes: so.notes,
        termsConditions: so.terms_conditions,
        convertedInvoiceId: so.converted_invoice_id,
        convertedPurchaseOrderId: so.converted_purchase_order_id,
      }}
      customer={
        customer
          ? {
              displayName: customer.display_name,
              companyName: customer.company_name,
              billingAddress: customer.billing_address,
              shippingAddress: customer.shipping_address,
            }
          : null
      }
      org={{
        name: org?.name ?? "",
        addressLines: [org?.address_street1, org?.address_street2, org?.address_city, org?.address_state, org?.location_country].filter(
          (v): v is string => Boolean(v && v.trim())
        ),
      }}
      currency={org?.currency ?? "AED"}
      lines={lines.map((l) => ({
        description: l.description || l.item_name || "",
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        discountPercent: Number(l.discount_percent),
        amount: Number(l.amount),
      }))}
      vendors={vendors.map((v) => ({ id: v.id, displayName: v.display_name }))}
    />
  );
}
