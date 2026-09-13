import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSuperAdminApiContext } from "@/lib/super-admin";

export interface SuperAdminMemberRow {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
}

// Lets the Super Admin panel list an organization's own members so it can designate one of
// them as that org's Admin (see PATCH .../members/[membershipId]) without needing the org's
// own Owner to do it from inside Settings. Read-only otherwise — inviting/removing members
// stays the org's own Owner/Admin's job via the existing Users & Roles settings page.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getSuperAdminApiContext();
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await query<SuperAdminMemberRow>(
    `SELECT m.id AS membership_id, u.id AS user_id, u.name, u.email, m.role
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1
     ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC, m.created_at ASC`,
    [params.id]
  );
  return NextResponse.json({ members: rows });
}
