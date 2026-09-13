import EntityFormPage from "@/components/crud/EntityFormPage";

// legal-entities has a read-only detail view at /legal-entities/[id] (see the sibling
// ../page.tsx), so editing moves one level deeper instead of overloading that route — same
// pattern as buildings/[id]/edit/page.tsx and projects/[id]/edit/page.tsx.
export default function LegalEntityEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="legal-entities" id={params.id} />;
}
