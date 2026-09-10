import "dotenv/config";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/neoaccountingz",
});

const DEFAULT_ACCOUNTS: { code: string; name: string; type: string }[] = [
  { code: "1000", name: "Cash", type: "asset" },
  { code: "1010", name: "Accounts Receivable", type: "asset" },
  { code: "1020", name: "Inventory Asset", type: "asset" },
  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "2010", name: "VAT Payable", type: "liability" },
  { code: "3000", name: "Owner's Equity", type: "equity" },
  { code: "3010", name: "Retained Earnings", type: "equity" },
  { code: "4000", name: "Sales Income", type: "income" },
  { code: "4010", name: "Other Income", type: "income" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense" },
  { code: "5010", name: "Rent Expense", type: "expense" },
  { code: "5020", name: "Salaries Expense", type: "expense" },
  { code: "5030", name: "Office Supplies", type: "expense" },
  { code: "5040", name: "Utilities Expense", type: "expense" },
  { code: "5050", name: "General Expense", type: "expense" },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const email = "aditya.kishor@gmail.com";
    const password = "Password123!";
    const passwordHash = await bcrypt.hash(password, 10);

    let userId: string;
    const existingUser = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existingUser.rowCount && existingUser.rowCount > 0) {
      userId = existingUser.rows[0].id;
      console.log("User already exists, reusing:", email);
    } else {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id`,
        [email, passwordHash, "Aditya Kishor"]
      );
      userId = userResult.rows[0].id;
    }

    let orgId: string;
    const existingOrg = await client.query(`SELECT id FROM organizations WHERE slug = $1`, ["neoprop-technologies"]);
    if (existingOrg.rowCount && existingOrg.rowCount > 0) {
      orgId = existingOrg.rows[0].id;
      console.log("Organization already exists, reusing: NeoProp Technologies");
    } else {
      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, currency) VALUES ($1, $2, $3) RETURNING id`,
        ["NeoProp Technologies", "neoprop-technologies", "AED"]
      );
      orgId = orgResult.rows[0].id;

      await client.query(
        `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')`,
        [userId, orgId]
      );

      const accountIds: Record<string, string> = {};
      for (const acc of DEFAULT_ACCOUNTS) {
        const r = await client.query(
          `INSERT INTO accounts (organization_id, code, name, type) VALUES ($1, $2, $3, $4) RETURNING id`,
          [orgId, acc.code, acc.name, acc.type]
        );
        accountIds[acc.name] = r.rows[0].id;
      }

      const bank1 = await client.query(
        `INSERT INTO bank_accounts (organization_id, account_type, account_name, currency, bank_name, account_number, is_primary, opening_balance)
         VALUES ($1, 'bank', 'Emirates NBD - Current', 'AED', 'Emirates NBD', '1013456789012', true, 45000) RETURNING id`,
        [orgId]
      );
      await client.query(
        `INSERT INTO bank_accounts (organization_id, account_type, account_name, currency, bank_name, account_number, is_primary, opening_balance)
         VALUES ($1, 'credit_card', 'Business Credit Card', 'AED', 'ADCB', '4455', false, 0)`,
        [orgId]
      );
      const bankId = bank1.rows[0].id;

      const items: { name: string; sku: string; type: string; unit: string; sales: number; cost: number }[] = [
        { name: "Website Design Package", sku: "WEB-001", type: "service", unit: "project", sales: 8500, cost: 3000 },
        { name: "Monthly Hosting Plan", sku: "HOST-01", type: "service", unit: "month", sales: 250, cost: 90 },
        { name: "Office Chair - Ergonomic", sku: "FUR-102", type: "goods", unit: "pcs", sales: 650, cost: 400 },
        { name: "Consulting - Hourly", sku: "CON-001", type: "service", unit: "hr", sales: 350, cost: 0 },
        { name: "Laptop Stand", sku: "ACC-010", type: "goods", unit: "pcs", sales: 120, cost: 65 },
      ];
      const itemIds: string[] = [];
      for (const it of items) {
        const r = await client.query(
          `INSERT INTO items (organization_id, name, sku, type, unit, sales_price, purchase_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [orgId, it.name, it.sku, it.type, it.unit, it.sales, it.cost]
        );
        itemIds.push(r.rows[0].id);
      }

      const customers: { name: string; company: string; email: string; phone: string }[] = [
        { name: "Fatima Al Mansoori", company: "Al Mansoori Retail LLC", email: "fatima@almansoori.ae", phone: "+971 50 111 2233" },
        { name: "James Carter", company: "Carter & Co Trading", email: "james@cartertrading.com", phone: "+971 55 222 3344" },
        { name: "Sara Al Suwaidi", company: "Suwaidi Holdings", email: "sara@suwaidiholdings.ae", phone: "+971 56 333 4455" },
      ];
      const customerIds: string[] = [];
      for (const c of customers) {
        const r = await client.query(
          `INSERT INTO customers (organization_id, display_name, company_name, email, phone, currency)
           VALUES ($1, $2, $3, $4, $5, 'AED') RETURNING id`,
          [orgId, c.name, c.company, c.email, c.phone]
        );
        customerIds.push(r.rows[0].id);
      }

      const vendors: { name: string; company: string; email: string; phone: string }[] = [
        { name: "Gulf Office Supplies", company: "Gulf Office Supplies LLC", email: "sales@gulfoffice.ae", phone: "+971 4 555 1122" },
        { name: "Etisalat Business", company: "Etisalat", email: "business@etisalat.ae", phone: "+971 4 444 5566" },
      ];
      const vendorIds: string[] = [];
      for (const v of vendors) {
        const r = await client.query(
          `INSERT INTO vendors (organization_id, display_name, company_name, email, phone, currency)
           VALUES ($1, $2, $3, $4, $5, 'AED') RETURNING id`,
          [orgId, v.name, v.company, v.email, v.phone]
        );
        vendorIds.push(r.rows[0].id);
      }

      // Invoice 1 - paid
      const inv1 = await client.query(
        `INSERT INTO invoices (organization_id, invoice_number, customer_id, invoice_date, due_date, status, subtotal, tax_total, total, balance_due)
         VALUES ($1, 'INV-000101', $2, current_date - interval '20 days', current_date - interval '5 days', 'paid', 8500, 425, 8925, 0) RETURNING id`,
        [orgId, customerIds[0]]
      );
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_id, description, quantity, rate, amount) VALUES ($1, $2, $3, 1, 8500, 8500)`,
        [inv1.rows[0].id, itemIds[0], "Website Design Package"]
      );

      // Invoice 2 - overdue
      const inv2 = await client.query(
        `INSERT INTO invoices (organization_id, invoice_number, customer_id, invoice_date, due_date, status, subtotal, tax_total, total, balance_due)
         VALUES ($1, 'INV-000102', $2, current_date - interval '35 days', current_date - interval '5 days', 'overdue', 750, 37.5, 787.5, 787.5) RETURNING id`,
        [orgId, customerIds[1]]
      );
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_id, description, quantity, rate, amount) VALUES ($1, $2, $3, 3, 250, 750)`,
        [inv2.rows[0].id, itemIds[1], "Monthly Hosting Plan"]
      );

      // Invoice 3 - draft
      const inv3 = await client.query(
        `INSERT INTO invoices (organization_id, invoice_number, customer_id, invoice_date, due_date, status, subtotal, tax_total, total, balance_due)
         VALUES ($1, 'INV-000103', $2, current_date, current_date + interval '15 days', 'draft', 1300, 65, 1365, 1365) RETURNING id`,
        [orgId, customerIds[2]]
      );
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_id, description, quantity, rate, amount) VALUES ($1, $2, $3, 2, 650, 1300)`,
        [inv3.rows[0].id, itemIds[2], "Office Chair - Ergonomic"]
      );

      await client.query(
        `INSERT INTO payments_received (organization_id, payment_number, customer_id, invoice_id, payment_date, amount, payment_mode, bank_account_id, reference_number)
         VALUES ($1, 'PMT-000101', $2, $3, current_date - interval '5 days', 8925, 'bank_transfer', $4, 'TRX-88213')`,
        [orgId, customerIds[0], inv1.rows[0].id, bankId]
      );

      // Bill
      const bill1 = await client.query(
        `INSERT INTO bills (organization_id, bill_number, vendor_id, bill_date, due_date, status, subtotal, tax_total, total, balance_due)
         VALUES ($1, 'BILL-000101', $2, current_date - interval '10 days', current_date + interval '20 days', 'open', 1200, 60, 1260, 1260) RETURNING id`,
        [orgId, vendorIds[0]]
      );
      await client.query(
        `INSERT INTO bill_items (bill_id, item_id, description, quantity, rate, amount) VALUES ($1, $2, $3, 10, 120, 1200)`,
        [bill1.rows[0].id, itemIds[4], "Laptop Stand"]
      );

      await client.query(
        `INSERT INTO expenses (organization_id, expense_date, vendor_id, account_id, paid_through_account_id, amount, tax_amount, reference_number, notes)
         VALUES ($1, current_date - interval '3 days', $2, $3, $4, 899, 44.95, 'EXP-4471', 'Monthly business line rental')`,
        [orgId, vendorIds[1], accountIds["Utilities Expense"], bankId]
      );

      const journal = await client.query(
        `INSERT INTO manual_journals (organization_id, journal_number, journal_date, reference_number, status, notes)
         VALUES ($1, 'JNL-000101', current_date - interval '2 days', 'Opening Balance', 'published', 'Opening balances for owner equity') RETURNING id`,
        [orgId]
      );
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, $4, 0)`,
        [journal.rows[0].id, accountIds["Cash"], "Opening cash balance", 45000]
      );
      await client.query(
        `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit) VALUES ($1, $2, $3, 0, $4)`,
        [journal.rows[0].id, accountIds["Owner's Equity"], "Opening owner's equity", 45000]
      );

      await client.query(
        `INSERT INTO budgets (organization_id, name, fiscal_year, account_id, period, amount)
         VALUES ($1, 'FY2026 Marketing Budget', '2026', $2, 'yearly', 60000)`,
        [orgId, accountIds["General Expense"]]
      );
    }

    await client.query("COMMIT");
    console.log("\nSeed complete.");
    console.log("Organization: NeoProp Technologies");
    console.log("Login email:", email);
    console.log("Login password:", password);
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
