import DocumentFormPage from "@/components/crud/DocumentFormPage";

// Purchase orders have a read-only, print/PDF-styled detail view at /purchase-orders/[id]
// (see the sibling ../page.tsx), so editing moves one level deeper instead of overloading
// that route — same pattern as invoices, sales orders, and payments received.
export default function PurchaseOrderEditPage({ params }: { params: { id: string } }) {
  return <DocumentFormPage entityKey="purchase-orders" id={params.id} />;
}
