import SalesOrderFormPage from "@/components/sales-orders/SalesOrderFormPage";

// A literal "new" route, not just the generic /[slug]/new one: without it, Next.js would
// resolve /sales-orders/new against the more specific /sales-orders/[id] detail route added
// alongside this file, treating "new" as a sales order id instead of the New Sales Order form.
export default function SalesOrdersNewPage() {
  return <SalesOrderFormPage />;
}
