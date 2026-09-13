import EntityFormPage from "@/components/crud/EntityFormPage";

// inventory (Units) now has a read-only detail view at /inventory/[id] (see the sibling
// ../page.tsx), so editing moves one level deeper instead of overloading that route — same
// pattern as Projects/Buildings.
export default function InventoryEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="inventory" id={params.id} />;
}
