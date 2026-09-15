// One-off maintenance script: fixes the real data gap behind the grouped "Deposit To" / "Paid
// Through" picker (see src/components/ui/GroupedCombobox.tsx and the 2026-09-15
// grouped-deposit-to-picker addendum) not showing a "Bank" group or a "Petty Cash" account for
// NeoProp Technologies, even though the picker code itself is correct.
//
// Two separate real-data problems, found while investigating the user's report that the Cash
// payment mode picker doesn't look like the reference screenshot:
//
//   1. This org's only 2 Banking-module accounts ("Emirates NBD - Current", "Business Credit
//      Card") are each linked to a Chart of Accounts entry, but BOTH of those linked GL accounts
//      are mistyped as `type = 'cash'` — should be `'bank'` and `'credit_card'` respectively.
//      (The Banking module's own `bank_accounts.account_type` column is already correct for
//      both — this bug is only in the *linked GL account's* type, which is what the picker
//      actually groups by.) Checked auto-journal.ts: neither account is looked up by type
//      anywhere (bank/cash journal postings always go through `getOrCreateBankGLAccount`, keyed
//      off `bank_account_id`, never a type-based `findAccountId` search), and only 2 and 0
//      journal_lines respectively reference them — safe to retype.
//   2. There is no "Petty Cash" account at all in this org's Chart of Accounts. The standard GL
//      list added earlier today (see the coa-gl-codes-seed addendum) wanted it at code 1010, but
//      1010 was already taken by this org's real Accounts Receivable account and was
//      intentionally skipped rather than overwritten. This script creates "Petty Cash" fresh —
//      same type (`cash`) and same intended parent (the existing code-1000 "Cash" account) as
//      the original list wanted — at the next free code from 1011 upward, and also adds a
//      matching Banking-module (bank_accounts) row so it's selectable, the same way "Emirates
//      NBD - Current" and "Business Credit Card" are.
//
// Idempotent / safe to re-run: each step checks current state first and only acts if it's not
// already fixed, so a second run reports everything as SKIP and changes nothing.
//
// Usage:  npm run fix:cash-mode-accounts          (targets NeoProp Technologies by default)
//         npm run fix:cash-mode-accounts -- some-other-org-slug

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/neoaccountingz",
});

const ORG_SLUG = process.argv[2] || "neoprop-technologies";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const org = await client.query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1`, [ORG_SLUG]);
    if (org.rowCount === 0) {
      throw new Error(`No organization found with slug "${ORG_SLUG}"`);
    }
    const orgId = org.rows[0].id;

    // --- Step 1: retype "Emirates NBD - Current"'s linked GL account cash -> bank ---
    const nbd = await client.query<{ id: string; type: string }>(
      `SELECT id, type FROM accounts WHERE organization_id = $1 AND name = 'Emirates NBD - Current'`,
      [orgId]
    );
    if (nbd.rowCount === 0) {
      console.log('SKIP: no Chart of Accounts entry named "Emirates NBD - Current" found.');
    } else if (nbd.rows[0].type === "bank") {
      console.log('SKIP: "Emirates NBD - Current" is already type "bank".');
    } else {
      await client.query(`UPDATE accounts SET type = 'bank' WHERE id = $1`, [nbd.rows[0].id]);
      console.log(`FIXED: "Emirates NBD - Current" retyped ${nbd.rows[0].type} -> bank.`);
    }

    // --- Step 2: retype "Business Credit Card"'s linked GL account cash -> credit_card ---
    const card = await client.query<{ id: string; type: string }>(
      `SELECT id, type FROM accounts WHERE organization_id = $1 AND name = 'Business Credit Card'`,
      [orgId]
    );
    if (card.rowCount === 0) {
      console.log('SKIP: no Chart of Accounts entry named "Business Credit Card" found.');
    } else if (card.rows[0].type === "credit_card") {
      console.log('SKIP: "Business Credit Card" is already type "credit_card".');
    } else {
      await client.query(`UPDATE accounts SET type = 'credit_card' WHERE id = $1`, [card.rows[0].id]);
      console.log(`FIXED: "Business Credit Card" retyped ${card.rows[0].type} -> credit_card.`);
    }

    // --- Step 3: create "Petty Cash" in the Chart of Accounts if it doesn't exist yet ---
    let pettyCashAccountId: string;
    const existingPetty = await client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE organization_id = $1 AND name = 'Petty Cash'`,
      [orgId]
    );
    if (existingPetty.rowCount && existingPetty.rowCount > 0) {
      pettyCashAccountId = existingPetty.rows[0].id;
      console.log('SKIP: "Petty Cash" Chart of Accounts entry already exists — reusing it.');
    } else {
      const parent = await client.query<{ id: string }>(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [orgId]);
      const parentId: string | null = parent.rows[0]?.id ?? null;

      // 1010 was the original list's intended code but collided with this org's real Accounts
      // Receivable (see the coa-gl-codes-seed addendum) — walk up from 1011 for the next free one.
      let code: string | null = null;
      for (let n = 1011; n <= 1099; n++) {
        const candidate = String(n);
        const taken = await client.query(`SELECT 1 FROM accounts WHERE organization_id = $1 AND code = $2`, [orgId, candidate]);
        if (taken.rowCount === 0) {
          code = candidate;
          break;
        }
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO accounts (organization_id, name, code, type, parent_account_id) VALUES ($1, 'Petty Cash', $2, 'cash', $3) RETURNING id`,
        [orgId, code, parentId]
      );
      pettyCashAccountId = inserted.rows[0].id;
      console.log(`CREATED: "Petty Cash" Chart of Accounts entry (code ${code ?? "none available — left blank"}${parentId ? ", parented under code 1000" : ""}).`);
    }

    // --- Step 4: create a matching Banking-module account so Petty Cash is selectable ---
    const existingBankRow = await client.query(
      `SELECT id FROM bank_accounts WHERE organization_id = $1 AND (gl_account_id = $2 OR account_name = 'Petty Cash')`,
      [orgId, pettyCashAccountId]
    );
    if (existingBankRow.rowCount && existingBankRow.rowCount > 0) {
      console.log('SKIP: a Banking-module account for "Petty Cash" already exists.');
    } else {
      await client.query(
        `INSERT INTO bank_accounts (organization_id, account_type, account_name, currency, is_primary, opening_balance, gl_account_id)
         VALUES ($1, 'bank', 'Petty Cash', 'AED', false, 0, $2)`,
        [orgId, pettyCashAccountId]
      );
      console.log('CREATED: "Petty Cash" Banking-module account, linked to the Chart of Accounts entry above.');
    }

    await client.query("COMMIT");
    console.log('\nDone. Reload /payments-received/new or /payments-made/new, select Cash payment mode, and open "Deposit To" / "Paid Through" — you should now see a "Bank" group (Emirates NBD - Current) and a "Cash" group (Petty Cash, Business Credit Card moves to its own "Credit Card" group).');
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
