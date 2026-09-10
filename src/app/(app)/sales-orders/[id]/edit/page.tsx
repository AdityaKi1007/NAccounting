import SalesOrderFormPage from "@/components/sales-orders/SalesOrderFormPage";

// Sales orders have a read-only, print/PDF-styled detail view at /sales-orders/[id] (see the
// sibling page.tsx), so editing moves one level deeper instead of overloading that route —
// same pattern as invoices and payments-received.
export default function SalesOrderEditPage({ params }: { params: { id: string } }) {
  return <SalesOrderFormPage id={params.id} />;
}
