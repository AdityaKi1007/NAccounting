import CreditDebitNoteFormPage from "@/components/credit-debit-notes/CreditDebitNoteFormPage";

// Reached from the invoice detail page's "..." menu (InvoiceDetailView.tsx) — always scoped
// to one specific invoice, never a standalone "+ New Credit Note" entry point.
export default function InvoiceCreditNoteNewPage({ params }: { params: { id: string } }) {
  return <CreditDebitNoteFormPage kind="credit" invoiceId={params.id} />;
}
