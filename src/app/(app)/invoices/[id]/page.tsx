import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { getOrgLogoDataUri } from "@/lib/s3";
import InvoiceDetailView from "@/components/invoices/InvoiceDetailView";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  balance_due: string;
  notes: string | null;
  sales_order_id: string | null;
  project_id: string | null;
  unit_id: string | null;
}

interface SalesOrderRow {
  id: string;
  so_number: string;
}

interface ProjectRow {
  id: string;
  name: string;
}

interface UnitRow {
  id: string;
  name: string;
}

interface CustomerRow {
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
  amount: string;
  item_name: string | null;
}

interface PaymentRow {
  payment_number: string;
  payment_date: string;
  amount: string;
}

interface JournalLineRow {
  account_name: string;
  debit: string;
  credit: string;
}

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "invoices", "view");

  const invoice = await queryOne<InvoiceRow>(
    `SELECT id, invoice_number, customer_id, invoice_date, due_date, status, subtotal, tax_total, total, balance_due, notes,
            sales_order_id, project_id, unit_id
     FROM invoices WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!invoice) notFound();

  const [customer, org, lines, payments, journalLines, salesOrder, project, unit, logoDataUri] = await Promise.all([
    queryOne<CustomerRow>(
      `SELECT display_name, company_name, billing_address, email FROM customers WHERE id = $1 AND organization_id = $2`,
      [invoice.customer_id, ctx.orgId]
    ),
    queryOne<OrgRow>(
      `SELECT name, address_street1, address_street2, address_city, address_state, location_country, currency
       FROM organizations WHERE id = $1`,
      [ctx.orgId]
    ),
    query<LineRow>(
      `SELECT ii.description, ii.quantity, ii.rate, ii.amount, i.name AS item_name
       FROM invoice_items ii
       LEFT JOIN items i ON i.id = ii.item_id
       WHERE ii.invoice_id = $1
       ORDER BY ii.id ASC`,
      [invoice.id]
    ),
    query<PaymentRow>(
      `SELECT pr.payment_number, pr.payment_date, pa.amount
       FROM payment_allocations pa
       JOIN payments_received pr ON pr.id = pa.payment_id
       WHERE pa.invoice_id = $1
       ORDER BY pr.payment_date DESC, pr.created_at DESC`,
      [invoice.id]
    ),
    query<JournalLineRow>(
      `SELECT a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.invoice_id = $1
       ORDER BY jl.id ASC`,
      [invoice.id]
    ),
    invoice.sales_order_id
      ? queryOne<SalesOrderRow>(
          `SELECT id, so_number FROM sales_orders WHERE id = $1 AND organization_id = $2`,
          [invoice.sales_order_id, ctx.orgId]
        )
      : Promise.resolve(null),
    invoice.project_id
      ? queryOne<ProjectRow>(`SELECT id, name FROM projects WHERE id = $1 AND organization_id = $2`, [invoice.project_id, ctx.orgId])
      : Promise.resolve(null),
    invoice.unit_id
      ? queryOne<UnitRow>(`SELECT id, name FROM inventory WHERE id = $1 AND organization_id = $2`, [invoice.unit_id, ctx.orgId])
      : Promise.resolve(null),
    getOrgLogoDataUri(ctx.orgId),
  ]);

  return (
    <InvoiceDetailView
      invoice={{
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        status: invoice.status,
        subtotal: Number(invoice.subtotal),
        taxTotal: Number(invoice.tax_total),
        total: Number(invoice.total),
        balanceDue: Number(invoice.balance_due),
        notes: invoice.notes,
      }}
      customer={
        customer
          ? {
              displayName: customer.display_name,
              companyName: customer.company_name,
              billingAddress: customer.billing_address,
              email: customer.email,
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
        amount: Number(l.amount),
      }))}
      payments={payments.map((p) => ({
        paymentNumber: p.payment_number,
        paymentDate: p.payment_date,
        amount: Number(p.amount),
      }))}
      journalLines={journalLines.map((j) => ({
        accountName: j.account_name,
        debit: Number(j.debit),
        credit: Number(j.credit),
      }))}
      salesOrder={salesOrder ? { id: salesOrder.id, soNumber: salesOrder.so_number } : null}
      project={project ? { id: project.id, name: project.name } : null}
      unit={unit ? { id: unit.id, name: unit.name } : null}
    />
  );
}
