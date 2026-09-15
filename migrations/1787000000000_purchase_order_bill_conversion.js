/* eslint-disable */
exports.shorthands = undefined;

// Adds "Convert to Bill" / "View Bill" to the Purchase Order detail page — the purchases-side
// mirror of sales_orders.converted_invoice_id / converted_purchase_order_id
// (1758900000000_purchase_orders_and_so_conversions.js). Nullable, set null on delete of the
// target bill (converting doesn't get undone, but deleting the resulting bill shouldn't leave
// a dangling reference on the purchase order — same convention as every other converted_*_id
// column in this app). No unique constraint, matching that same precedent: the app-level guard
// in the convert-to-bill route (`if (po.converted_bill_id) ...`) is what prevents a duplicate
// conversion, not the schema.
//
// See src/app/api/purchase-orders/[id]/convert-to-bill/route.ts for why this needed its own
// migration rather than just reusing createDocument like Sales-Order-to-Invoice does: Bills
// bypass the generic document engine entirely (bills-api.ts) and require a real account_id on
// every line before syncBillJournal will post anything — purchase_order_items has no such
// column, so the route asks the user to pick one Account (applied to every converted line)
// before creating the bill, rather than silently converting into a bill that posts no journal
// entry at all.
exports.up = (pgm) => {
  pgm.addColumns("purchase_orders", {
    converted_bill_id: { type: "uuid", references: "bills", onDelete: "set null" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("purchase_orders", ["converted_bill_id"]);
};
