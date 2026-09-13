import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /inventory/new against the more specific /inventory/[id] detail route added
// alongside this file, treating "new" as a unit id instead of the create-unit form — the
// same shadowing gotcha already documented (and fixed the same way) for Projects/Buildings.
export default function InventoryNewPage() {
  return <EntityFormPage entityKey="inventory" />;
}
