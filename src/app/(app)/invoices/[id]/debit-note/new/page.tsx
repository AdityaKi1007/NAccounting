import CreditDebitNoteFormPage from "@/components/credit-debit-notes/CreditDebitNoteFormPage";

// Reached from the invoice detail page's "..." menu (InvoiceDetailView.tsx) — always scoped
// to one specific invoice, never a standalone "+ New Debit Note" entry point.
export default function InvoiceDebitNoteNewPage({ params }: { params: { id: string } }) {
  return <CreditDebitNoteFormPage kind="debit" invoiceId={params.id} />;
}
