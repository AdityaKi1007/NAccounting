import CustomerFormPage from "@/components/crud/CustomerFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /customers/new against the more specific /customers/[id] detail route added
// alongside this file, treating "new" as a customer id instead of the create-customer form.
// (Same shadowing issue Chart of Accounts and Projects/Buildings already hit for the same
// reason — see chart-of-accounts/new/page.tsx.)
export default function CustomersNewPage() {
  return <CustomerFormPage />;
}
