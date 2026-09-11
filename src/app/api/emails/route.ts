import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import {
  EMAIL_ENTITY_TABLES,
  EMAIL_ENTITY_PARTY,
  EMAIL_PARTY_TABLES,
  isEmailEntityType,
  isEmailPartyType,
} from "@/lib/emails";
import { sendEmail, EmailNotConfiguredError } from "@/lib/email";

export interface SentEmailRow {
  id: string;
  entity_type: string;
  entity_id: string;
  party_type: string;
  party_id: string;
  to_email: string;
  cc_email: string | null;
  subject: string;
  body: string;
  attachment_file_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

const SENT_EMAIL_COLUMNS =
  "id, entity_type, entity_id, party_type, party_id, to_email, cc_email, subject, body, attachment_file_name, status, error_message, created_at";

// GET /api/emails?entityType=invoices&entityId=<uuid> — emails sent about one document.
// GET /api/emails?partyType=customer&partyId=<uuid> — emails filed under one customer/vendor
// profile. Exactly one of the two pairs is required. Used by EmailsList in both places it's
// rendered (a document's own detail page, and the customer/vendor profile page).
export async function GET(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const entityType = req.nextUrl.searchParams.get("entityType") ?? "";
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const partyType = req.nextUrl.searchParams.get("partyType") ?? "";
  const partyId = req.nextUrl.searchParams.get("partyId") ?? "";

  if (entityType && entityId) {
    if (!isEmailEntityType(entityType)) {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
    }
    const rows = await query<SentEmailRow>(
      `SELECT ${SENT_EMAIL_COLUMNS} FROM sent_emails
       WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
       ORDER BY created_at DESC`,
      [ctx.orgId, entityType, entityId]
    );
    return NextResponse.json({ emails: rows });
  }

  if (partyType && partyId) {
    if (!isEmailPartyType(partyType)) {
      return NextResponse.json({ error: "Invalid partyType" }, { status: 400 });
    }
    const rows = await query<SentEmailRow>(
      `SELECT ${SENT_EMAIL_COLUMNS} FROM sent_emails
       WHERE organization_id = $1 AND party_type = $2 AND party_id = $3
       ORDER BY created_at DESC`,
      [ctx.orgId, partyType, partyId]
    );
    return NextResponse.json({ emails: rows });
  }

  return NextResponse.json({ error: "Pass either entityType+entityId or partyType+partyId" }, { status: 400 });
}

// POST /api/emails — multipart/form-data with fields "entityType", "entityId", "to", "cc"
// (optional), "subject", "body", and "file" (optional — the PDF the client already generated
// via src/lib/pdf-export.ts, the same way a "Download PDF" click would). The party (customer
// or vendor) this gets filed under is resolved server-side from the document's own row — see
// EMAIL_ENTITY_PARTY in src/lib/emails.ts — never trusted from client input, so an email can
// never be logged under a party other than the one the document actually belongs to.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");
  const to = String(form.get("to") ?? "").trim();
  const cc = String(form.get("cc") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const file = form.get("file");

  if (!isEmailEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
  }
  if (!to) return NextResponse.json({ error: "A recipient email is required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "A subject is required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "A message body is required" }, { status: 400 });
  if (file !== null && !(file instanceof File)) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }

  // The entity has to actually exist and belong to this org — entity_id/entity_type aren't
  // real foreign keys (see the migration), so this ownership check is what stands in for one.
  // Also pulls the party column (customer_id or vendor_id) off the same row, so the party this
  // email gets filed under is always the document's real customer/vendor, not client input.
  const { partyType, partyColumn } = EMAIL_ENTITY_PARTY[entityType];
  const table = EMAIL_ENTITY_TABLES[entityType];
  const entityRow = await queryOne<Record<string, string | null>>(
    `SELECT id, ${partyColumn} FROM ${table} WHERE id = $1 AND organization_id = $2`,
    [entityId, ctx.orgId]
  );
  if (!entityRow) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const partyId = entityRow[partyColumn];
  if (!partyId) {
    return NextResponse.json(
      { error: `This record has no ${partyType} to email — add one first.` },
      { status: 400 }
    );
  }

  const partyTable = EMAIL_PARTY_TABLES[partyType];
  const party = await queryOne<{ id: string }>(`SELECT id FROM ${partyTable} WHERE id = $1 AND organization_id = $2`, [
    partyId,
    ctx.orgId,
  ]);
  if (!party) return NextResponse.json({ error: `${partyType === "customer" ? "Customer" : "Vendor"} not found` }, { status: 404 });

  let attachment: { filename: string; content: Buffer; contentType: string } | null = null;
  if (file instanceof File) {
    attachment = { filename: file.name, content: Buffer.from(await file.arrayBuffer()), contentType: file.type || "application/pdf" };
  }

  try {
    await sendEmail(ctx.orgId, { to, cc: cc || null, subject, text: body, attachment });
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("Email send failed", err);
    // Log the failed attempt too — so it's visible in the document's / party's email history
    // instead of silently vanishing (this is exactly the kind of thing a user needs to notice
    // and retry, e.g. a typo'd address or the mail server rejecting the message).
    const message = err instanceof Error ? err.message : "Could not send this email.";
    await queryOne(
      `INSERT INTO sent_emails (organization_id, entity_type, entity_id, party_type, party_id, to_email, cc_email, subject, body, attachment_file_name, status, error_message, sent_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'failed', $11, $12)`,
      [ctx.orgId, entityType, entityId, partyType, partyId, to, cc || null, subject, body, attachment?.filename ?? null, message, ctx.userId]
    );
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const inserted = await queryOne<SentEmailRow>(
    `INSERT INTO sent_emails (organization_id, entity_type, entity_id, party_type, party_id, to_email, cc_email, subject, body, attachment_file_name, status, sent_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'sent', $11)
     RETURNING ${SENT_EMAIL_COLUMNS}`,
    [ctx.orgId, entityType, entityId, partyType, partyId, to, cc || null, subject, body, attachment?.filename ?? null, ctx.userId]
  );

  return NextResponse.json({ email: inserted }, { status: 201 });
}
