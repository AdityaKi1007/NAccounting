import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /chart-of-accounts/new against the more specific /chart-of-accounts/[id] detail
// route added alongside this file, treating "new" as an account id instead of the
// create-account form.
export default function ChartOfAccountsNewPage() {
  return <EntityFormPage entityKey="chart-of-accounts" />;
}
