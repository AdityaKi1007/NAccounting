import { NextRequest, NextResponse } from "next/server";
import { pool, query, queryOne } from "@/lib/db";
import { getApiOrgContext, unauthorized } from "@/lib/api-context";
import { moduleAccessErrorResponse } from "@/lib/module-access";
import { extractHeaderValues, type CustomerHeaderInput, type ContactPersonInput } from "@/lib/customers";
import { syncOpeningBalanceJournal } from "@/lib/auto-journal";

interface Body {
  header: CustomerHeaderInput;
  contacts: ContactPersonInput[];
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "customers", "view");
  if (accessError) return accessError;

  const header = await queryOne(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [
    ctx.orgId,
    params.id,
  ]);
  if (!header) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contacts = await query(
    `SELECT * FROM customer_contacts WHERE customer_id = $1 ORDER BY created_at ASC`,
    [params.id]
  );
  return NextResponse.json({ header, contacts });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

    const keys = Object.keys(values);
    const setClauses = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
    const result = await client.query(
      `UPDATE customers SET ${setClauses} WHERE organization_id = $1 AND id = $2 RETURNING id`,
      [ctx.orgId, params.id, ...keys.map((k) => values[k])]
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await client.query(`DELETE FROM customer_contacts WHERE customer_id = $1`, [params.id]);
    const contacts = (body.contacts ?? []).filter(
      (c) => c.first_name || c.last_name || c.email || c.work_phone || c.mobile
    );
    for (const c of contacts) {
      await client.query(
        `INSERT INTO customer_contacts (customer_id, salutation, first_name, last_name, email, work_phone, mobile, designation, department)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [params.id, c.salutation || null, c.first_name || null, c.last_name || null, c.email || null, c.work_phone || null, c.mobile || null, c.designation || null, c.department || null]
      );
    }

    // opening_balance may have changed — rebuild the consolidated Opening Balances journal's
    // Accounts Receivable line so the GL stays in sync with this customer's saved value.
    await syncOpeningBalanceJournal(client, ctx.orgId);

    await client.query("COMMIT");
    return NextResponse.json({ id: params.id });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not update this customer." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getApiOrgContext();
  if (!ctx) return unauthorized();
  const accessError = await moduleAccessErrorResponse(ctx, "customers", "write");
  if (accessError) return accessError;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM customers WHERE organization_id = $1 AND id = $2`, [ctx.orgId, params.id]);
    // Deleting a customer removes its opening_balance from the AR total — rebuild the
    // consolidated Opening Balances journal so it doesn't keep counting the deleted row.
    await syncOpeningBalanceJournal(client, ctx.orgId);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return NextResponse.json({ error: "Could not delete this customer." }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
