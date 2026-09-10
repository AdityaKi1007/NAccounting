import DocumentFormPage from "@/components/crud/DocumentFormPage";

// Invoices have a read-only detail/PDF view at /invoices/[id] (see the sibling page.tsx),
// so editing moves one level deeper instead of overloading that route.
export default function InvoiceEditPage({ params }: { params: { id: string } }) {
  return <DocumentFormPage entityKey="invoices" id={params.id} />;
}
