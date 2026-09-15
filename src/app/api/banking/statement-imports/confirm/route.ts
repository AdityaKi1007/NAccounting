import { NextRequest, NextResponse } from "next/server";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { queryOne } from "@/lib/db";
import { createImportBatch, findDuplicateFlags, type NormalizedTransaction } from "@/lib/bank-statement-imports";
import { parseStatementDate, parseStatementAmount, type DateFormatHint } from "@/lib/statement-values";

interface RawRow {
  date: string;
  description: string;
  reference: string;
  amount: string;
  direction: "in" | "out";
}

// POST /api/banking/statement-imports/confirm — shared by the Preview step's initial render
// (dry_run: true — validates + flags possible duplicates against already-staged transactions
// for this bank account, persists nothing) and its final "Import N Transactions" button
// (dry_run omitted/false — persists exactly the rows the user left checked). Both calls take
// the RAW mapped cell values (not numbers/ISO dates the browser already computed) and
// re-derive date/amount itself with the same parseStatementDate/parseStatementAmount used for
// the preview, so a value that displayed fine in the browser (whatever locale/number
// formatting it renders with) can't drift from what actually gets stored — same "never trust
// client-computed derived values" instinct as everywhere else in this app that recomputes
// totals server-side rather than accepting a client's math.
export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "banking", "write");
  if (accessError) return accessError;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const bankAccountId = String(body.bank_account_id ?? "");
  const fileName = typeof body.file_name === "string" ? body.file_name : null;
  const fileFormat = typeof body.file_format === "string" ? body.file_format : "unknown";
  const dateHint: DateFormatHint = body.date_hint === "MDY" || body.date_hint === "YMD" ? body.date_hint : "DMY";
  const rawRows: RawRow[] = Array.isArray(body.rows) ? body.rows : [];
  const dryRun = body.dry_run === true;

  if (!bankAccountId) return NextResponse.json({ error: "Select a bank account." }, { status: 400 });
  const account = await queryOne<{ id: string }>(
    `SELECT id FROM bank_accounts WHERE id = $1 AND organization_id = $2`,
    [bankAccountId, ctx.orgId]
  );
  if (!account) return NextResponse.json({ error: "That bank account wasn't found." }, { status: 400 });

  if (rawRows.length === 0) return NextResponse.json({ error: "No transactions to import." }, { status: 400 });
  if (rawRows.length > 2000) return NextResponse.json({ error: "Too many rows in one import (max 2000)." }, { status: 400 });

  const transactions: NormalizedTransaction[] = [];
  const skipped: { index: number; reason: string }[] = [];
  const includedIndexes: number[] = [];
  rawRows.forEach((r, i) => {
    const isoDate = parseStatementDate(String(r.date ?? ""), dateHint);
    const amount = parseStatementAmount(String(r.amount ?? ""));
    if (!isoDate) return skipped.push({ index: i, reason: "Unrecognized date" });
    if (amount === null || amount === 0) return skipped.push({ index: i, reason: "Unrecognized or zero amount" });
    const direction = r.direction === "out" ? "out" : "in";
    includedIndexes.push(i);
    transactions.push({
      txnDate: isoDate,
      description: String(r.description ?? "").trim().slice(0, 500) || "Imported transaction",
      reference: String(r.reference ?? "").trim().slice(0, 200) || null,
      amount: Math.round(Math.abs(amount) * 100) / 100,
      direction,
    });
  });

  if (transactions.length === 0) {
    return NextResponse.json({ error: "None of the rows could be parsed into valid transactions.", skipped }, { status: 400 });
  }

  const duplicateFlagsByTxn = await findDuplicateFlags(ctx.orgId, bankAccountId, transactions);
  // Map back onto the original row indexes so the client can badge the right table rows.
  const duplicateIndexes = includedIndexes.filter((_, j) => duplicateFlagsByTxn[j]);

  if (dryRun) {
    return NextResponse.json({
      valid: transactions.length,
      skipped,
      duplicateIndexes,
      parsed: includedIndexes.map((originalIndex, j) => ({
        index: originalIndex,
        txnDate: transactions[j].txnDate,
        amount: transactions[j].amount,
        direction: transactions[j].direction,
      })),
    });
  }

  try {
    const result = await createImportBatch(ctx.orgId, bankAccountId, fileName, fileFormat, transactions, ctx.userId);
    return NextResponse.json({
      importId: result.importId,
      imported: result.count,
      skipped,
      duplicateCount: duplicateIndexes.length,
    });
  } catch (err) {
    console.error("Statement import confirm failed", err);
    return NextResponse.json({ error: "Something went wrong while saving these transactions." }, { status: 500 });
  }
}
