import { getEntity } from "@/lib/entities";
import { notFound } from "next/navigation";
import EntityFormPage from "@/components/crud/EntityFormPage";
import DocumentFormPage from "@/components/crud/DocumentFormPage";
import JournalFormPage from "@/components/crud/JournalFormPage";
import CustomerFormPage from "@/components/crud/CustomerFormPage";
import SalesOrderFormPage from "@/components/sales-orders/SalesOrderFormPage";

export default function SlugEditPage({ params }: { params: { slug: string; id: string } }) {
  const entity = getEntity(params.slug);
  if (!entity) notFound();
  // Belt-and-suspenders: a literal /credit-notes/[id] or /debit-notes/[id] route (which wins
  // over this catch-all) renders the real read-only detail view. If that's ever missing,
  // fall through to a 404 rather than the generic edit form (restrictedCrud entities have no
  // edit form — every write goes through their own bespoke, transactional endpoint).
  if (entity.restrictedCrud) notFound();

  if (entity.kind === "document") return <DocumentFormPage entityKey={params.slug} id={params.id} />;
  if (entity.kind === "journal") return <JournalFormPage id={params.id} />;
  if (entity.kind === "customer") return <CustomerFormPage id={params.id} />;
  if (entity.kind === "sales_order") return <SalesOrderFormPage id={params.id} />;
  return <EntityFormPage entityKey={params.slug} id={params.id} />;
}
