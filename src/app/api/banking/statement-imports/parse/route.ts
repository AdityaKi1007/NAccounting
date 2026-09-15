import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { parseStatementFile, SUPPORTED_FORMATS, UNSUPPORTED_FORMATS, type StatementFormat } from "@/lib/statement-import";

// POST /api/banking/statement-imports/parse — multipart/form-data: "file", "format"
// ("csv"|"tsv"|"xls"|"pdf"), optional "encoding" ("utf-8"|"latin1"). Pure parse — nothing is
// persisted here; the Preview step's "Import N Transactions" confirm button is what calls
// /confirm to actually stage rows. Kept as a separate stateless step so the Map Fields step
// can re-render instantly as the user changes column mappings without re-uploading.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "banking", "write");
  if (accessError) return accessError;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });

  const format = String(form.get("format") ?? "");
  const encoding = form.get("encoding") === "latin1" ? "latin1" : "utf-8";
  const unsupported = UNSUPPORTED_FORMATS.find((f) => f.value === format);
  if (unsupported) {
    return NextResponse.json(
      {
        error: `${unsupported.label} isn't supported yet — this build can import CSV, TSV, XLS/XLSX and PDF statements. Export your statement in one of those formats and try again.`,
      },
      { status: 400 }
    );
  }
  if (!SUPPORTED_FORMATS.some((f) => f.value === format)) {
    return NextResponse.json({ error: "Unknown or missing file format." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }

  try {
    const parsed = await parseStatementFile(buffer, format as StatementFormat, encoding);
    // Cap what's returned to the browser — a huge statement shouldn't blow up the Map
    // Fields/Preview UI; 2000 transaction lines is already a very large single statement.
    const capped = parsed.rows.length > 2000;
    const rows = capped ? parsed.rows.slice(0, 2000) : parsed.rows;
    const warnings = capped
      ? [...parsed.warnings, `Only the first 2000 of ${parsed.rows.length} rows are shown — split large statements into smaller date ranges.`]
      : parsed.warnings;
    return NextResponse.json({ ...parsed, rows, warnings, fileName: file.name });
  } catch (err) {
    console.error("Statement parse failed", format, err);
    return NextResponse.json({ error: "Something went wrong while reading this file." }, { status: 500 });
  }
}
