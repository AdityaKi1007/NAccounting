import EntityFormPage from "@/components/crud/EntityFormPage";

// projects has a read-only detail view at /projects/[id] (see the sibling ../page.tsx), so
// editing moves one level deeper instead of overloading that route.
export default function ProjectEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="projects" id={params.id} />;
}
