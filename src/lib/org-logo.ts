import { nanoid } from "nanoid";

// Organization Logo (Settings -> Company -> Profile). Reuses the exact same S3
// infrastructure the file-attachments feature uses (src/lib/s3.ts — per-org S3 settings,
// falling back to the app-wide AWS_*/S3_* env vars), but is deliberately its own small
// module rather than an extension of src/lib/attachments.ts: a logo is a single, org-owned
// image, not "N files attached to some other entity row" (see the migration's comment for
// why this isn't just another attachments.entity_type).
//
// Deliberately kept free of any server-only import (pg's queryOne, the AWS SDK via s3.ts) —
// OrgLogoUploader.tsx (a "use client" component) imports the constants below directly, the
// same way AttachmentsField.tsx imports its own equivalents from attachments.ts. The actual
// server-side lookup (getOrgLogoDataUri) lives in s3.ts instead, alongside the other S3
// primitives it depends on (getObjectBytes) — importing it from here would drag pg/aws-sdk
// into the client bundle.

/** Plain image types a logo upload accepts — matches the dashed-box helper text exactly
 * ("jpg, jpeg, png, gif, bmp"). jpg/jpeg share the same MIME type. */
export const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/bmp": "BMP",
};

export const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024; // 1MB, matches the advertised "Max 1MB"

export function buildOrgLogoKey(orgId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140);
  return `orgs/${orgId}/logo/${nanoid(10)}-${safeName}`;
}
