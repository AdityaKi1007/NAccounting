/* eslint-disable */
exports.shorthands = undefined;

// Per-line "Cancel Items" on a Purchase Order (Zoho reference screenshot: the "..." menu on a
// PO's detail page has "Cancel Items" alongside "Mark as Canceled"). A cancelled line stays on
// the PO for the record (struck through in the UI) but is excluded from the PO's own
// Subtotal/Tax/Total and from what "Convert to Bill" pulls in — see
// src/app/api/purchase-orders/[id]/cancel-items/route.ts and the same route's guard against
// touching a PO that's already been converted to a bill (1787000000000).
//
// Deliberately a boolean on the line, not a third top-level PO status: "Mark as Canceled"
// (the existing 'void' status, see 1758900000000) cancels the whole document, while this is
// scoped per line — a PO can have some cancelled lines and still be Confirmed/Open for the
// rest, matching Zoho's own distinction between the two actions.
exports.up = (pgm) => {
  pgm.addColumns("purchase_order_items", {
    cancelled: { type: "boolean", notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("purchase_order_items", ["cancelled"]);
};
