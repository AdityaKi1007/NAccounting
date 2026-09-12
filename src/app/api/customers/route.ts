import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { extractHeaderValues, type CustomerHeaderInput, type ContactPersonInput } from "@/lib/customers";
import { syncOpeningBalanceJournal } from "@/lib/auto-journal";

interface Body {
  header: CustomerHeaderInput;
  contacts: ContactPersonInput[];
}

export async function POST(req: NextRequest) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "customers", "write");
  if (accessError) return accessError;

  const body: Body = await req.json().catch(() => ({ header: {}, contacts: [] }));
  const displayName = (body.header?.display_name ?? "").toString().trim();
  if (!displayName) {
    return NextResponse.json({ error: "Display Name is required" }, { status: 400 });
  }

  const values = extractHeaderValues(body.header);
  values.display_name = displayName;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const columns = ["organization_id", ...Object.keys(values)];
    const params = [ctx.orgId, ...Object.values(values)];
    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
    const result = await client.query(
      `INSERT INTO customers (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      params
    );
    const customerId = result.rows[0].id;

    const contacts = (body.contacts ?? []).filter(
      (c) => c.first_name || c.last_name || c.email || c.work_phone || c.mobile
    );
    for (const c of contacts) {
      await client.query(
        `INSERT INTO customer_contacts (customer_id, salutation, first_name, last_name, email, work_phone, mobile, designation, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [customerId, c.salutation || null, c.first_name || null, c.last_name || null, c.email || null, c.work_phone || null, c.mobile || null, c.designation || null, c.department || null]
      );
    }

    // A newly created customer's opening_balance feeds the consolidated Opening Balances
    // journal's Accounts Receivable line — rebuild it so the GL reflects this customer too.
    await syncOpeningBalanceJournal(client, ctx.orgId);

    await client.query("COMMIT");
    return NextResponse.json({ id: customerId }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not save this customer." }, { status: 500 });
  } finally {
    client.release();
  }
}
