import ExpenseFormPage from "@/components/expenses/ExpenseFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /expenses/new against the more specific /expenses/[id] detail route added
// alongside this file, treating "new" as an expense id instead of the create-expense form.
// Same shadowing issue Vendors, Customers, Chart of Accounts etc. already hit.
export default function ExpensesNewPage() {
  return <ExpenseFormPage />;
}
