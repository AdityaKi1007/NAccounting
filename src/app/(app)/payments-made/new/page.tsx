import RecordPaymentMadeFormPage from "@/components/payments/RecordPaymentMadeFormPage";

// A literal "new" route, not just the generic /[slug]/new one — same reasoning as
// payments-received/new/page.tsx.
export default function PaymentsMadeNewPage() {
  return <RecordPaymentMadeFormPage />;
}
