import ComingSoon from "@/components/ComingSoon";
import { FolderOpen } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

export default async function DocumentsPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "documents", "view");

  return (
    <ComingSoon
      title="Documents"
      description="Attachments and files uploaded across your transactions will be stored and searchable here."
      icon={FolderOpen}
    />
  );
}
