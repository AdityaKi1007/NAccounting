/* eslint-disable */
exports.shorthands = undefined;

// Closes the double-entry gap on the purchases side: Bills, Payments Made, Expenses and
// Vendor Credits previously had no journal at all (only Invoices/Payments Received/Credit
// & Debit Notes did — see migrations/1758600000000_auto_journals.js and
// 1759000000000_credit_debit_notes.js). Without this, a Balance Sheet built from the ledger
// wouldn't balance (Assets != Liabilities + Equity) and P&L would show no expenses at all.
// Same linkage pattern as those two migrations: one nullable FK column per document type on
// manual_journals, a partial-unique index so each document has at most one auto-journal, and
// ON DELETE CASCADE so deleting the document cleans up its journal for free.
//
// Also adds invoices.salesperson (free text, mirrors sales_orders.salesperson from
// 1758800000000_sales_order_detail_fields.js) so a "Sales by Salesperson" report has real
// data to report on.
exports.up = (pgm) => {
  pgm.addColumns('manual_journals', {
    bill_id: { type: 'uuid', references: 'bills', onDelete: 'cascade' },
    payment_made_id: { type: 'uuid', references: 'payments_made', onDelete: 'cascade' },
    expense_id: { type: 'uuid', references: 'expenses', onDelete: 'cascade' },
    vendor_credit_id: { type: 'uuid', references: 'vendor_credits', onDelete: 'cascade' },
  });
  pgm.createIndex('manual_journals', 'bill_id', {
    name: 'manual_journals_bill_id_unique',
    unique: true,
    where: 'bill_id IS NOT NULL',
  });
  pgm.createIndex('manual_journals', 'payment_made_id', {
    name: 'manual_journals_payment_made_id_unique',
    unique: true,
    where: 'payment_made_id IS NOT NULL',
  });
  pgm.createIndex('manual_journals', 'expense_id', {
    name: 'manual_journals_expense_id_unique',
    unique: true,
    where: 'expense_id IS NOT NULL',
  });
  pgm.createIndex('manual_journals', 'vendor_credit_id', {
    name: 'manual_journals_vendor_credit_id_unique',
    unique: true,
    where: 'vendor_credit_id IS NOT NULL',
  });

  pgm.addColumns('invoices', {
    salesperson: { type: 'text' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('invoices', ['salesperson']);
  pgm.dropIndex('manual_journals', 'bill_id', { name: 'manual_journals_bill_id_unique' });
  pgm.dropIndex('manual_journals', 'payment_made_id', { name: 'manual_journals_payment_made_id_unique' });
  pgm.dropIndex('manual_journals', 'expense_id', { name: 'manual_journals_expense_id_unique' });
  pgm.dropIndex('manual_journals', 'vendor_credit_id', { name: 'manual_journals_vendor_credit_id_unique' });
  pgm.dropColumns('manual_journals', ['bill_id', 'payment_made_id', 'expense_id', 'vendor_credit_id']);
};
