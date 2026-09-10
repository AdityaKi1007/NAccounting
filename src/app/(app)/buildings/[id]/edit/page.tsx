import EntityFormPage from "@/components/crud/EntityFormPage";

// buildings has a read-only detail view at /buildings/[id] (see the sibling ../page.tsx), so
// editing moves one level deeper instead of overloading that route.
export default function BuildingEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="buildings" id={params.id} />;
}
