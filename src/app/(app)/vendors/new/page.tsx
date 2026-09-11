import EntityFormPage from "@/components/crud/EntityFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /vendors/new against the more specific /vendors/[id] detail route added alongside
// this file, treating "new" as a vendor id instead of the create-vendor form. Same shadowing
// issue Chart of Accounts, Projects/Buildings, Customers, Sales Orders and Purchase Orders
// already hit for the same reason.
export default function VendorsNewPage() {
  return <EntityFormPage entityKey="vendors" />;
}
