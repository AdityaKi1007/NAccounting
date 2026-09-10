import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /projects/new against the more specific /projects/[id] detail route added
// alongside this file, treating "new" as a project id instead of the create-project form.
export default function ProjectsNewPage() {
  return <EntityFormPage entityKey="projects" />;
}
