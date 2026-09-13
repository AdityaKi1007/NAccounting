import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getSuperAdminApiContext } from "@/lib/super-admin";
import { MODULE_KEYS } from "@/lib/modules";

const PLANS = ["standard", "professional", "premium"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getSuperAdminApiContext();
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const {
    approval_status,
    rejection_reason,
    subscription_plan,
    max_users,
    disabled_modules,
    api_request_limit_per_day,
  } = body as {
    approval_status?: "pending" | "approved" | "rejected" | "suspended";
    rejection_reason?: string | null;
    subscription_plan?: string;
    max_users?: number | null;
    disabled_modules?: string[];
    api_request_limit_per_day?: number | null;
  };

  // Subscription plan and Suspend Account don't apply to a Super Admin's own organization —
  // the UI (SuperAdminOrgsTable) already hides those controls for such a row, but this is the
  // server-side backstop so a direct API call can't do it either.
  const ownerIsSuperAdmin =
    (approval_status === "suspended" || subscription_plan !== undefined)
      ? Boolean(
          (
            await queryOne<{ is_super_admin: boolean }>(
              `SELECT u.is_super_admin FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE m.organization_id = $1 AND m.role = 'owner' ORDER BY m.created_at ASC LIMIT 1`,
              [params.id]
            )
          )?.is_super_admin
        )
      : false;

  if (approval_status === "suspended" && ownerIsSuperAdmin) {
    return NextResponse.json({ error: "A Super Admin's own organization can't be suspended." }, { status: 400 });
  }
  if (subscription_plan !== undefined && ownerIsSuperAdmin) {
    return NextResponse.json({ error: "A Super Admin's own organization doesn't have a subscription plan to set." }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (approval_status !== undefined) {
    if (!["pending", "approved", "rejected", "suspended"].includes(approval_status)) {
      return NextResponse.json({ error: "Invalid approval status." }, { status: 400 });
    }
    sets.push(`approval_status = $${i++}`);
    values.push(approval_status);
    if (approval_status === "approved") {
      // Also covers reactivating a suspended org — re-stamps approved_at/by as the record of
      // who most recently let this organization back in.
      sets.push(`approved_at = now()`, `approved_by = $${i++}`, `rejection_reason = NULL`);
      values.push(ctx.userId);
    } else if (approval_status === "rejected") {
      sets.push(`rejection_reason = $${i++}`);
      values.push(rejection_reason ?? null);
    }
  }

  if (subscription_plan !== undefined) {
    if (!PLANS.includes(subscription_plan)) {
      return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    }
    sets.push(`subscription_plan = $${i++}`);
    values.push(subscription_plan);
  }

  if (max_users !== undefined) {
    if (max_users !== null && (!Number.isInteger(max_users) || max_users < 1)) {
      return NextResponse.json({ error: "Max users must be a positive whole number, or blank for unlimited." }, { status: 400 });
    }
    sets.push(`max_users = $${i++}`);
    values.push(max_users);
  }

  if (disabled_modules !== undefined) {
    if (!Array.isArray(disabled_modules) || disabled_modules.some((k) => typeof k !== "string" || !MODULE_KEYS.has(k))) {
      return NextResponse.json({ error: "Invalid module list." }, { status: 400 });
    }
    sets.push(`disabled_modules = $${i++}`);
    values.push(disabled_modules);
  }

  if (api_request_limit_per_day !== undefined) {
    if (api_request_limit_per_day !== null && (!Number.isInteger(api_request_limit_per_day) || api_request_limit_per_day < 1)) {
      return NextResponse.json(
        { error: "API request limit must be a positive whole number, or blank for unlimited." },
        { status: 400 }
      );
    }
    sets.push(`api_request_limit_per_day = $${i++}`);
    values.push(api_request_limit_per_day);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  values.push(params.id);
  const result = await pool.query(
    `UPDATE organizations SET ${sets.join(", ")} WHERE id = $${i} RETURNING id`,
    values
  );
  if (result.rowCount === 0) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
