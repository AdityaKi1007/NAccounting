/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("customers", {
    customer_type: { type: "text", notNull: true, default: "business" }, // business | individual
    salutation: { type: "text" },
    first_name: { type: "text" },
    last_name: { type: "text" },
    secondary_display_name: { type: "text" },
    work_phone: { type: "text" },
    mobile: { type: "text" },
    language: { type: "text", notNull: true, default: "English" },
    accounts_receivable_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    opening_balance: { type: "numeric", notNull: true, default: 0 },
    payment_terms: { type: "text", notNull: true, default: "due_on_receipt" },
    portal_enabled: { type: "boolean", notNull: true, default: false },
    remarks: { type: "text" },
  });

  pgm.createTable("customer_contacts", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    customer_id: { type: "uuid", notNull: true, references: "customers", onDelete: "cascade" },
    salutation: { type: "text" },
    first_name: { type: "text" },
    last_name: { type: "text" },
    email: { type: "text" },
    work_phone: { type: "text" },
    mobile: { type: "text" },
    designation: { type: "text" },
    department: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("customer_contacts", "customer_id");
};

exports.down = (pgm) => {
  pgm.dropTable("customer_contacts", { ifExists: true, cascade: true });
  pgm.dropColumns("customers", [
    "customer_type",
    "salutation",
    "first_name",
    "last_name",
    "secondary_display_name",
    "work_phone",
    "mobile",
    "language",
    "accounts_receivable_account_id",
    "opening_balance",
    "payment_terms",
    "portal_enabled",
    "remarks",
  ]);
};
