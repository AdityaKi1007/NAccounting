/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    industry: { type: "text" },
    location_country: { type: "text", notNull: true, default: "United Arab Emirates" },
    is_designated_zone: { type: "boolean", notNull: true, default: false },
    registration_number: { type: "text" }, // company registration / trade license number
    tax_registration_number: { type: "text" }, // VAT / TRN
    address_attention: { type: "text" },
    address_street1: { type: "text" },
    address_street2: { type: "text" },
    address_city: { type: "text" },
    address_state: { type: "text" }, // state / emirate
    address_zip: { type: "text" },
    address_phone: { type: "text" },
    address_fax: { type: "text" },
    timezone: { type: "text", notNull: true, default: "Asia/Dubai" },
    date_format: { type: "text", notNull: true, default: "DD/MM/YYYY" },
    report_basis: { type: "text", notNull: true, default: "accrual" }, // accrual | cash
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", [
    "industry",
    "location_country",
    "is_designated_zone",
    "registration_number",
    "tax_registration_number",
    "address_attention",
    "address_street1",
    "address_street2",
    "address_city",
    "address_state",
    "address_zip",
    "address_phone",
    "address_fax",
    "timezone",
    "date_format",
    "report_basis",
  ]);
};
