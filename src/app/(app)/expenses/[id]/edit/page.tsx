import ExpenseFormPage from "@/components/expenses/ExpenseFormPage";

// Expenses have a read-only detail view at /expenses/[id] (see the sibling ../page.tsx), so
// editing moves one level deeper instead of overloading that route — same pattern as
// vendors/customers/chart-of-accounts.
export default function ExpenseEditPage({ params }: { params: { id: string } }) {
  return <ExpenseFormPage id={params.id} />;
}
