import BillFormPage from "@/components/bills/BillFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /bills/new against the more specific /bills/[id] detail route added alongside
// this file, treating "new" as a bill id instead of the create-bill form.
export default function BillsNewPage() {
  return <BillFormPage />;
}
