import EntityFormPage from "@/components/crud/EntityFormPage";

// Payments have a read-only detail view at /payments-received/[id] (see the sibling
// page.tsx), so editing moves one level deeper instead of overloading that route. Editing
// still uses the generic flat form — allocations aren't editable there (see the
// payments-received entity's notes in src/lib/entities.ts), only the payment's own fields.
export default function PaymentEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="payments-received" id={params.id} />;
}
