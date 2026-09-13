import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { getImportConfig } from "@/lib/import/import-catalog";
import { runImport } from "@/lib/import/importer";

const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — generous for a spreadsheet, keeps a
// mistaken huge upload from tying up a request for minutes.

// POST /api/import/[entity] — multipart/form-data with a single "file" field: the uploaded
// workbook to import as Invoices/Sales Orders/Receipts/Customers/Vendors. Every row is
// processed and recorded (success or failure) in the new import_logs/import_log_rows tables
// — see runImport in src/lib/import/importer.ts — so this always returns 200 with a summary
// (never a single all-or-nothing failure) unless the request itself is malformed or the file
// can't be read at all.
export async function POST(req: NextRequest, { params }: { params: { entity: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const cfg = getImportConfig(params.entity);
  if (!cfg) return NextResponse.json({ error: "Unknown import object type." }, { status: 404 });

  const accessError = await moduleAccessErrorResponse(ctx, "import", "write");
  if (accessError) return accessError;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 10MB)." }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  try {
    const summary = await runImport(ctx.orgId, ctx.userId, params.entity, file.name, buffer);
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error("Import failed", params.entity, err);
    const message =
      err instanceof Error && /invalid|zip|central directory/i.test(err.message)
        ? "This doesn't look like a valid Excel (.xlsx) file."
        : "Something went wrong while importing this file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
