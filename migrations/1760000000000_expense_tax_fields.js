/* eslint-disable */
exports.shorthands = undefined;

// Adds the UAE-VAT-looking fields the "Record Expense" screen shows (Tax Treatment, Place of
// Supply, Reverse Charge, Tax, Customer Name) that had no columns anywhere yet — a "capture
// only" build (see the AskUserQuestion answers this was built from): the values are stored and
// shown on the expense's detail page, but none of them changes how syncExpenseJournal() in
// auto-journal.ts actually posts to the GL. Reverse Charge in particular does NOT post the
// real self-assessed output+input VAT entries a compliant DRC transaction requires — it's a
// plain flag for now. tax_rate_id links to the tax_rates table (Settings -> Taxes) built
// earlier; picking one is what the form uses client-side to compute the existing tax_amount
// column, which is the only one syncExpenseJournal ever reads.
exports.up = (pgm) => {
  pgm.addColumns("expenses", {
    tax_treatment: { type: "text", notNull: true, default: "non_vat_registered" },
    place_of_supply: { type: "text" },
    reverse_charge: { type: "boolean", notNull: true, default: false },
    tax_rate_id: { type: "uuid", references: "tax_rates", onDelete: "set null" },
    customer_id: { type: "uuid", references: "customers", onDelete: "set null" },
  });
  pgm.createIndex("expenses", "customer_id");
};

exports.down = (pgm) => {
  pgm.dropIndex("expenses", "customer_id");
  pgm.dropColumns("expenses", ["tax_treatment", "place_of_supply", "reverse_charge", "tax_rate_id", "customer_id"]);
};
