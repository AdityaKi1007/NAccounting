import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { getImportConfig } from "@/lib/import/import-catalog";
import { buildImportTemplate } from "@/lib/import/template";

// GET /api/import/template?entity=invoices — downloads a blank .xlsx with the correct
// header row (+ one example row + an Instructions sheet) for the selected object type, per
// the account owner's explicit "add a Download Template button" choice (AskUserQuestion,
// 2026-09-13). Session-authed only, same as the rest of this app's own UI-facing routes
// (this is not part of the external /api/v1/* surface).
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "import", "view");
  if (accessError) return accessError;

  const entity = req.nextUrl.searchParams.get("entity") || "";
  const cfg = getImportConfig(entity);
  if (!cfg) return NextResponse.json({ error: "Unknown import object type." }, { status: 400 });

  const buffer = await buildImportTemplate(entity);
  if (!buffer) return NextResponse.json({ error: "Unknown import object type." }, { status: 400 });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${entity}-import-template.xlsx"`,
    },
  });
}
