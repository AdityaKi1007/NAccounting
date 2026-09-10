/* eslint-disable */
exports.shorthands = undefined;

// Supports the new "Record Payment" flow: a single payment can now be applied across
// multiple unpaid invoices (Zoho's "Unpaid Invoices" table with a per-row Payment column),
// rather than the old single invoice_id column on payments_received which only let one
// payment point at one invoice. payments_received.invoice_id is left in place for backward
// compatibility with any existing rows, but new payments recorded through this flow rely on
// payment_allocations instead.

exports.up = (pgm) => {
  pgm.addColumns("payments_received", {
    status: { type: "text", notNull: true, default: "paid" }, // draft | paid
    bank_charges: { type: "numeric", notNull: true, default: 0 },
  });

  pgm.createTable("payment_allocations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    payment_id: { type: "uuid", notNull: true, references: "payments_received", onDelete: "cascade" },
    invoice_id: { type: "uuid", notNull: true, references: "invoices", onDelete: "cascade" },
    amount: { type: "numeric", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  pgm.createIndex("payment_allocations", "payment_id");
  pgm.createIndex("payment_allocations", "invoice_id");
};

exports.down = (pgm) => {
  pgm.dropTable("payment_allocations");
  pgm.dropColumns("payments_received", ["status", "bank_charges"]);
};
