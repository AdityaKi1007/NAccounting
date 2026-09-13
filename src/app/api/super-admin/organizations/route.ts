import { NextResponse } from "next/server";
import { getSuperAdminApiContext, fetchSuperAdminOrganizations } from "@/lib/super-admin";

export async function GET() {
  const ctx = await getSuperAdminApiContext();
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const organizations = await fetchSuperAdminOrganizations();
  return NextResponse.json({ organizations });
}
