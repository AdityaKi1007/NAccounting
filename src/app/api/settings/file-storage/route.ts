import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { encryptSecret } from "@/lib/secrets-crypto";
import { invalidateOrgS3Config } from "@/lib/s3";

interface OrgS3Row {
  s3_access_key_id: string | null;
  s3_region: string | null;
  s3_bucket_name: string | null;
  s3_endpoint: string | null;
  s3_force_path_style: boolean;
  s3_secret_access_key_encrypted: string | null;
}

// GET /api/settings/file-storage — every non-secret field, plus secret_key_set (never the
// decrypted key itself, or even the encrypted column) so the form can show "a secret key is
// already saved — leave blank to keep it" without ever exposing the value to the browser.
export async function GET() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const org = await queryOne<OrgS3Row>(
    `SELECT s3_access_key_id, s3_region, s3_bucket_name, s3_endpoint, s3_force_path_style, s3_secret_access_key_encrypted
     FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );
  return NextResponse.json({
    s3_access_key_id: org?.s3_access_key_id ?? "",
    s3_region: org?.s3_region ?? "",
    s3_bucket_name: org?.s3_bucket_name ?? "",
    s3_endpoint: org?.s3_endpoint ?? "",
    s3_force_path_style: Boolean(org?.s3_force_path_style),
    secret_key_set: Boolean(org?.s3_secret_access_key_encrypted),
  });
}

function nullableStr(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// PATCH /api/settings/file-storage — access key id/region/bucket are required; secret access
// key is optional on an update (omit it to keep the currently-saved one) but required the
// first time. endpoint/force-path-style are always optional (only needed for an S3-compatible
// provider — MinIO, Cloudflare R2, etc. — not real AWS).
export async function PATCH(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update file storage settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const accessKeyId = nullableStr(body.s3_access_key_id);
  if (!accessKeyId) return NextResponse.json({ error: "Access Key ID is required." }, { status: 400 });

  const region = nullableStr(body.s3_region);
  if (!region) return NextResponse.json({ error: "Region is required." }, { status: 400 });

  const bucketName = nullableStr(body.s3_bucket_name);
  if (!bucketName) return NextResponse.json({ error: "Bucket Name is required." }, { status: 400 });

  const endpoint = nullableStr(body.s3_endpoint);
  const forcePathStyle = Boolean(body.s3_force_path_style);
  const secretAccessKey = typeof body.s3_secret_access_key === "string" ? body.s3_secret_access_key : "";

  const existing = await queryOne<{ s3_secret_access_key_encrypted: string | null }>(
    `SELECT s3_secret_access_key_encrypted FROM organizations WHERE id = $1`,
    [ctx.orgId]
  );

  let secretEncrypted = existing?.s3_secret_access_key_encrypted ?? null;
  if (secretAccessKey) {
    secretEncrypted = encryptSecret(secretAccessKey);
  } else if (!secretEncrypted) {
    return NextResponse.json({ error: "Secret Access Key is required." }, { status: 400 });
  }

  await pool.query(
    `UPDATE organizations
     SET s3_access_key_id = $2, s3_secret_access_key_encrypted = $3, s3_region = $4, s3_bucket_name = $5,
         s3_endpoint = $6, s3_force_path_style = $7
     WHERE id = $1`,
    [ctx.orgId, accessKeyId, secretEncrypted, region, bucketName, endpoint, forcePathStyle]
  );
  invalidateOrgS3Config(ctx.orgId);

  return NextResponse.json({ ok: true });
}

// DELETE /api/settings/file-storage — clears this org's own S3 settings, so attachments fall
// back to the app-wide AWS_*/S3_* env vars (if set) or start failing with
// AttachmentsNotConfiguredError (if not).
export async function DELETE() {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update file storage settings." }, { status: 403 });
  }

  await pool.query(
    `UPDATE organizations
     SET s3_access_key_id = NULL, s3_secret_access_key_encrypted = NULL, s3_region = NULL,
         s3_bucket_name = NULL, s3_endpoint = NULL, s3_force_path_style = false
     WHERE id = $1`,
    [ctx.orgId]
  );
  invalidateOrgS3Config(ctx.orgId);

  return NextResponse.json({ ok: true });
}
