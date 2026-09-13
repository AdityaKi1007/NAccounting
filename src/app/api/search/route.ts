import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { getVisibleModuleKeys } from "@/lib/module-access";
import { runGlobalSearch } from "@/lib/search";

// Backend for the Topbar's global search box — see search.ts for the per-entity queries. No
// module-level access check here beyond auth: this route itself doesn't expose one module, it
// fans out across many, so the per-group gating happens inside runGlobalSearch via
// getVisibleModuleKeys (same access boundary the Sidebar nav uses), not a single
// moduleAccessErrorResponse call.
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  if (q.trim().length < 2) return NextResponse.json({ groups: [] });

  const visibleModuleKeys = await getVisibleModuleKeys(ctx);
  const groups = await runGlobalSearch(ctx.orgId, q, visibleModuleKeys);
  return NextResponse.json({ groups });
}
