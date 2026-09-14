"use client";

import { Fragment, useEffect, useState } from "react";
import { GATEABLE_MODULES } from "@/lib/modules";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/access-levels";

interface RoleOption {
  id: string;
  name: string;
}

type PermMap = Record<string, AccessLevel>;

const MODULE_GROUPS = Array.from(new Set(GATEABLE_MODULES.map((m) => m.group)));

/**
 * Per-org Access Matrix editor (Settings → Users & Roles → Access Matrix) — every custom role
 * as a column, every module (object) as a row, a 10-level dropdown per cell (No Access, then
 * Read/Write/Full x Own/Team/All). Replaces the earlier 3-state RolePermissionsManager built
 * 2026-09-12; same fetch-all/save-all-in-parallel shape, same GET/PUT
 * /api/settings/roles/[id]/permissions endpoint, now speaking access_level instead of two
 * view/write flags.
 *
 * Only ever affects a 'staff' membership explicitly assigned a given custom role
 * (memberships.role_id) — owner/admin are always unrestricted, and a staff member with no
 * assigned role keeps today's unrestricted access. A module left at "No Access" for a role is
 * denied for anyone assigned that role.
 *
 * SCOPE NOTE shown in the UI below: "Own" and "Team" are real, selectable, saved options, but
 * NeoAccounting has no creator/owner tracking on records and no team/manager hierarchy today —
 * until that's built, Own/Team/All within a tier (Read, Write, Full) are enforced identically.
 * See src/lib/access-levels.ts's capabilitiesOf() and the Access Matrix addendum doc.
 */
export default function AccessMatrixManager({ roles }: { roles: RoleOption[] }) {
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
              map[row.module_key] = row.access_level as AccessLevel;
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
        if (!cancelled) setError("Could not load the access matrix.");
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

  function setCell(roleId: string, moduleKey: string, level: AccessLevel) {
    setSaved(false);
    setPermsByRole((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], [moduleKey]: level },
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
        setError("Some roles' access could not be saved. Please try again.");
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
        Create a role above first, then come back here to define what it can read, write or delete.
      </p>
    );
  }

  return (
    <div>
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Access matrix saved.</div>}

      <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <strong>Own / Team / All:</strong> NeoAccounting doesn&apos;t yet track who created each
        record or have a team/manager hierarchy, so within a tier (Read, Write, Full) Own, Team
        and All currently behave the same — every level is saved and shown here for when that
        support is added, but access is enforced today at the Read / Write / Full tier only.
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
            Set what each role can read, write or delete, object by object. &quot;Full&quot; includes
            reading, writing and deleting; &quot;No Access&quot; hides the object entirely for anyone
            assigned that role.
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-4 py-2.5">Object</th>
                  {roles.map((r) => (
                    <th key={r.id} className="min-w-[10rem] px-4 py-2.5">{r.name}</th>
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
                          const level = permsByRole[r.id]?.[m.key] ?? "no_access";
                          return (
                            <td key={r.id} className="px-4 py-2">
                              <select
                                className="input py-1 text-xs"
                                value={level}
                                onChange={(e) => setCell(r.id, m.key, e.target.value as AccessLevel)}
                              >
                                {ACCESS_LEVELS.map((opt) => (
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
              {saving ? "Saving..." : "Save Access Matrix"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
