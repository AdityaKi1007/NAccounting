import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/crud/PageHeader";

export default function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="m-6 card flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Icon size={40} className="text-gray-300" />
        <p className="max-w-sm text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}
