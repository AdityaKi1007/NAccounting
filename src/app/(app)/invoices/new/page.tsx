import DocumentFormPage from "@/components/crud/DocumentFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /invoices/new against the more specific /invoices/[id] detail route added
// alongside this file, treating "new" as an invoice id instead of the create-invoice form.
export default function InvoicesNewPage() {
  return <DocumentFormPage entityKey="invoices" />;
}
