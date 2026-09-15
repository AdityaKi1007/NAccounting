import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { GATEABLE_MODULES, MODULE_KEYS } from "@/lib/modules";
import { capabilitiesOf } from "@/lib/access-levels";

export type ModuleAction = "view" | "write" | "delete";

export interface ModuleAccessCtx {
  orgId: string;
  role: string;
  roleId?: string | null;
}

/**
 * Shared gate for org Settings screens (Company/Branding/Taxes/Users & Roles/Currencies/
 * Payment Terms/Reminders/API Keys/Webhooks/etc.) — NOT the same thing as evaluateModuleAccess
 * above, which is the per-org custom-role module permission matrix for top-level nav modules.
 * Settings edit access is deliberately simpler and org-independent: only the org's own
 * owner/admin members, or a platform Super Admin (users.is_super_admin, works across every org
 * regardless of their membership role in it), may create/edit/delete a setting. Every other
 * role (staff, or any custom role) gets read-only. Added 2026-09-15 ("setting editable access
 * should be with super admin and company admin only, other roles should have read only access").
 */
export function canManageOrgSettings(ctx: { role: string; isSuperAdmin: boolean }): boolean {
  return ctx.role === "owner" || ctx.role === "admin" || ctx.isSuperAdmin;
}

interface AccessResult {
  allowed: boolean;
  reason?: "module_disabled" | "role_restricted";
}

/**
 * Central enforcement for both the Super Admin's platform-level module toggle
 * (organizations.disabled_modules) and the per-org custom-role permission matrix
 * (role_permissions, via the existing Roles feature). Two ways to be denied a module:
 *
 *  1. The org's Super Admin has disabled this module for the whole organization — applies to
 *     EVERY member, owner/admin included. This is the "fully block" behavior chosen when
 *     scoping this feature: hidden from nav AND blocked here if reached directly.
 *  2. The member's own custom role doesn't grant it. owner/admin are always exempt from this
 *     second check (matches the dozens of existing `ctx.role === "owner" || "admin"` checks
 *     elsewhere in the codebase — this feature never takes anything away from an owner/admin
 *     beyond org-wide disabled modules). A 'staff' membership with no assigned custom role
 *     (roleId null — the default, and every pre-existing staff member's current state) keeps
 *     today's unrestricted access. Only once an org's own Owner/Admin explicitly assigns a
 *     custom role to a staff member does the permission matrix start applying to them — and
 *     for that role, a module with no explicit role_permissions row is denied by default
 *     (an admin must opt a custom role INTO a module, not opt it out).
 *
 * Updated 2026-09-14 (Access Matrix): role_permissions now stores a 10-level `access_level`
 * (No Access / Read/Write/Full x Own/Team/All) instead of two plain view/write flags, and a
 * third `"delete"` action was added alongside view/write. capabilitiesOf() (src/lib/
 * access-levels.ts) is what maps a level down to the view/write/delete booleans actually
 * checked here — see that file's scope note on why Own/Team/All don't yet behave differently
 * from each other (no creator/owner tracking or team hierarchy exists in this app yet).
 */
async function evaluateModuleAccess(
  ctx: ModuleAccessCtx,
  moduleKey: string,
  action: ModuleAction
): Promise<AccessResult> {
  // Keys outside the gate-able module registry (Settings sub-entities like roles, currencies,
  // tax-rates, bank-accounts, payment-terms — none of which are top-level nav modules) are
  // not part of this feature's scope and are never blocked.
  if (!MODULE_KEYS.has(moduleKey)) return { allowed: true };

  const org = await queryOne<{ disabled_modules: string[] }>(
    `SELECT disabled_modules FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  if (org?.disabled_modules?.includes(moduleKey)) {
    return { allowed: false, reason: "module_disabled" };
  }

  if (ctx.role === "owner" || ctx.role === "admin") return { allowed: true };
  if (!ctx.roleId) return { allowed: true };

  const perm = await queryOne<{ access_level: string }>(
    `SELECT access_level FROM role_permissions WHERE role_id = $1 AND module_key = $2`,
    [ctx.roleId, moduleKey]
  );
  if (!perm) return { allowed: false, reason: "role_restricted" };
  const caps = capabilitiesOf(perm.access_level);
  const ok = action === "delete" ? caps.delete : action === "write" ? caps.write : caps.view;
  return ok ? { allowed: true } : { allowed: false, reason: "role_restricted" };
}

/**
 * Bulk version of evaluateModuleAccess's "view" check, for filtering the Sidebar nav down to
 * only the modules this member can actually see — the "hidden from nav" half of the "fully
 * block" behavior chosen when scoping this feature (requireModuleAccess/moduleAccessErrorResponse
 * above are the "blocked at the page/API level" half). One or two queries total rather than
 * one per nav item.
 */
export async function getVisibleModuleKeys(ctx: ModuleAccessCtx): Promise<Set<string>> {
  const org = await queryOne<{ disabled_modules: string[] }>(
    `SELECT disabled_modules FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  const disabled = new Set(org?.disabled_modules ?? []);
  const allKeys = GATEABLE_MODULES.map((m) => m.key);

  if (ctx.role === "owner" || ctx.role === "admin" || !ctx.roleId) {
    return new Set(allKeys.filter((k) => !disabled.has(k)));
  }

  const perms = await query<{ module_key: string; access_level: string }>(
    `SELECT module_key, access_level FROM role_permissions WHERE role_id = $1`,
    [ctx.roleId]
  );
  const viewable = new Set(perms.filter((p) => capabilitiesOf(p.access_level).view).map((p) => p.module_key));
  return new Set(allKeys.filter((k) => !disabled.has(k) && viewable.has(k)));
}

/** Server-page helper: redirects to /module-blocked when access is denied. */
export async function requireModuleAccess(
  ctx: ModuleAccessCtx,
  moduleKey: string,
  action: ModuleAction = "view"
): Promise<void> {
  const result = await evaluateModuleAccess(ctx, moduleKey, action);
  if (!result.allowed) {
    redirect(`/module-blocked?module=${encodeURIComponent(moduleKey)}&reason=${result.reason}`);
  }
}

/** API-route helper: returns a 403 NextResponse when access is denied, or null to continue. */
export async function moduleAccessErrorResponse(
  ctx: ModuleAccessCtx,
  moduleKey: string,
  action: ModuleAction = "view"
): Promise<NextResponse | null> {
  const result = await evaluateModuleAccess(ctx, moduleKey, action);
  if (!result.allowed) {
    return NextResponse.json(
      {
        error:
          result.reason === "module_disabled"
            ? "This module has been disabled for your organization."
            : "You don't have access to this module.",
      },
      { status: 403 }
    );
  }
  return null;
}
