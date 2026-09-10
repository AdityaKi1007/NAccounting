import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { getAttachmentDownloadUrl, AttachmentsNotConfiguredError } from "@/lib/s3";

// GET /api/attachments/[id]/download — redirects to a short-lived presigned S3 URL. The
// bucket is private, so this indirection (rather than linking straight to S3) is what lets
// us check the attachment belongs to the caller's organization before handing out a URL.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const attachment = await queryOne<{ file_key: string; file_name: string }>(
    `SELECT file_key, file_name FROM attachments WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const url = await getAttachmentDownloadUrl(attachment.file_key, attachment.file_name);
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof AttachmentsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("S3 presign failed", err);
    return NextResponse.json({ error: "Could not download this file." }, { status: 500 });
  }
}
