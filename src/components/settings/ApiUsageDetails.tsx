import { Activity, KeyRound } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";

interface ApiKeyUsageRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  request_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface DailyUsageRow {
  usage_date: string;
  request_count: number;
}

// "Surface the existing counters in one place" — per the account owner's own answer when this
// feature was scoped, this reuses api_keys.request_count/last_used_at (already tracked in
// api-context.ts's getApiKeyContext) and api_usage_daily (already tracked in
// checkApiRequestLimit) rather than building a new per-request log. Read-only: there is
// nothing to configure here — keys are still generated/revoked from Integrations -> API Keys.
export default function ApiUsageDetails({
  apiRequestLimitPerDay,
  requestsToday,
  dailyUsage,
  apiKeys,
}: {
  apiRequestLimitPerDay: number | null;
  requestsToday: number;
  dailyUsage: DailyUsageRow[];
  apiKeys: ApiKeyUsageRow[];
}) {
  const totalRequests = apiKeys.reduce((sum, k) => sum + (k.request_count || 0), 0);
  const activeKeys = apiKeys.filter((k) => k.is_active).length;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Today&apos;s Usage</p>
            <p className="mt-1 text-lg font-semibold text-ink-800">
              {apiRequestLimitPerDay == null ? `${requestsToday}` : `${requestsToday} / ${apiRequestLimitPerDay}`}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              {apiRequestLimitPerDay == null ? "No daily limit set" : "Resets daily"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total Requests (All Time)</p>
            <p className="mt-1 text-lg font-semibold text-ink-800">{totalRequests}</p>
            <p className="mt-0.5 text-xs text-gray-400">Across every API key</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Active Keys</p>
            <p className="mt-1 text-lg font-semibold text-ink-800">
              {activeKeys} / {apiKeys.length}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">Manage under Integrations → API Keys</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <Activity size={14} className="text-gray-400" /> Last 14 Days
        </p>
        {dailyUsage.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No API requests recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">Date</th>
                  <th className="px-2 py-1.5">Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyUsage.map((d) => (
                  <tr key={d.usage_date}>
                    <td className="px-2 py-1.5 text-ink-700">{formatDate(d.usage_date)}</td>
                    <td className="px-2 py-1.5 text-ink-700">{d.request_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <KeyRound size={14} className="text-gray-400" /> Usage By API Key
        </p>
        {apiKeys.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            No API keys yet. Generate one under Integrations → API Keys.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Key</th>
                  <th className="px-2 py-1.5">Requests</th>
                  <th className="px-2 py-1.5">Last Used</th>
                  <th className="px-2 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-2 py-1.5 text-ink-800">{k.name}</td>
                    <td className="px-2 py-1.5 font-mono text-xs text-ink-700">{k.key_prefix}••••••••</td>
                    <td className="px-2 py-1.5 text-ink-700">{k.request_count}</td>
                    <td className="px-2 py-1.5 text-ink-700">
                      {k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          k.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {k.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
