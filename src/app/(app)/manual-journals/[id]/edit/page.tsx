import JournalFormPage from "@/components/crud/JournalFormPage";

// Manual Journals now has a read-only detail view at /manual-journals/[id] (see the sibling
// page.tsx), so editing moves one level deeper instead of overloading that route — same
// pattern as chart-of-accounts/[id]/edit/page.tsx.
export default function ManualJournalEditPage({ params }: { params: { id: string } }) {
  return <JournalFormPage id={params.id} />;
}
