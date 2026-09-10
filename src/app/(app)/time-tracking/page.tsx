import ComingSoon from "@/components/ComingSoon";
import { Clock } from "lucide-react";

export default function TimeTrackingPage() {
  return (
    <ComingSoon
      title="Manage time"
      description="Log billable hours against projects and customers, then pull them straight onto an invoice."
      icon={Clock}
    />
  );
}
