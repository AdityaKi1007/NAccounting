import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { canManageOrgSettings } from "@/lib/module-access";
import { ACCENT_PRESETS, isValidHex } from "@/lib/theme";

const BRANDING_COLUMNS = `id, accent_color, accent_custom_hex, theme_preference`;

export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne(`SELECT ${BRANDING_COLUMNS} FROM organizations WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ organization: org });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (!canManageOrgSettings(ctx)) {
    return NextResponse.json({ error: "Only owners and admins can update branding." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const accentColor = typeof body.accent_color === "string" ? body.accent_color : "blue";
  const themePreference = body.theme_preference === "dark" ? "dark" : "light";

  let accentCustomHex: string | null = null;
  if (accentColor === "custom") {
    const hex = typeof body.accent_custom_hex === "string" ? body.accent_custom_hex.trim() : "";
    if (!isValidHex(hex)) {
      return NextResponse.json({ error: "Enter a valid hex color, e.g. #4f46e5." }, { status: 400 });
    }
    accentCustomHex = hex;
  } else if (!ACCENT_PRESETS[accentColor]) {
    return NextResponse.json({ error: "Unknown accent color." }, { status: 400 });
  }

  const org = await pool.query(
    `UPDATE organizations SET accent_color = $2, accent_custom_hex = $3, theme_preference = $4
     WHERE id = $1 RETURNING ${BRANDING_COLUMNS}`,
    [ctx.orgId, accentColor, accentCustomHex, themePreference]
  );

  return NextResponse.json({ organization: org.rows[0] });
}
