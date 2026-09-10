import EntityFormPage from "@/components/crud/EntityFormPage";

// chart-of-accounts has a read-only detail view at /chart-of-accounts/[id] (see the
// sibling page.tsx), so editing moves one level deeper instead of overloading that route.
export default function ChartOfAccountsEditPage({ params }: { params: { id: string } }) {
  return <EntityFormPage entityKey="chart-of-accounts" id={params.id} />;
}
