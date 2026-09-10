import CustomerFormPage from "@/components/crud/CustomerFormPage";

// customers has a read-only detail view at /customers/[id] (see the sibling ../page.tsx), so
// editing moves one level deeper instead of overloading that route.
export default function CustomerEditPage({ params }: { params: { id: string } }) {
  return <CustomerFormPage id={params.id} />;
}
