"use client";

import { Fragment, useEffect, useState } from "react";
import { GATEABLE_MODULES } from "@/lib/modules";

interface RoleOption {
  id: string;
  name: string;
}

type PermMap = Record<string, { can_view: boolean; can_write: boolean }>;

type Level = "none" | "view" | "full";

const MODULE_GROUPS = Array.from(new Set(GATEABLE_MODULES.map((m) => m.group)));

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "none", label: "No Access" },
  { value: "view", label: "View Only" },
  { value: "full", label: "Full Access" },
];

function levelOf(perm: { can_view: boolean; can_write: boolean } | undefined): Level {
  if (!perm) return "none";
  if (perm.can_write) return "full";
  if (perm.can_view) return "view";
  return "none";
}

function permOf(level: Level): { can_view: boolean; can_write: boolean } {
  if (level === "full") return { can_view: true, can_write: true };
  if (level === "view") return { can_view: true, can_write: false };
  return { can_view: false, can_write: false };
}

/**
 * Per-org permission matrix editor for the Roles feature (extends the previously decorative
 * `roles` entity — see role_permissions in the super-admin migration). Shown as a single
 * unified grid — every role as a column, every module as a row, a 3-state dropdown per cell —
 * rather than one role at a time, so the whole organization's access model reads at a glance.
 * Still backed by exactly the same can_view/can_write columns and the same one-role-per-call
 * GET/PUT endpoint as before; this component just fetches and saves all roles at once.
 *
 * Only ever affects a 'staff' membership that has been explicitly assigned a given custom
 * role (memberships.role_id) — owner/admin stay always-full-access, and a staff member with
 * no assigned role keeps today's unrestricted behavior. A module left at "No Access" for a
 * role is denied for anyone assigned that role, same as a module the Super Admin has disabled
 * org-wide.
 */
export default function RolePermissionsManager({ roles }: { roles: RoleOption[] }) {
  const [permsByRole, setPermsByRole] = useState<Record<string, PermMap>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roles.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);
    Promise.all(
      roles.map((r) =>
        fetch(`/api/settings/roles/${r.id}/permissions`)
          .then((res) => res.json())
          .then((data) => {
            const map: PermMap = {};
            for (const row of data.permissions ?? []) {
              map[row.module_key] = { can_view: row.can_view, can_write: row.can_write };
            }
            return [r.id, map] as const;
          })
      )
    )
      .then((entries) => {
        if (cancelled) return;
        setPermsByRole(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the permission matrix.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // roles is a fresh array each render from the parent server component, but its ids are
    // what actually matter — join them so this only re-fetches when the role list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.map((r) => r.id).join(",")]);

  function setCell(roleId: string, moduleKey: string, level: Level) {
    setSaved(false);
    setPermsByRole((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], [moduleKey]: permOf(level) },
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const results = await Promise.all(
        roles.map((r) =>
          fetch(`/api/settings/roles/${r.id}/permissions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permissions: permsByRole[r.id] ?? {} }),
          })
        )
      );
      const failed = results.some((res) => !res.ok);
      if (failed) {
        setError("Some roles' permissions could not be saved. Please try again.");
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (roles.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Create a role above first, then come back here to define what it can view and edit.
      </p>
    );
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Permissions saved.</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
            Set what each role can access, module by module. &quot;Full Access&quot; includes viewing; &quot;No
            Access&quot; hides the module entirely for anyone assigned that role.
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-4 py-2.5">Module</th>
                  {roles.map((r) => (
                    <th key={r.id} className="min-w-[9rem] px-4 py-2.5">{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MODULE_GROUPS.map((group) => (
                  <Fragment key={group}>
                    <tr className="bg-gray-50/60">
                      <td colSpan={1 + roles.length} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {group}
                      </td>
                    </tr>
                    {GATEABLE_MODULES.filter((m) => m.group === group).map((m) => (
                      <tr key={m.key}>
                        <td className="sticky left-0 bg-white px-4 py-2 text-ink-700">{m.label}</td>
                        {roles.map((r) => {
                          const level = levelOf(permsByRole[r.id]?.[m.key]);
                          return (
                            <td key={r.id} className="px-4 py-2">
                              <select
                                className="input py-1 text-xs"
                                value={level}
                                onChange={(e) => setCell(r.id, m.key, e.target.value as Level)}
                              >
                                {LEVEL_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="btn-primary px-4 py-2 text-sm">
              {saving ? "Saving..." : "Save Permissions"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
