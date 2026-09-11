import EntityFormPage from "@/components/crud/EntityFormPage";

// Payments Made have a read-only detail view at /payments-made/[id] (see the sibling
// page.tsx), so editing moves one level deeper — mirrors payments-received's own edit page.
// Bill allocations aren't editable there, only the payment's own fields.
export default function PaymentMadeEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="payments-made" id={params.id} />;
}
