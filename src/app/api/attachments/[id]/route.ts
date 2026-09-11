import { NextRequest, NextResponse } from "next/server";
import { pool, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { deleteAttachmentObject, AttachmentsNotConfiguredError } from "@/lib/s3";

// DELETE /api/attachments/[id] — removes both the S3 object and the metadata row. The S3
// delete happens first: if it fails, the DB row (and therefore the quota accounting) stays
// consistent with what's actually still in the bucket rather than freeing quota for a file
// that's still sitting there.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const attachment = await queryOne<{ id: string; file_key: string }>(
    `SELECT id, file_key FROM attachments WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await deleteAttachmentObject(ctx.orgId, attachment.file_key);
  } catch (err) {
    if (err instanceof AttachmentsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("S3 delete failed", err);
    return NextResponse.json({ error: "Could not delete this file. Please try again." }, { status: 500 });
  }

  await pool.query(`DELETE FROM attachments WHERE id = $1`, [attachment.id]);
  return NextResponse.json({ ok: true });
}
