import { getEntity } from "@/lib/entities";
import { notFound } from "next/navigation";
import EntityFormPage from "@/components/crud/EntityFormPage";
import DocumentFormPage from "@/components/crud/DocumentFormPage";
import JournalFormPage from "@/components/crud/JournalFormPage";
import CustomerFormPage from "@/components/crud/CustomerFormPage";
import RecordPaymentFormPage from "@/components/payments/RecordPaymentFormPage";
import SalesOrderFormPage from "@/components/sales-orders/SalesOrderFormPage";

export default function SlugNewPage({ params }: { params: { slug: string } }) {
  const entity = getEntity(params.slug);
  if (!entity) notFound();
  // e.g. credit-notes/debit-notes: no generic "+ New" flow exists for these — they're only
  // ever created from a specific invoice (see EntityDef.restrictedCrud).
  if (entity.restrictedCrud) notFound();

  if (entity.kind === "document") return <DocumentFormPage entityKey={params.slug} />;
  if (entity.kind === "journal") return <JournalFormPage />;
  if (entity.kind === "customer") return <CustomerFormPage />;
  if (entity.kind === "payment") return <RecordPaymentFormPage />;
  if (entity.kind === "sales_order") return <SalesOrderFormPage />;
  return <EntityFormPage entityKey={params.slug} />;
}
