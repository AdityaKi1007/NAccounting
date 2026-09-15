import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /buildings/new against the more specific /buildings/[id] detail route added
// alongside this file, treating "new" as a building id instead of the create-building form.
//
// 2026-09-15: accepts ?project_id=... so the "+ Add Building" button on a Project's detail
// page (src/app/(app)/projects/[id]/page.tsx) can pre-fill the Project field and send the
// user back to that project (instead of the generic /buildings list) after saving.
export default function BuildingsNewPage({ searchParams }: { searchParams: { project_id?: string } }) {
  const projectId = searchParams?.project_id;
  return (
    <EntityFormPage
      entityKey="buildings"
      presetValues={projectId ? { project_id: projectId } : undefined}
      redirectTo={projectId ? `/projects/${projectId}` : undefined}
    />
  );
}
