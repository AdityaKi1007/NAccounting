import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import {
  ATTACHMENT_ENTITY_TABLES,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_ENTITY,
  ATTACHMENT_QUOTA_BYTES,
  formatBytes,
  isAttachmentEntityType,
} from "@/lib/attachments";
import { buildAttachmentKey, putAttachmentObject, AttachmentsNotConfiguredError } from "@/lib/s3";

export interface AttachmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  content_type: string;
  size_bytes: string; // bigint comes back as a string from pg
  created_at: string;
}

// GET /api/attachments?entityType=sales-orders&entityId=<uuid> — the files already attached
// to one record. Used both by AttachmentsField's "live" mode (an existing entity) and by
// the read-only detail views (Customers/Sales Orders/Payments Received) that show them.
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const entityType = req.nextUrl.searchParams.get("entityType") ?? "";
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  if (!isAttachmentEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const rows = await query<AttachmentRow>(
    `SELECT id, entity_type, entity_id, file_name, content_type, size_bytes, created_at
     FROM attachments WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
     ORDER BY created_at ASC`,
    [ctx.orgId, entityType, entityId]
  );
  return NextResponse.json({ attachments: rows });
}

// POST /api/attachments — multipart/form-data with fields "entityType", "entityId", "file".
// Validates the entity is a real, org-owned record of the right type, checks the file
// itself (type/size), checks this org hasn't hit its 1GB attachment quota, then uploads to
// S3 and records the metadata row — see src/lib/attachments.ts / src/lib/s3.ts.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const file = form.get("file");

  if (!isAttachmentEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!(file.type in ALLOWED_ATTACHMENT_TYPES)) {
    return NextResponse.json(
      { error: `"${file.type || "unknown"}" isn't a supported file type. Allowed: PDF, JPG, PNG, DOCX, XLSX.` },
      { status: 400 }
    );
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return NextResponse.json({ error: `Files must be 10MB or smaller (this file is ${formatBytes(file.size)}).` }, { status: 400 });
  }

  // The entity has to actually exist and belong to this org — entity_id/entity_type aren't
  // real foreign keys (see the migration), so this ownership check is what stands in for one.
  const table = ATTACHMENT_ENTITY_TABLES[entityType];
  const owner = await queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = $1 AND organization_id = $2`, [
    entityId,
    ctx.orgId,
  ]);
  if (!owner) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*) FROM attachments WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId]
  );
  if (Number(count) >= MAX_ATTACHMENTS_PER_ENTITY) {
    return NextResponse.json({ error: `You can upload a maximum of ${MAX_ATTACHMENTS_PER_ENTITY} files per record.` }, { status: 400 });
  }

  const [{ used }] = await query<{ used: string | null }>(
    `SELECT SUM(size_bytes) AS used FROM attachments WHERE organization_id = $1`,
    [ctx.orgId]
  );
  const usedBytes = Number(used ?? 0);
  if (usedBytes + file.size > ATTACHMENT_QUOTA_BYTES) {
    return NextResponse.json(
      {
        error: `Storage limit reached: your organization has used ${formatBytes(usedBytes)} of its ${formatBytes(
          ATTACHMENT_QUOTA_BYTES
        )} attachment storage limit. Delete some files to free up space.`,
      },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildAttachmentKey(ctx.orgId, entityType, entityId, file.name);

  try {
    await putAttachmentObject(ctx.orgId, key, buffer, file.type);
  } catch (err) {
    if (err instanceof AttachmentsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("S3 upload failed", err);
    return NextResponse.json({ error: "Could not upload this file. Please try again." }, { status: 500 });
  }

  const inserted = await queryOne<AttachmentRow>(
    `INSERT INTO attachments (organization_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, entity_type, entity_id, file_name, content_type, size_bytes, created_at`,
    [ctx.orgId, entityType, entityId, file.name, key, file.type, file.size, ctx.userId]
  );

  return NextResponse.json({ attachment: inserted }, { status: 201 });
}
