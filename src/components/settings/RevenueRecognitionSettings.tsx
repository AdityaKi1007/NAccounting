import Link from "next/link";
import { ListChecks, Link2, TrendingUp } from "lucide-react";
import SettingsEntityList from "@/components/settings/SettingsEntityList";

// Settings -> General -> Revenue Recognition. Was a static placeholder (heading, explainer
// paragraph, "Contact Support" button, three workflow-step icons — matching the reference
// Zoho Books screenshot) until this feature; now a real, working settings page: the same
// explainer card (kept, since it still accurately describes the 3-step workflow this feature
// actually implements) plus the live Revenue Recognition Rules table (reusing
// SettingsEntityList, same "generic flat entity embedded in a settings sub-page" pattern as
// Currencies/Payment Terms) and a link into the new Deferred Revenue report. "Contact Support"
// is replaced with a link to the rules table below rather than removed outright — the
// reference screenshot's own call to action, now pointed at something real instead of a
// support form this app doesn't have.
export default function RevenueRecognitionSettings({
  orgId,
  canManage = true,
}: {
  orgId: string;
  canManage?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col items-center gap-4 py-10 text-center">
        <h2 className="text-base font-semibold text-ink-800">Recognize Revenue Over Time</h2>
        <p className="max-w-lg text-sm text-gray-500">
          Instead of recognizing the full amount of an invoice on the day it&apos;s raised, defer it and recognize
          it over the period the service is actually delivered — matching accrual-basis accounting. Money billed
          today for a 12-month service shows up as income a twelfth at a time, not all at once.
        </p>
        <a href="#revenue-recognition-rules" className="btn-primary">
          Set Up Recognition Rules
        </a>

        <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <ListChecks size={28} className="text-brand-600" />
            <p className="text-sm font-medium text-ink-800">Create Recognition Rules</p>
            <p className="text-xs text-gray-500">Define how and how often revenue should be recognized.</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Link2 size={28} className="text-brand-600" />
            <p className="text-sm font-medium text-ink-800">Associate Rules with Transactions</p>
            <p className="text-xs text-gray-500">Tag an invoice line with a rule and its service period.</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <TrendingUp size={28} className="text-brand-600" />
            <p className="text-sm font-medium text-ink-800">Track Recognized and Deferred Revenues</p>
            <p className="text-xs text-gray-500">
              See what&apos;s been recognized and what&apos;s still deferred in the{" "}
              <Link href="/reports/deferred-revenue" className="text-brand-600 underline">
                Deferred Revenue report
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <div id="revenue-recognition-rules">
        <h3 className="mb-3 text-sm font-semibold text-ink-800">Revenue Recognition Rules</h3>
        <SettingsEntityList entityKey="revenue-recognition-rules" orgId={orgId} canManage={canManage} />
      </div>
    </div>
  );
}
