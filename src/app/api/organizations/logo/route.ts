import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_SIZE_BYTES, buildOrgLogoKey } from "@/lib/org-logo";
import { putAttachmentObject, deleteAttachmentObject, getOrgLogoDataUri, AttachmentsNotConfiguredError } from "@/lib/s3";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

// POST /api/organizations/logo — multipart/form-data with a single "file" field. Owner/
// admin gated, same as every other organization-wide settings write (/api/settings/*).
// Uploads to S3 via the exact same putAttachmentObject/deleteAttachmentObject primitives the
// file-attachments feature uses (src/lib/s3.ts) — just under a dedicated
// orgs/{orgId}/logo/{...} key, not the attachments table (see src/lib/org-logo.ts's comment
// for why this is its own small module rather than another attachments.entity_type).
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update the organization logo." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!(file.type in ALLOWED_LOGO_TYPES)) {
    return NextResponse.json(
      { error: `"${file.type || "unknown"}" isn't a supported image type. Allowed: JPG, JPEG, PNG, GIF, BMP.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return NextResponse.json({ error: `Logo must be 1MB or smaller (this file is ${formatBytes(file.size)}).` }, { status: 400 });
  }

  const existing = await queryOne<{ logo_key: string | null }>(`SELECT logo_key FROM organizations WHERE id = $1`, [ctx.orgId]);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildOrgLogoKey(ctx.orgId, file.name);

  try {
    await putAttachmentObject(ctx.orgId, key, buffer, file.type);
  } catch (err) {
    if (err instanceof AttachmentsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Logo upload to S3 failed", err);
    return NextResponse.json({ error: "Could not upload this logo. Please try again." }, { status: 500 });
  }

  await pool.query(`UPDATE organizations SET logo_key = $2, logo_content_type = $3 WHERE id = $1`, [ctx.orgId, key, file.type]);

  // Best-effort cleanup of the old object, done AFTER the new one is saved (not before) so a
  // failed upload never leaves the organization with no logo at all.
  if (existing?.logo_key) {
    deleteAttachmentObject(ctx.orgId, existing.logo_key).catch((err) => console.error("Could not delete old logo object", err));
  }

  const logoDataUri = await getOrgLogoDataUri(ctx.orgId);
  return NextResponse.json({ logoDataUri });
}

// DELETE /api/organizations/logo — removes the current logo, if any. No-op (200) if the
// organization has no logo set, matching this app's usual "delete is idempotent" convention.
export async function DELETE() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update the organization logo." }, { status: 403 });
  }

  const existing = await queryOne<{ logo_key: string | null }>(`SELECT logo_key FROM organizations WHERE id = $1`, [ctx.orgId]);
  if (!existing?.logo_key) {
    return NextResponse.json({ ok: true });
  }

  try {
    await deleteAttachmentObject(ctx.orgId, existing.logo_key);
  } catch (err) {
    if (!(err instanceof AttachmentsNotConfiguredError)) {
      console.error("Could not delete logo object from S3", err);
    }
    // Fall through and clear the DB columns regardless — an org shouldn't be stuck with a
    // logo it can no longer even attempt to remove just because S3 is unreachable right now.
  }

  await pool.query(`UPDATE organizations SET logo_key = NULL, logo_content_type = NULL WHERE id = $1`, [ctx.orgId]);
  return NextResponse.json({ ok: true });
}
