/* eslint-disable */
exports.shorthands = undefined;

// Closes the last real gap on the purchases side: Bills and Vendor Credits currently post
// ONE fuzzy-matched purchase-expense account for the WHOLE document (see findPurchaseExpenseAccountId
// in auto-journal.ts) instead of the per-line account a real multi-line bill needs — every other
// document type in this app (invoices, sales/purchase orders, credit/debit notes) shares that
// same single-account simplification, but the "Record Bill"/"Vendor Credit" reference screenshots
// this migration was built from both show a per-row ACCOUNT column, and posting a bill with (say)
// a rent line and a utilities line to one merged "Cost of Goods Sold" account isn't actually
// correct double-entry. This migration is a deliberate, scoped exception to the rest of the
// codebase's single-account convention — see auto-journal.ts's rewritten syncBillJournal /
// syncVendorCreditJournal for how the new columns are used.
//
// Also adds the header fields the two screenshots show that had no columns anywhere (Order
// Number, Permit#, Subject, Payment Terms, Accounts Payable account override, Vendor Credit's
// Discount) and the allocations table Payments Made needs to settle against MULTIPLE open bills
// (mirroring payment_allocations from migrations/1758500000000_payment_allocations.js on the
// receipts side) instead of the old single bill_id column, which only ever let one payment point
// at one bill.
exports.up = (pgm) => {
  // ---------- Bills: per-line account/tax/customer + header fields ----------
  pgm.addColumns("bill_items", {
    account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    tax_rate_id: { type: "uuid", references: "tax_rates", onDelete: "set null" },
    tax_amount: { type: "numeric", notNull: true, default: 0 },
    // Capture-only, same scope decision as expenses.customer_id (see
    // migrations/1760000000000_expense_tax_fields.js) — shown per-line as "Customer Details"
    // to match the screenshot, but there's no billable-expense/reimburse-to-invoice workflow
    // behind it.
    customer_id: { type: "uuid", references: "customers", onDelete: "set null" },
  });
  pgm.addColumns("bills", {
    order_number: { type: "text" },
    permit_number: { type: "text" },
    subject: { type: "text" },
    payment_terms: { type: "text", notNull: true, default: "due_on_receipt" },
    // Lets a bill override which AP account it posts to; syncBillJournal falls back to the
    // fuzzy accounts_payable-type lookup when this is left unset, same as before.
    accounts_payable_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
  });

  // ---------- Vendor Credits: line items (this table never existed) + header fields ----------
  pgm.createTable("vendor_credit_items", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    vendor_credit_id: { type: "uuid", notNull: true, references: "vendor_credits", onDelete: "cascade" },
    item_id: { type: "uuid", references: "items", onDelete: "set null" },
    description: { type: "text" },
    quantity: { type: "numeric", notNull: true, default: 1 },
    rate: { type: "numeric", notNull: true, default: 0 },
    account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    tax_rate_id: { type: "uuid", references: "tax_rates", onDelete: "set null" },
    tax_amount: { type: "numeric", notNull: true, default: 0 },
    customer_id: { type: "uuid", references: "customers", onDelete: "set null" },
    amount: { type: "numeric", notNull: true, default: 0 },
  });
  pgm.createIndex("vendor_credit_items", "vendor_credit_id");

  pgm.addColumns("vendor_credits", {
    order_number: { type: "text" },
    subject: { type: "text" },
    accounts_payable_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    subtotal: { type: "numeric", notNull: true, default: 0 },
    tax_total: { type: "numeric", notNull: true, default: 0 },
    discount_percent: { type: "numeric", notNull: true, default: 0 },
  });
  // vendor_credits.total already exists (init.js) and keeps its meaning: the grand total
  // after tax/discount — subtotal/tax_total/discount_percent are new inputs that total is
  // now derived from (see vendor-credits-api.ts) instead of being entered directly.

  // ---------- Payments Made: multi-bill allocation (mirrors payment_allocations) ----------
  pgm.addColumns("payments_made", {
    status: { type: "text", notNull: true, default: "paid" }, // draft | paid — mirrors payments_received.status
  });
  pgm.createTable("bill_payment_allocations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    payment_made_id: { type: "uuid", notNull: true, references: "payments_made", onDelete: "cascade" },
    bill_id: { type: "uuid", notNull: true, references: "bills", onDelete: "cascade" },
    amount: { type: "numeric", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("bill_payment_allocations", "payment_made_id");
  pgm.createIndex("bill_payment_allocations", "bill_id");
};

exports.down = (pgm) => {
  pgm.dropTable("bill_payment_allocations");
  pgm.dropColumns("payments_made", ["status"]);

  pgm.dropColumns("vendor_credits", ["order_number", "subject", "accounts_payable_account_id", "subtotal", "tax_total", "discount_percent"]);
  pgm.dropTable("vendor_credit_items");

  pgm.dropColumns("bills", ["order_number", "permit_number", "subject", "payment_terms", "accounts_payable_account_id"]);
  pgm.dropColumns("bill_items", ["account_id", "tax_rate_id", "tax_amount", "customer_id"]);
};
