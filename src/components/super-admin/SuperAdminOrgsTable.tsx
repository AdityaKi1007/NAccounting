"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Check, X, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { formatDate, orgDisplayId } from "@/lib/format";
import { GATEABLE_MODULES } from "@/lib/modules";
import type { SuperAdminOrgRow } from "@/app/api/super-admin/organizations/route";

const PLANS = [
  { value: "standard", label: "Standard" },
  { value: "professional", label: "Professional" },
  { value: "premium", label: "Premium" },
];

const MODULE_GROUPS = Array.from(new Set(GATEABLE_MODULES.map((m) => m.group)));

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: "bg-green-50 text-green-700",
    pending: "bg-amber-50 text-amber-700",
    rejected: "bg-red-50 text-red-700",
  };
  return (
    <span className={clsx("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", styles[status] ?? "bg-gray-100 text-gray-600")}>
      {status}
    </span>
  );
}

export default function SuperAdminOrgsTable({ initialOrganizations }: { initialOrganizations: SuperAdminOrgRow[] }) {
  const router = useRouter();
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Draft edits per org id, keyed so switching between rows doesn't lose unsaved state.
  const [drafts, setDrafts] = useState<
    Record<string, { subscription_plan: string; max_users: string; disabled_modules: Set<string>; rejection_reason: string }>
  >({});

  function draftFor(org: SuperAdminOrgRow) {
    return (
      drafts[org.id] ?? {
        subscription_plan: org.subscription_plan,
        max_users: org.max_users == null ? "" : String(org.max_users),
        disabled_modules: new Set(org.disabled_modules),
        rejection_reason: org.rejection_reason ?? "",
      }
    );
  }

  function updateDraft(orgId: string, patch: Partial<ReturnType<typeof draftFor>>) {
    setDrafts((prev) => ({ ...prev, [orgId]: { ...draftFor(organizations.find((o) => o.id === orgId)!), ...prev[orgId], ...patch } }));
  }

  function toggleExpand(org: SuperAdminOrgRow) {
    setError(null);
    setExpanded((prev) => (prev === org.id ? null : org.id));
    if (!drafts[org.id]) updateDraft(org.id, {});
  }

  async function patchOrg(orgId: string, body: Record<string, unknown>) {
    setSaving(orgId);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      return true;
    } finally {
      setSaving(null);
    }
  }

  async function refresh() {
    const res = await fetch("/api/super-admin/organizations");
    if (res.ok) {
      const data = await res.json();
      setOrganizations(data.organizations);
    }
    router.refresh();
  }

  async function approve(org: SuperAdminOrgRow) {
    const ok = await patchOrg(org.id, { approval_status: "approved" });
    if (ok) await refresh();
  }

  async function reject(org: SuperAdminOrgRow) {
    const draft = draftFor(org);
    const ok = await patchOrg(org.id, { approval_status: "rejected", rejection_reason: draft.rejection_reason || null });
    if (ok) await refresh();
  }

  async function saveSettings(org: SuperAdminOrgRow) {
    const draft = draftFor(org);
    const maxUsers = draft.max_users.trim() === "" ? null : parseInt(draft.max_users, 10);
    const ok = await patchOrg(org.id, {
      subscription_plan: draft.subscription_plan,
      max_users: maxUsers,
      disabled_modules: Array.from(draft.disabled_modules),
    });
    if (ok) await refresh();
  }

  return (
    <div className="card overflow-hidden">
      {error && <div className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-sm text-red-700">{error}</div>}
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="w-8 px-3 py-2.5" />
            <th className="px-3 py-2.5">Organization</th>
            <th className="px-3 py-2.5">Owner</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Plan</th>
            <th className="px-3 py-2.5">Users</th>
            <th className="px-3 py-2.5">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {organizations.map((org) => {
            const isOpen = expanded === org.id;
            const draft = draftFor(org);
            return (
              <Fragment key={org.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(org)}
                >
                  <td className="px-3 py-2.5 text-gray-400">{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-ink-800">{org.name}</p>
                    <p className="text-xs text-gray-400">Organization ID: {orgDisplayId(org.org_seq)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-ink-700">{org.owner_email ?? "-"}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={org.approval_status} /></td>
                  <td className="px-3 py-2.5 capitalize text-ink-700">{org.subscription_plan}</td>
                  <td className="px-3 py-2.5 text-ink-700">
                    {org.member_count}{org.max_users != null ? ` / ${org.max_users}` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-ink-700">{formatDate(org.created_at)}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={7} className="bg-gray-50 px-6 py-5">
                      <div className="space-y-5">
                        {org.approval_status === "pending" && (
                          <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                            <ShieldCheck size={16} className="text-amber-600" />
                            <p className="flex-1 text-sm text-amber-800">
                              This organization is waiting for approval before its members can sign in.
                            </p>
                            <button
                              type="button"
                              disabled={saving === org.id}
                              onClick={(e) => { e.stopPropagation(); approve(org); }}
                              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                            >
                              <Check size={13} /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={saving === org.id}
                              onClick={(e) => { e.stopPropagation(); reject(org); }}
                              className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              <X size={13} /> Reject
                            </button>
                          </div>
                        )}

                        {org.approval_status === "rejected" && (
                          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            Rejected{org.rejection_reason ? `: ${org.rejection_reason}` : "."}{" "}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); approve(org); }}
                              className="ml-2 font-medium underline"
                            >
                              Approve instead
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="label">Subscription Plan</label>
                            <select
                              className="input"
                              value={draft.subscription_plan}
                              onChange={(e) => updateDraft(org.id, { subscription_plan: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {PLANS.map((p) => (
                                <option key={p.value} value={p.value}>{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label">Max Users (blank = unlimited)</label>
                            <input
                              className="input"
                              type="number"
                              min={1}
                              value={draft.max_users}
                              onChange={(e) => updateDraft(org.id, { max_users: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Unlimited"
                            />
                          </div>
                        </div>

                        {org.approval_status === "rejected" && (
                          <div>
                            <label className="label">Rejection reason (shared with the org&apos;s Owner)</label>
                            <input
                              className="input"
                              value={draft.rejection_reason}
                              onChange={(e) => updateDraft(org.id, { rejection_reason: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}

                        <div>
                          <p className="label mb-2">Enabled Modules</p>
                          <p className="mb-3 text-xs text-gray-500">
                            Unchecking a module fully blocks it for every member of this organization — hidden from
                            navigation and blocked if reached directly.
                          </p>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                            {MODULE_GROUPS.map((group) => (
                              <div key={group}>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{group}</p>
                                <div className="space-y-1">
                                  {GATEABLE_MODULES.filter((m) => m.group === group).map((m) => {
                                    const enabled = !draft.disabled_modules.has(m.key);
                                    return (
                                      <label key={m.key} className="flex items-center gap-2 text-sm text-ink-700">
                                        <input
                                          type="checkbox"
                                          checked={enabled}
                                          onChange={(e) => {
                                            const next = new Set(draft.disabled_modules);
                                            if (e.target.checked) next.delete(m.key);
                                            else next.add(m.key);
                                            updateDraft(org.id, { disabled_modules: next });
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        {m.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={saving === org.id}
                            onClick={(e) => { e.stopPropagation(); saveSettings(org); }}
                            className="btn-primary px-4 py-2 text-sm"
                          >
                            {saving === org.id ? "Saving..." : "Save Settings"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
