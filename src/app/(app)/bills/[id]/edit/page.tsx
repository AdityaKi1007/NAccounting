import BillFormPage from "@/components/bills/BillFormPage";

// Bills have a read-only detail view (Journal + Payments Made history) at /bills/[id] — see
// the sibling page.tsx — so editing moves one level deeper instead of overloading that route.
export default function BillEditPage({ params }: { params: { id: string } }) {
  return <BillFormPage id={params.id} />;
}
