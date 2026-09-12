import Link from "next/link";
import { ChevronLeft, Undo2 } from "lucide-react";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";

// Placeholder only — this app has no refund feature or table at all yet, for either the
// customer side (Payments Received) or the vendor side (Payments Made). A real Refund
// History report needs a refunds data model first (who was refunded, against which
// payment, how much, when); that's a separate feature to scope on its own, not something
// this report page can derive from existing data. Shown here (rather than omitted from the
// list) so the report catalog matches the reference screenshot and it's clear this is a known
// gap, not a missing page.
export default async function RefundHistoryPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "reports", "view");

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/reports" className="mb-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600">
          <ChevronLeft size={12} /> All Reports
        </Link>
        <h1 className="text-lg font-semibold text-ink-800">Refund History</h1>
      </div>

      <div className="p-6">
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Undo2 size={28} className="text-gray-300" />
          <p className="text-sm font-medium text-ink-700">Refunds aren&apos;t supported in this build yet.</p>
          <p className="max-w-md text-sm text-gray-500">
            There&apos;s no way to record a refund against a payment received or a payment made anywhere in this
            app today, so there&apos;s no data for this report to show. Recording refunds would need to be built
            as its own feature first.
          </p>
        </div>
      </div>
    </div>
  );
}
