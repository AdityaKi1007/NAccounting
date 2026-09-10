import ComingSoon from "@/components/ComingSoon";
import { FolderOpen } from "lucide-react";

export default function DocumentsPage() {
  return (
    <ComingSoon
      title="Documents"
      description="Attachments and files uploaded across your transactions will be stored and searchable here."
      icon={FolderOpen}
    />
  );
}
