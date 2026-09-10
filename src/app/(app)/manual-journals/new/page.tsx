import JournalFormPage from "@/components/crud/JournalFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /manual-journals/new against the more specific /manual-journals/[id] detail route
// added alongside this file (see manual-journals/[id]/page.tsx), treating "new" as a journal
// id instead of the create-journal form — the same shadowing gotcha documented on
// chart-of-accounts/new/page.tsx and every other entity that's since gained hasDetailView.
export default function ManualJournalNewPage() {
  return <JournalFormPage />;
}
