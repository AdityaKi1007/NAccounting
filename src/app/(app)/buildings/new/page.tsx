import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /buildings/new against the more specific /buildings/[id] detail route added
// alongside this file, treating "new" as a building id instead of the create-building form.
export default function BuildingsNewPage() {
  return <EntityFormPage entityKey="buildings" />;
}
