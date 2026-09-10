/* eslint-disable */
exports.shorthands = undefined;

// Lets an invoice created by converting a Sales Order remember which one it came from, so the
// Invoices list/detail can show it (see convert-to-invoice/route.ts and entities.ts's new
// "sales_order_id" field on invoices). Nullable + ON DELETE SET NULL, same as the existing
// reverse-direction sales_orders.converted_invoice_id FK — deleting the sales order later
// shouldn't take the invoice down with it, just drop the now-dangling reference.
exports.up = (pgm) => {
  pgm.addColumns("invoices", {
    sales_order_id: { type: "uuid", references: "sales_orders", onDelete: "SET NULL" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("invoices", ["sales_order_id"]);
};
