import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import CreditDebitNoteDetailView from "@/components/credit-debit-notes/CreditDebitNoteDetailView";

interface NoteRow {
  id: string;
  debit_note_number: string;
  debit_note_date: string;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  reference_number: string | null;
  reason: string | null;
  customer_id: string | null;
  invoice_id: string | null;
}

interface CustomerRow {
  display_name: string;
  company_name: string | null;
}

interface InvoiceRow {
  invoice_number: string;
}

interface LineRow {
  description: string | null;
  quantity: string;
  rate: string;
  amount: string;
  item_name: string | null;
}

interface JournalLineRow {
  account_name: string;
  debit: string;
  credit: string;
}

export default async function DebitNoteDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "debit-notes", "view");

  const note = await queryOne<NoteRow>(
    `SELECT id, debit_note_number, debit_note_date, status, subtotal, tax_total, total, reference_number, reason, customer_id, invoice_id
     FROM debit_notes WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!note) notFound();

  const [customer, invoice, lines, org, journalLines] = await Promise.all([
    note.customer_id
      ? queryOne<CustomerRow>(`SELECT display_name, company_name FROM customers WHERE id = $1 AND organization_id = $2`, [
          note.customer_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    note.invoice_id
      ? queryOne<InvoiceRow>(`SELECT invoice_number FROM invoices WHERE id = $1 AND organization_id = $2`, [note.invoice_id, ctx.orgId])
      : Promise.resolve(null),
    query<LineRow>(
      `SELECT dni.description, dni.quantity, dni.rate, dni.amount, i.name AS item_name
       FROM debit_note_items dni LEFT JOIN items i ON i.id = dni.item_id
       WHERE dni.debit_note_id = $1 ORDER BY dni.id ASC`,
      [note.id]
    ),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<JournalLineRow>(
      `SELECT a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.debit_note_id = $1
       ORDER BY jl.id ASC`,
      [note.id]
    ),
  ]);

  const customerName = customer?.company_name ? `${customer.display_name} (${customer.company_name})` : customer?.display_name ?? "-";

  return (
    <CreditDebitNoteDetailView
      kind="debit"
      note={{
        id: note.id,
        number: note.debit_note_number,
        date: note.debit_note_date,
        status: note.status,
        subtotal: Number(note.subtotal),
        taxTotal: Number(note.tax_total),
        total: Number(note.total),
        referenceNumber: note.reference_number,
        reason: note.reason,
      }}
      customerName={customerName}
      invoice={invoice && note.invoice_id ? { id: note.invoice_id, number: invoice.invoice_number } : null}
      currency={org?.currency ?? "AED"}
      lines={lines.map((l) => ({
        description: l.description || l.item_name || "",
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        amount: Number(l.amount),
      }))}
      journalLines={journalLines.map((j) => ({ accountName: j.account_name, debit: Number(j.debit), credit: Number(j.credit) }))}
    />
  );
}
