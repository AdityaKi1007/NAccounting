/* eslint-disable */
exports.shorthands = undefined;

// Reuses the tax_registration_number column added earlier for Company Profile so both
// pages read/write the same TRN value instead of tracking two copies.

exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    tax_identification_number: { type: "text" }, // TIN
    international_trade_enabled: { type: "boolean", notNull: true, default: false },
    business_legal_name: { type: "text" },
    business_trade_name: { type: "text" },
    vat_registered_on: { type: "date" },
    first_tax_return_from: { type: "date" },
    tax_reporting_period: { type: "text", notNull: true, default: "monthly" }, // monthly | quarterly | annually
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", [
    "tax_identification_number",
    "international_trade_enabled",
    "business_legal_name",
    "business_trade_name",
    "vat_registered_on",
    "first_tax_return_from",
    "tax_reporting_period",
  ]);
};
