import ComingSoon from "@/components/ComingSoon";
import { Clock } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

export default async function TimeTrackingPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "time-tracking", "view");

  return (
    <ComingSoon
      title="Manage time"
      description="Log billable hours against projects and customers, then pull them straight onto an invoice."
      icon={Clock}
    />
  );
}
