import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { queryOne } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets-crypto";

// Thin wrapper around the AWS S3 SDK for the attachments feature (see
// src/lib/attachments.ts). Storage is organization-wise: every object key is namespaced
// under "orgs/{organizationId}/...", which is what makes the per-org quota check in
// route.ts a simple SUM(size_bytes) WHERE organization_id = $1 rather than needing S3 itself
// to know about organizations.
//
// Two ways to configure it, checked in this order:
//  1. Per-organization settings entered on Settings -> Integrations -> File Storage (S3) —
//     see S3StorageSettingsForm.tsx and /api/settings/file-storage — stored on the
//     organizations row, the secret key encrypted (see secrets-crypto.ts). This is the
//     primary path for a real multi-tenant deployment: each organization's files live in its
//     own bucket/account.
//  2. The app-wide AWS_*/S3_* env vars (see .env.example) — kept as a fallback so a
//     single-organization/self-hosted install can keep working via .env alone, exactly as
//     before this settings page existed.

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
}

function buildS3Client(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    ...(cfg.endpoint ? { endpoint: cfg.endpoint, forcePathStyle: Boolean(cfg.forcePathStyle) } : {}),
  });
}

interface OrgS3Row {
  s3_access_key_id: string | null;
  s3_secret_access_key_encrypted: string | null;
  s3_region: string | null;
  s3_bucket_name: string | null;
  s3_endpoint: string | null;
  s3_force_path_style: boolean;
}

async function getOrgS3Config(orgId: string): Promise<S3Config | null> {
  const row = await queryOne<OrgS3Row>(
    `SELECT s3_access_key_id, s3_secret_access_key_encrypted, s3_region, s3_bucket_name, s3_endpoint, s3_force_path_style
     FROM organizations WHERE id = $1`,
    [orgId]
  );
  if (!row?.s3_access_key_id || !row.s3_secret_access_key_encrypted || !row.s3_region || !row.s3_bucket_name) {
    return null;
  }
  return {
    accessKeyId: row.s3_access_key_id,
    secretAccessKey: decryptSecret(row.s3_secret_access_key_encrypted),
    region: row.s3_region,
    bucketName: row.s3_bucket_name,
    endpoint: row.s3_endpoint,
    forcePathStyle: row.s3_force_path_style,
  };
}

function getEnvS3Config(): S3Config | null {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !S3_BUCKET_NAME) return null;
  return {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION,
    bucketName: S3_BUCKET_NAME,
    endpoint: process.env.S3_ENDPOINT || null,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}

// One cached {client, bucket} per organization. invalidateOrgS3Config() must be called any
// time an org's settings are saved/cleared, so the next upload/download rebuilds the client
// from the new credentials instead of reusing stale ones.
const clientCache = new Map<string, { client: S3Client; bucket: string }>();

async function getClientForOrg(orgId: string): Promise<{ client: S3Client; bucket: string }> {
  const cached = clientCache.get(orgId);
  if (cached) return cached;

  const cfg = (await getOrgS3Config(orgId)) ?? getEnvS3Config();
  if (!cfg) throw new AttachmentsNotConfiguredError();
  const entry = { client: buildS3Client(cfg), bucket: cfg.bucketName };
  clientCache.set(orgId, entry);
  return entry;
}

/** Call after an org's S3 settings are saved or cleared, so the next attachment
 * upload/download/delete rebuilds its client from the new credentials instead of an old
 * cached one. */
export function invalidateOrgS3Config(orgId: string): void {
  clientCache.delete(orgId);
}

/** Thrown (and caught by the API routes) when neither this organization's own S3 settings
 * nor the app-wide AWS_ / S3_ env vars are configured yet. Every other feature in the app
 * keeps working; only attachment uploads/downloads fail, with this message instead of a raw
 * AWS SDK error. */
export class AttachmentsNotConfiguredError extends Error {
  constructor() {
    super(
      "File attachments aren't configured yet — add your S3 bucket details under Settings -> " +
        "Integrations -> File Storage (S3) to enable uploads."
    );
    this.name = "AttachmentsNotConfiguredError";
  }
}

/** Builds this attachment's S3 key. Kept deterministic-but-unique (a nanoid, not the
 * original filename alone) so two uploads of "invoice.pdf" to the same entity never
 * collide, while still sorting/globbing cleanly by org → entity type → entity. */
export function buildAttachmentKey(orgId: string, entityType: string, entityId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
  return `orgs/${orgId}/${entityType}/${entityId}/${nanoid(10)}-${safeName}`;
}

export async function putAttachmentObject(orgId: string, key: string, body: Buffer, contentType: string): Promise<void> {
  const { client, bucket } = await getClientForOrg(orgId);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteAttachmentObject(orgId: string, key: string): Promise<void> {
  const { client, bucket } = await getClientForOrg(orgId);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Fetches an object's raw bytes directly (as opposed to a presigned URL the *browser* uses
 * to fetch it itself). Used by the Organization Logo feature (src/lib/org-logo.ts): a logo
 * needs to be embedded as a `data:` URI in server-rendered pages (Settings preview, every
 * PDF-header component) rather than linked to as a presigned URL, since a 5-minute presign
 * (see getAttachmentDownloadUrl below) isn't workable for something rendered into an
 * html2canvas-captured PDF or cached by a browser/email client well past that window — see
 * the comment on getOrgLogoDataUri for the full reasoning. */
export async function getObjectBytes(orgId: string, key: string): Promise<Buffer> {
  const { client, bucket } = await getClientForOrg(orgId);
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty object body");
  return Buffer.from(bytes);
}

/** Resolves an org's logo (see src/lib/org-logo.ts) as an inline `data:` URI, or null if it
 * has none — or if the object can't be fetched, e.g. a since-changed/broken S3 config;
 * a broken logo should never 500 a page that merely wants to show one, same "degrade
 * quietly" philosophy this app already uses elsewhere (findAccountId returning null instead
 * of throwing).
 *
 * Deliberately a `data:` URI, not a presigned URL like getAttachmentDownloadUrl above:
 * every use of this (the Company Profile settings preview, and every invoice/sales-order/
 * purchase-order/payment/statement PDF header) needs the image to still be loadable
 * whenever a "Download PDF"/"Send Email" click fires — possibly well after the page first
 * rendered — and getAttachmentDownloadUrl's 5-minute presign doesn't survive that. A
 * `data:` URI has no expiry and, being same-origin as far as the DOM/canvas is concerned,
 * also sidesteps html2canvas's CORS/tainted-canvas restrictions on cross-origin images — no
 * S3 bucket CORS configuration is required for the logo to actually render inside a
 * generated PDF. The tradeoff (a few KB of base64 inlined into every server-rendered page
 * that shows a logo) is a good one at the 1MB cap this feature enforces on upload. */
export async function getOrgLogoDataUri(orgId: string): Promise<string | null> {
  const row = await queryOne<{ logo_key: string | null; logo_content_type: string | null }>(
    `SELECT logo_key, logo_content_type FROM organizations WHERE id = $1`,
    [orgId]
  );
  if (!row?.logo_key || !row.logo_content_type) return null;
  try {
    const bytes = await getObjectBytes(orgId, row.logo_key);
    return `data:${row.logo_content_type};base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.error("Could not fetch organization logo from S3", err);
    return null;
  }
}

/** A short-lived (5 minute) signed URL for downloading one attachment — the bucket itself
 * is assumed private, so this is the only way a browser ever reads an object back out. */
export async function getAttachmentDownloadUrl(orgId: string, key: string, fileName: string): Promise<string> {
  const { client, bucket } = await getClientForOrg(orgId);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
  });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

/** Confirms the given (not-yet-necessarily-saved) S3 settings can actually reach the bucket
 * — backs the "Test Connection" button on the settings page. HeadBucket only needs
 * s3:ListBucket/HeadBucket permission, not write access, so this is a safe, side-effect-free
 * check; it still fails clearly on bad credentials, wrong region, or a bucket that doesn't
 * exist, which is exactly what a user needs to know before saving. */
export async function testS3Connection(cfg: S3Config): Promise<void> {
  const client = buildS3Client(cfg);
  await client.send(new HeadBucketCommand({ Bucket: cfg.bucketName }));
}
