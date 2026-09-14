import { Info } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  standard: "Standard",
  professional: "Professional",
  premium: "Premium",
};

interface Stat {
  label: string;
  value: string;
  note?: string;
}

// Read-only — every value here is set by a Super Admin (Super Admin panel → Subscription
// Plan / Max Users / API Request Limit), not by this organization's own Owner/Admin, so
// there's nothing to edit on this page. Before this, a company Admin had no way to see any of
// these at all, even though a Super Admin has controlled them since the org-approval /
// subscription-plan feature (2026-09-12) — this closes that visibility gap.
export default function GeneralSettingsInfo({
  subscriptionPlan,
  maxUsers,
  currentUserCount,
  apiRequestLimitPerDay,
  apiRequestsToday,
}: {
  subscriptionPlan: string;
  maxUsers: number | null;
  currentUserCount: number;
  apiRequestLimitPerDay: number | null;
  apiRequestsToday: number;
}) {
  const stats: Stat[] = [
    {
      label: "Subscription Plan",
      value: PLAN_LABELS[subscriptionPlan] ?? subscriptionPlan,
    },
    {
      label: "User Limit",
      value: maxUsers == null ? "Unlimited" : `${currentUserCount} / ${maxUsers}`,
      note: maxUsers == null ? `${currentUserCount} user${currentUserCount === 1 ? "" : "s"} currently` : undefined,
    },
    {
      label: "API Request Limit",
      value: apiRequestLimitPerDay == null ? "Unlimited" : `${apiRequestsToday} / ${apiRequestLimitPerDay} today`,
      note: apiRequestLimitPerDay == null ? `${apiRequestsToday} request${apiRequestsToday === 1 ? "" : "s"} today` : "Resets daily",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="mb-4 flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-gray-400" />
          <p className="text-sm text-gray-500">
            These are set for your organization by NeoAccounting and can&apos;t be changed here.
            Contact support if you need them adjusted.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
              <p className="mt-1 text-lg font-semibold text-ink-800">{s.value}</p>
              {s.note && <p className="mt-0.5 text-xs text-gray-400">{s.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="max-w-sm text-sm text-gray-500">
          Date format, time zone and other organization defaults aren&apos;t configurable here
          yet, but the page is wired up and ready for it.
        </p>
      </div>
    </div>
  );
}
