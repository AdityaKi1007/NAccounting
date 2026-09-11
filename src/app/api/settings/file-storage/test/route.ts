import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { decryptSecret } from "@/lib/secrets-crypto";
import { testS3Connection, type S3Config } from "@/lib/s3";

// POST /api/settings/file-storage/test — confirms the values currently in the form (not
// necessarily saved yet) can actually reach the bucket, so a user can catch a typo'd key or
// bucket name before Save. Body: { s3_access_key_id, s3_region, s3_bucket_name, s3_endpoint,
// s3_force_path_style, s3_secret_access_key? } — same "omit the secret to reuse the already-
// saved one" convention as the email test route.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can test file storage settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const accessKeyId = typeof body.s3_access_key_id === "string" ? body.s3_access_key_id.trim() : "";
  const region = typeof body.s3_region === "string" ? body.s3_region.trim() : "";
  const bucketName = typeof body.s3_bucket_name === "string" ? body.s3_bucket_name.trim() : "";
  const endpoint = typeof body.s3_endpoint === "string" && body.s3_endpoint.trim() ? body.s3_endpoint.trim() : null;
  const forcePathStyle = Boolean(body.s3_force_path_style);
  let secretAccessKey = typeof body.s3_secret_access_key === "string" ? body.s3_secret_access_key : "";

  if (!accessKeyId || !region || !bucketName) {
    return NextResponse.json({ error: "Fill in Access Key ID, Region and Bucket Name before testing." }, { status: 400 });
  }

  if (!secretAccessKey) {
    const existing = await queryOne<{ s3_secret_access_key_encrypted: string | null }>(
      `SELECT s3_secret_access_key_encrypted FROM organizations WHERE id = $1`,
      [ctx.orgId]
    );
    if (!existing?.s3_secret_access_key_encrypted) {
      return NextResponse.json({ error: "Enter a Secret Access Key before testing." }, { status: 400 });
    }
    secretAccessKey = decryptSecret(existing.s3_secret_access_key_encrypted);
  }

  const cfg: S3Config = { accessKeyId, secretAccessKey, region, bucketName, endpoint, forcePathStyle };

  try {
    await testS3Connection(cfg);
  } catch (err) {
    console.error("S3 test connection failed", err);
    const message = err instanceof Error ? err.message : "Could not connect to this bucket.";
    return NextResponse.json({ error: `Connection failed: ${message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
