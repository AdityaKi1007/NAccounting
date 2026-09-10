import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { getOrCreateNumberSeries, formatSeriesNumber } from "@/lib/number-series";
import PageHeader from "@/components/crud/PageHeader";
import CreditDebitNoteForm from "@/components/credit-debit-notes/CreditDebitNoteForm";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
}

interface CustomerRow {
  display_name: string;
  company_name: string | null;
}

interface LineRow {
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  item_name: string | null;
}

// Always opened from one specific invoice (see the "..." menu in InvoiceDetailView.tsx) —
// there's no standalone "+ New Credit/Debit Note" entry point. Pre-fills the note's lines
// from that invoice's own lines (same quantities/rates, editable) and its tax rate, so
// crediting/debiting "this invoice, as billed" is the zero-effort default; the user trims or
// adjusts from there for a partial credit/debit.
export default async function CreditDebitNoteFormPage({ kind, invoiceId }: { kind: "credit" | "debit"; invoiceId: string }) {
  const ctx = await requireActiveContext();

  const invoice = await queryOne<InvoiceRow>(
    `SELECT id, invoice_number, customer_id, status, subtotal, tax_total FROM invoices WHERE id = $1 AND organization_id = $2`,
    [invoiceId, ctx.orgId]
  );
  if (!invoice) notFound();
  if (invoice.status === "draft" || invoice.status === "void") notFound();

  const [customer, lines, itemRows, org, series] = await Promise.all([
    invoice.customer_id
      ? queryOne<CustomerRow>(`SELECT display_name, company_name FROM customers WHERE id = $1 AND organization_id = $2`, [
          invoice.customer_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    query<LineRow>(
      `SELECT ii.item_id, ii.description, ii.quantity, ii.rate, i.name AS item_name
       FROM invoice_items ii LEFT JOIN items i ON i.id = ii.item_id
       WHERE ii.invoice_id = $1 ORDER BY ii.id ASC`,
      [invoiceId]
    ),
    query<{ id: string; name: string; sales_price: number }>(
      `SELECT id, name, sales_price FROM items WHERE organization_id = $1 ORDER BY name ASC`,
      [ctx.orgId]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    getOrCreateNumberSeries(ctx.orgId, kind === "credit" ? "credit-notes" : "debit-notes"),
  ]);

  const invoiceSubtotal = Number(invoice.subtotal);
  const invoiceTaxTotal = Number(invoice.tax_total);
  const invoiceTaxPercent = invoiceSubtotal > 0 ? Math.round((invoiceTaxTotal / invoiceSubtotal) * 10000) / 100 : 0;

  const customerName = customer?.company_name ? `${customer.display_name} (${customer.company_name})` : customer?.display_name ?? "-";
  const numberPreview = series.mode === "auto" ? formatSeriesNumber(series) : undefined;

  const label = kind === "credit" ? "Credit Note" : "Debit Note";

  return (
    <div>
      <PageHeader title={`New ${label}`} subtitle={`Against invoice ${invoice.invoice_number}`} />
      <div className="m-6 card max-w-4xl p-6">
        <CreditDebitNoteForm
          kind={kind}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoice_number}
          customerName={customerName}
          currency={org?.currency ?? "AED"}
          numberPreview={numberPreview}
          defaultTaxPercent={invoiceTaxPercent}
          itemOptions={itemRows.map((r) => ({ value: r.id, label: r.name, salesPrice: Number(r.sales_price) }))}
          initialLines={lines.map((l) => ({
            item_id: l.item_id ?? "",
            description: l.description || l.item_name || "",
            quantity: Number(l.quantity),
            rate: Number(l.rate),
          }))}
        />
      </div>
    </div>
  );
}
