import PageHeader from "@/components/crud/PageHeader";
import ImportManager from "@/components/ImportManager";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

export default async function ImportPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "import", "view");

  return (
    <div>
      <PageHeader
        title="Import"
        subtitle="Bulk-import Invoices, Customers, Receipts, Sales Orders or Vendors from an Excel file"
      />
      <div className="p-6">
        <ImportManager />
      </div>
    </div>
  );
}
