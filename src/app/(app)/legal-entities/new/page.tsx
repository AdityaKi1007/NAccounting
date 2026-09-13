import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /legal-entities/new against the more specific /legal-entities/[id] detail route
// added alongside this file, treating "new" as a legal-entity id instead of the create form —
// same gotcha documented in buildings/new/page.tsx and projects/new/page.tsx.
export default function LegalEntitiesNewPage() {
  return <EntityFormPage entityKey="legal-entities" />;
}
