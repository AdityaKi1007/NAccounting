import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
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

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "manual-journals", "view");
  if (accessError) return accessError;

  const header = await queryOne(`SELECT * FROM manual_journals WHERE organization_id = $1 AND id = $2`, [
    ctx.orgId,
    params.id,
  ]);
  if (!header) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines = await query(`SELECT * FROM journal_lines WHERE journal_id = $1 ORDER BY id`, [params.id]);
  return NextResponse.json({ header, lines });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "manual-journals", "write");
  if (accessError) return accessError;

  const body: Body = await req.json().catch(() => ({ header: {}, lines: [] }));
  const lines = (body.lines ?? []).filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
  if (lines.length === 0) {
    return NextResponse.json({ error: "Add at least one journal line." }, { status: 400 });
  }
  // Same reasoning as the POST route above — see validateJournalLineRefs' comment in tenant-guard.ts.
  const refError = await validateJournalLineRefs(lines, ctx.orgId);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const journalDate = body.header?.journal_date || null;
  const reverseDate = body.header?.reverse_journal_date || null;
  if (reverseDate && journalDate && reverseDate < journalDate) {
    return NextResponse.json({ error: "Reverse Journal Date must be on or after the Journal Date." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE manual_journals
       SET journal_number = $3, journal_date = $4, reference_number = $5, status = $6, notes = $7,
           reverse_journal_date = $8, reverse_only_on_date = $9, reporting_method = $10, currency_code = $11
       WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [
        ctx.orgId,
        params.id,
        body.header?.journal_number,
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
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await client.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [params.id]);
    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, contact_type, contact_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          params.id,
          line.account_id,
          line.description || null,
          line.debit || 0,
          line.credit || 0,
          line.contact_type || null,
          line.contact_id || null,
        ]
      );
    }

    await syncJournalReversal(client, ctx.orgId, params.id);

    await client.query("COMMIT");
    return NextResponse.json({ id: params.id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not update journal." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "manual-journals", "delete");
  if (accessError) return accessError;
  await pool.query(`DELETE FROM manual_journals WHERE organization_id = $1 AND id = $2`, [ctx.orgId, params.id]);
  return NextResponse.json({ ok: true });
}
