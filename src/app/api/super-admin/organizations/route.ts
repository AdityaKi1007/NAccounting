import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSuperAdminApiContext } from "@/lib/super-admin";

export interface SuperAdminOrgRow {
  id: string;
  name: string;
  org_seq: string;
  approval_status: string;
  approved_at: string | null;
  rejection_reason: string | null;
  subscription_plan: string;
  max_users: number | null;
  disabled_modules: string[];
  created_at: string;
  member_count: number;
  owner_email: string | null;
}

export async function GET() {
  const ctx = await getSuperAdminApiContext();
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await query<SuperAdminOrgRow>(
    `SELECT o.id, o.name, o.org_seq, o.approval_status, o.approved_at, o.rejection_reason,
            o.subscription_plan, o.max_users, o.disabled_modules, o.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id) AS member_count,
            (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = o.id AND m.role = 'owner' ORDER BY m.created_at ASC LIMIT 1) AS owner_email
     FROM organizations o
     ORDER BY (o.approval_status = 'pending') DESC, o.created_at DESC`
  );
  return NextResponse.json({ organizations: rows });
}
