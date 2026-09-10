import PageHeader from "@/components/crud/PageHeader";
import BulkUpdateClient from "@/components/BulkUpdateClient";

export default function BulkUpdatePage() {
  return (
    <div>
      <PageHeader title="Bulk Update" subtitle="Select records and apply a field change to all of them at once" />
      <BulkUpdateClient />
    </div>
  );
}
