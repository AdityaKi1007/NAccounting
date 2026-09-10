import RecordPaymentFormPage from "@/components/payments/RecordPaymentFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /payments-received/new against the more specific /payments-received/[id] detail
// route added alongside this file, treating "new" as a payment id instead of the Record
// Payment form.
export default function PaymentsReceivedNewPage() {
  return <RecordPaymentFormPage />;
}
