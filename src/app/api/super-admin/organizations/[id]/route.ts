import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
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
  } = body as {
    approval_status?: "pending" | "approved" | "rejected";
    rejection_reason?: string | null;
    subscription_plan?: string;
    max_users?: number | null;
    disabled_modules?: string[];
  };

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (approval_status !== undefined) {
    if (!["pending", "approved", "rejected"].includes(approval_status)) {
      return NextResponse.json({ error: "Invalid approval status." }, { status: 400 });
    }
    sets.push(`approval_status = $${i++}`);
    values.push(approval_status);
    if (approval_status === "approved") {
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
