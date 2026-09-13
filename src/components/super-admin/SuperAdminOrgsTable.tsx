"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Check, X, ShieldCheck, ShieldOff, ShieldAlert, UserCog } from "lucide-react";
import clsx from "clsx";
import { formatDate, orgDisplayId } from "@/lib/format";
import { GATEABLE_MODULES } from "@/lib/modules";
import type { SuperAdminOrgRow } from "@/lib/super-admin";
import type { SuperAdminMemberRow } from "@/app/api/super-admin/organizations/[id]/members/route";

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
    suspended: "bg-gray-200 text-gray-700",
  };
  return (
    <span className={clsx("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", styles[status] ?? "bg-gray-100 text-gray-600")}>
      {status}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-brand-50 text-brand-700",
    admin: "bg-blue-50 text-blue-700",
    staff: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={clsx("inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize", styles[role] ?? "bg-gray-100 text-gray-600")}>
      {role}
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
    Record<
      string,
      {
        subscription_plan: string;
        max_users: string;
        api_request_limit_per_day: string;
        disabled_modules: Set<string>;
        rejection_reason: string;
      }
    >
  >({});
  // Members list per org id — fetched lazily the first time a row is expanded, so the panel
  // can show who's in the organization and let the Super Admin designate its Admin.
  const [members, setMembers] = useState<Record<string, SuperAdminMemberRow[] | undefined>>({});
  const [membersLoading, setMembersLoading] = useState<string | null>(null);
  const [memberSaving, setMemberSaving] = useState<string | null>(null);

  function draftFor(org: SuperAdminOrgRow) {
    return (
      drafts[org.id] ?? {
        subscription_plan: org.subscription_plan,
        max_users: org.max_users == null ? "" : String(org.max_users),
        api_request_limit_per_day: org.api_request_limit_per_day == null ? "" : String(org.api_request_limit_per_day),
        disabled_modules: new Set(org.disabled_modules),
        rejection_reason: org.rejection_reason ?? "",
      }
    );
  }

  function updateDraft(orgId: string, patch: Partial<ReturnType<typeof draftFor>>) {
    setDrafts((prev) => ({ ...prev, [orgId]: { ...draftFor(organizations.find((o) => o.id === orgId)!), ...prev[orgId], ...patch } }));
  }

  async function loadMembers(orgId: string) {
    setMembersLoading(orgId);
    try {
      const res = await fetch(`/api/super-admin/organizations/${orgId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers((prev) => ({ ...prev, [orgId]: data.members }));
      }
    } finally {
      setMembersLoading(null);
    }
  }

  function toggleExpand(org: SuperAdminOrgRow) {
    setError(null);
    const willOpen = expanded !== org.id;
    setExpanded((prev) => (prev === org.id ? null : org.id));
    if (!drafts[org.id]) updateDraft(org.id, {});
    if (willOpen && !members[org.id]) loadMembers(org.id);
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

  async function suspend(org: SuperAdminOrgRow) {
    const ok = await patchOrg(org.id, { approval_status: "suspended" });
    if (ok) await refresh();
  }

  async function reactivate(org: SuperAdminOrgRow) {
    const ok = await patchOrg(org.id, { approval_status: "approved" });
    if (ok) await refresh();
  }

  async function saveSettings(org: SuperAdminOrgRow) {
    const draft = draftFor(org);
    const maxUsers = draft.max_users.trim() === "" ? null : parseInt(draft.max_users, 10);
    const apiRequestLimit =
      draft.api_request_limit_per_day.trim() === "" ? null : parseInt(draft.api_request_limit_per_day, 10);
    const ok = await patchOrg(org.id, {
      // Subscription Plan isn't offered for a Super Admin's own organization (see the hidden
      // field above) — and the API itself now refuses that field for such an org — so it's
      // left out of the payload entirely rather than resending an unchanged value.
      ...(org.owner_is_super_admin ? {} : { subscription_plan: draft.subscription_plan }),
      max_users: maxUsers,
      api_request_limit_per_day: apiRequestLimit,
      disabled_modules: Array.from(draft.disabled_modules),
    });
    if (ok) await refresh();
  }

  async function setMemberRole(org: SuperAdminOrgRow, membershipId: string, role: "admin" | "staff") {
    setMemberSaving(membershipId);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/organizations/${org.id}/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      await loadMembers(org.id);
      await refresh();
    } finally {
      setMemberSaving(null);
    }
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
            const orgMembers = members[org.id];
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

                        {org.approval_status === "suspended" && (
                          <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-300 bg-gray-100 px-4 py-3">
                            <ShieldAlert size={16} className="text-gray-600" />
                            <p className="flex-1 text-sm text-gray-700">
                              This organization&apos;s account is suspended — its members can&apos;t sign in until it&apos;s reactivated.
                            </p>
                            <button
                              type="button"
                              disabled={saving === org.id}
                              onClick={(e) => { e.stopPropagation(); reactivate(org); }}
                              className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                            >
                              <Check size={13} /> Reactivate
                            </button>
                          </div>
                        )}

                        {org.approval_status === "approved" && !org.owner_is_super_admin && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={saving === org.id}
                              onClick={(e) => { e.stopPropagation(); suspend(org); }}
                              className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                            >
                              <ShieldOff size={13} /> Suspend Account
                            </button>
                          </div>
                        )}

                        {org.owner_is_super_admin && (
                          <p className="text-xs text-gray-400">
                            This organization is owned by a Super Admin — subscription plan and suspend controls
                            don&apos;t apply here.
                          </p>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          {!org.owner_is_super_admin && (
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
                          )}
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
                          <div>
                            <label className="label">API Request Limit (per day, blank = unlimited)</label>
                            <input
                              className="input"
                              type="number"
                              min={1}
                              value={draft.api_request_limit_per_day}
                              onChange={(e) => updateDraft(org.id, { api_request_limit_per_day: e.target.value })}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Unlimited"
                            />
                            <p className="mt-1 text-xs text-gray-400">
                              Applies to this organization&apos;s /api/v1 requests. Shown read-only to their Admin
                              under Settings → Configurations → General.
                            </p>
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

                        <div className="border-t border-gray-200 pt-5">
                          <div className="mb-2 flex items-center gap-1.5">
                            <UserCog size={15} className="text-gray-500" />
                            <p className="label mb-0">Members &amp; Admin</p>
                          </div>
                          <p className="mb-3 text-xs text-gray-500">
                            Designate which member of this organization holds its Admin role. The org&apos;s own Owner
                            or Admin can invite and manage members from their own Settings — this only changes who has
                            that access.
                          </p>
                          {membersLoading === org.id && !orgMembers ? (
                            <p className="text-sm text-gray-400">Loading members...</p>
                          ) : !orgMembers || orgMembers.length === 0 ? (
                            <p className="text-sm text-gray-400">No members yet.</p>
                          ) : (
                            <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                              <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  <tr>
                                    <th className="px-4 py-2">Name</th>
                                    <th className="px-4 py-2">Email</th>
                                    <th className="px-4 py-2">Role</th>
                                    <th className="px-4 py-2 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {orgMembers.map((m) => (
                                    <tr key={m.membership_id}>
                                      <td className="px-4 py-2 text-ink-700">{m.name}</td>
                                      <td className="px-4 py-2 text-ink-700">{m.email}</td>
                                      <td className="px-4 py-2"><RoleBadge role={m.role} /></td>
                                      <td className="px-4 py-2 text-right">
                                        {m.role === "owner" ? (
                                          <span className="text-xs text-gray-400">-</span>
                                        ) : m.role === "admin" ? (
                                          <button
                                            type="button"
                                            disabled={memberSaving === m.membership_id}
                                            onClick={(e) => { e.stopPropagation(); setMemberRole(org, m.membership_id, "staff"); }}
                                            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                          >
                                            {memberSaving === m.membership_id ? "Saving..." : "Remove Admin"}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={memberSaving === m.membership_id}
                                            onClick={(e) => { e.stopPropagation(); setMemberRole(org, m.membership_id, "admin"); }}
                                            className="rounded-md border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
                                          >
                                            {memberSaving === m.membership_id ? "Saving..." : "Make Admin"}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
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
