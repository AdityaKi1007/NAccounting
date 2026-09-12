"use client";

import { Fragment, useEffect, useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { GATEABLE_MODULES } from "@/lib/modules";

interface RoleOption {
  id: string;
  name: string;
}

type PermMap = Record<string, { can_view: boolean; can_write: boolean }>;

const MODULE_GROUPS = Array.from(new Set(GATEABLE_MODULES.map((m) => m.group)));

/**
 * Per-org permission matrix editor for the Roles feature (extends the previously decorative
 * `roles` entity — see role_permissions in the super-admin migration). Only ever affects a
 * 'staff' membership that has been explicitly assigned this custom role (memberships.role_id)
 * — owner/admin stay always-full-access, and a staff member with no assigned role keeps
 * today's unrestricted behavior. A module left unchecked here (both View and Write) is denied
 * for this role, same as a module the Super Admin has disabled org-wide.
 */
export default function RolePermissionsManager({ roles }: { roles: RoleOption[] }) {
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id ?? "");
  const [perms, setPerms] = useState<PermMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedRoleId) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    fetch(`/api/settings/roles/${selectedRoleId}/permissions`)
      .then((res) => res.json())
      .then((data) => {
        const map: PermMap = {};
        for (const row of data.permissions ?? []) {
          map[row.module_key] = { can_view: row.can_view, can_write: row.can_write };
        }
        setPerms(map);
      })
      .catch(() => setError("Could not load this role's permissions."))
      .finally(() => setLoading(false));
  }, [selectedRoleId]);

  function toggle(moduleKey: string, field: "can_view" | "can_write") {
    setSaved(false);
    setPerms((prev) => {
      const current = prev[moduleKey] ?? { can_view: false, can_write: false };
      const next = { ...current, [field]: !current[field] };
      // Write access implies view access — can't edit what you can't see.
      if (field === "can_write" && next.can_write) next.can_view = true;
      if (field === "can_view" && !next.can_view) next.can_write = false;
      return { ...prev, [moduleKey]: next };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/roles/${selectedRoleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not save permissions.");
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
      <div className="mb-4 flex items-center gap-3">
        <label className="label mb-0">Role</label>
        <select className="input max-w-xs" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Permissions saved.</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-gray-500">
            A module with neither box checked is fully hidden and blocked for members assigned this role. Write
            access always includes View.
          </p>
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Module</th>
                  <th className="w-24 px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1"><Eye size={13} /> View</span>
                  </th>
                  <th className="w-24 px-4 py-2.5 text-center">
                    <span className="inline-flex items-center gap-1"><Pencil size={13} /> Write</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {MODULE_GROUPS.map((group) => (
                  <Fragment key={group}>
                    <tr className="bg-gray-50/60">
                      <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {group}
                      </td>
                    </tr>
                    {GATEABLE_MODULES.filter((m) => m.group === group).map((m) => {
                      const p = perms[m.key] ?? { can_view: false, can_write: false };
                      return (
                        <tr key={m.key}>
                          <td className="px-4 py-2 text-ink-700">{m.label}</td>
                          <td className="px-4 py-2 text-center">
                            <input type="checkbox" checked={p.can_view} onChange={() => toggle(m.key, "can_view")} />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input type="checkbox" checked={p.can_write} onChange={() => toggle(m.key, "can_write")} />
                          </td>
                        </tr>
                      );
                    })}
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
