import Link from "next/link";
import { ChevronLeft, History } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

// Placeholder only — this app has no audit-log table at all today (no record of who changed
// what and when across the app). A real Activity Log/Audit Trail needs a new logging system
// that hooks into every create/update/delete across the app, going forward — it can't be
// derived from existing data the way every other report in this section is. Shown here
// (rather than omitted from the list) so the report catalog matches the reference screenshot,
// with the entry-point ready for when that logging feature is built.
export default async function ActivityLogsPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Activity Logs &amp; Audit Trail</h1>
      </div>

      <div className="p-6">
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <History size={28} className="text-gray-300" />
          <p className="text-sm font-medium text-ink-700">Activity logging isn&apos;t built in this app yet.</p>
          <p className="max-w-md text-sm text-gray-500">
            Nothing in this app currently records who created, changed, or deleted a record, or when — so there&apos;s
            no history for this page to show. Adding that logging is a separate, larger feature (a new table plus
            hooks into every write across the app) better scoped on its own.
          </p>
        </div>
      </div>
    </div>
  );
}
