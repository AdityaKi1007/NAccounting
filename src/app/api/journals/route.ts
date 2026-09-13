import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { claimNextNumber } from "@/lib/number-series";
import { syncJournalReversal } from "@/lib/journal-reversals";
import { validateJournalLineRefs } from "@/lib/tenant-guard";

interface Body {
  header: {
    journal_number?: string;
    journal_date?: string;
    reference_number?: string;
    status?: string;
    notes?: string;
    reverse_journal_date?: string | null;
    reverse_only_on_date?: boolean;
    reporting_method?: string;
    currency_code?: string | null;
  };
  lines: {
    account_id?: string;
    description?: string;
    debit?: number;
    credit?: number;
    contact_type?: string | null;
    contact_id?: string | null;
  }[];
}

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "manual-journals", "write");
  if (accessError) return accessError;

  const body: Body = await req.json().catch(() => ({ header: {}, lines: [] }));
  const lines = (body.lines ?? []).filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (lines.length === 0) {
    return NextResponse.json({ error: "Add at least one journal line." }, { status: 400 });
  }
  // Manual journal entry is the one place in the app where a user types in a raw account_id
  // (and, for a contact-tagged line, a customer/vendor contact_id) directly — every account
  // referenced here must actually belong to this org, or a member of more than one
  // organization (or a raw API call) could post into another organization's chart of
  // accounts. See validateJournalLineRefs' own comment in tenant-guard.ts.
  const refError = await validateJournalLineRefs(lines, ctx.orgId);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const journalDate = body.header?.journal_date || new Date().toISOString().slice(0, 10);
  const reverseDate = body.header?.reverse_journal_date || null;
  if (reverseDate && reverseDate < journalDate) {
    return NextResponse.json({ error: "Reverse Journal Date must be on or after the Journal Date." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const number = body.header?.journal_number || (await claimNextNumber(client, ctx.orgId, "manual-journals"));
    const headerResult = await client.query(
      `INSERT INTO manual_journals
         (organization_id, journal_number, journal_date, reference_number, status, notes,
          reverse_journal_date, reverse_only_on_date, reporting_method, currency_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        ctx.orgId,
        number,
        journalDate,
        body.header?.reference_number || null,
        body.header?.status || "draft",
        body.header?.notes || null,
        reverseDate,
        Boolean(body.header?.reverse_only_on_date),
        body.header?.reporting_method || "accrual_and_cash",
        body.header?.currency_code || null,
      ]
    );
    const journalId = headerResult.rows[0].id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, contact_type, contact_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          journalId,
          line.account_id,
          line.description || null,
          line.debit || 0,
          line.credit || 0,
          line.contact_type || null,
          line.contact_id || null,
        ]
      );
    }

    await syncJournalReversal(client, ctx.orgId, journalId);

    await client.query("COMMIT");
    return NextResponse.json({ id: journalId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not save journal." }, { status: 500 });
  } finally {
    client.release();
  }
}
