import EntityFormPage from "@/components/crud/EntityFormPage";

// Vendors have a read-only detail view at /vendors/[id] (see the sibling ../page.tsx), so
// editing moves one level deeper instead of overloading that route — same pattern as
// customers, chart-of-accounts, projects, and buildings.
export default function VendorEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="vendors" id={params.id} />;
}
