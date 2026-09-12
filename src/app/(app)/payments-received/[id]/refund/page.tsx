import RefundFormPage from "@/components/payments/RefundFormPage";

// Refunding a Paid Payment Received's excess/unapplied amount — reached from the "Refund"
// button on that payment's own detail view (see PaymentDetailView.tsx). One level deeper than
// the detail view, same pattern as .../edit, rendered as a Modal over it (see RefundForm.tsx).
export default function PaymentRefundPage({ params }: { params: { id: string } }) {
  return <RefundFormPage id={params.id} />;
}
