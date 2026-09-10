import Link from "next/link";
import { Plus } from "lucide-react";

export default function PageHeader({
  title,
  subtitle,
  newHref,
  newLabel,
  actions,
}: {
  title: string;
  subtitle?: string;
  newHref?: string;
  newLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-800">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {newHref && (
          <Link href={newHref} className="btn-primary">
            <Plus size={16} />
            {newLabel ?? "New"}
          </Link>
        )}
      </div>
    </div>
  );
}
