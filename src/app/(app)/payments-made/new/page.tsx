import RecordPaymentMadeFormPage from "@/components/payments/RecordPaymentMadeFormPage";

// A literal "new" route, not just the generic /[slug]/new one — same reasoning as
// payments-received/new/page.tsx.
// ?vendor=<id>&bill=<id> is the deep-link prefill from a Bill's "Record Payment" button (see
// BillDetailView.tsx) — passed straight through as the form's initial vendor + single-bill
// allocation target.
export default function PaymentsMadeNewPage({ searchParams }: { searchParams: { vendor?: string; bill?: string } }) {
  return <RecordPaymentMadeFormPage initialVendorId={searchParams.vendor} initialBillId={searchParams.bill} />;
}
