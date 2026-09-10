import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

// Thin wrapper around the AWS S3 SDK for the attachments feature (see
// src/lib/attachments.ts). Storage is organization-wise: every object key is namespaced
// under "orgs/{organizationId}/...", which is what makes the per-org quota check in
// route.ts a simple SUM(size_bytes) WHERE organization_id = $1 rather than needing S3 itself
// to know about organizations.
//
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_BUCKET_NAME come from the
// real AWS account this app's attachments should be stored in — see .env.example. Two more
// are optional and exist for S3-compatible endpoints (MinIO, Cloudflare R2, or this
// project's own local sandbox testing via s3rver — see the test scripts) rather than real
// AWS: S3_ENDPOINT (a custom endpoint URL) and S3_FORCE_PATH_STYLE ("true" to address the
// bucket as part of the URL path instead of a subdomain, which real AWS S3 doesn't need but
// most S3-compatible servers require).

let client: S3Client | null = null;

function getBucket(): string {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) throw new AttachmentsNotConfiguredError();
  return bucket;
}

function getClient(): S3Client {
  if (client) return client;
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_ENDPOINT, S3_FORCE_PATH_STYLE } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !process.env.S3_BUCKET_NAME) {
    throw new AttachmentsNotConfiguredError();
  }
  client = new S3Client({
    region: AWS_REGION,
    credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: S3_FORCE_PATH_STYLE === "true" } : {}),
  });
  return client;
}

/** Thrown (and caught by the API routes) when AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/
 * AWS_REGION/S3_BUCKET_NAME haven't been set yet — e.g. a fresh install before the org's
 * real AWS credentials have been added. Every other feature in the app keeps working; only
 * attachment uploads/downloads fail, with this message instead of a raw AWS SDK error. */
export class AttachmentsNotConfiguredError extends Error {
  constructor() {
    super(
      "File attachments aren't configured yet — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION and " +
        "S3_BUCKET_NAME (see .env.example) to enable uploads."
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

export async function putAttachmentObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteAttachmentObject(key: string): Promise<void> {
  const s3 = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/** A short-lived (5 minute) signed URL for downloading one attachment — the bucket itself
 * is assumed private, so this is the only way a browser ever reads an object back out. */
export async function getAttachmentDownloadUrl(key: string, fileName: string): Promise<string> {
  const s3 = getClient();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}
