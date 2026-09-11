import DocumentFormPage from "@/components/crud/DocumentFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /purchase-orders/new against the more specific /purchase-orders/[id] detail route
// added alongside this file, treating "new" as a purchase order id instead of the New
// Purchase Order form. Same shadowing issue Chart of Accounts, Projects/Buildings, Customers
// and Sales Orders already hit for the same reason.
export default function PurchaseOrdersNewPage() {
  return <DocumentFormPage entityKey="purchase-orders" />;
}
