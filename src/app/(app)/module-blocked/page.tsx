import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { moduleLabel } from "@/lib/modules";

// Landing spot for requireModuleAccess()'s redirect (see src/lib/module-access.ts). Lives
// inside the (app) route group — unlike /pending-approval — because the user IS in a normal,
// approved org and should keep seeing the Topbar/Sidebar; only this one page's content says
// the module they tried to reach isn't available to them.
export default function ModuleBlockedPage({
  searchParams,
}: {
  searchParams: { module?: string; reason?: string };
}) {
  const label = searchParams.module ? moduleLabel(searchParams.module) : "This module";
  const message =
    searchParams.reason === "role_restricted"
      ? "Your role doesn't have access to this module. Ask your organization's Owner or Admin to grant it under Settings → Users & Roles."
      : "This module has been disabled for your organization by a platform administrator.";

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <ShieldOff size={22} />
        </div>
        <h1 className="text-base font-semibold text-ink-800">{label} isn&apos;t available</h1>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
