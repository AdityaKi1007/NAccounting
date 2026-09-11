/* eslint-disable */
exports.shorthands = undefined;

// Three additions to the Taxes settings area (src/lib/settings.ts's "taxes" group), following
// up on the existing Tax Settings page:
//
// 1. `tax_rates` — the "Active Taxes" / "Tax Rates" list (a plain flat entity, same shape as
//    currencies/payment-terms — see src/lib/entities.ts). `is_default` marks the rate applied
//    to a customer whose own Tax Preference isn't configured (matches the note on the
//    reference screenshot). Every existing organization is backfilled with the same two
//    starter rows a brand-new org gets via provisionOrganization() (Standard Rate 5% /
//    default, Zero Rate 0%) — 5% is also this app's existing hardcoded document-tax default
//    (see DocumentForm.tsx), so Standard Rate's value matches what documents already do.
// 2. `organizations.profit_margin_scheme_enabled` — the one field on the new Tax Preferences
//    page.
// 3. `organizations.corporate_tax_*` — the Corporate Tax page. The six "Corporate Tax
//    Accounts" fields are real FKs into `accounts` (unlike the polymorphic entity_type/
//    entity_id pattern used elsewhere in this app) since each one always points at exactly
//    one table — same style as bank_accounts.gl_account_id. onDelete: 'set null' so deleting
//    the underlying account doesn't block the delete, it just clears the setting.
exports.up = (pgm) => {
  pgm.createTable("tax_rates", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    country_region: { type: "text" },
    rate: { type: "numeric(6,2)", notNull: true, default: 0 },
    is_default: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("tax_rates", ["organization_id"]);

  pgm.addColumns("organizations", {
    profit_margin_scheme_enabled: { type: "boolean", notNull: true, default: false },
    corporate_tax_registration_number: { type: "text" },
    corporate_tax_rate: { type: "numeric(5,2)", notNull: true, default: 9 },
    corporate_tax_first_return_from: { type: "date" },
    corporate_tax_liability_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    corporate_tax_liability_offset_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    corporate_tax_add_back_expense_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    corporate_tax_income_deducted_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    corporate_tax_entertainment_expenditure_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    corporate_tax_net_interest_expenditure_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
  });

  // Backfill so every existing org's Tax Rates list starts populated the same way a fresh
  // org's now will (see org-provisioning.ts's DEFAULT_TAX_RATES), instead of showing an empty
  // table until someone manually adds rows.
  pgm.sql(`
    INSERT INTO tax_rates (organization_id, name, rate, is_default)
    SELECT id, 'Standard Rate', 5, true FROM organizations
    UNION ALL
    SELECT id, 'Zero Rate', 0, false FROM organizations
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns("organizations", [
    "profit_margin_scheme_enabled",
    "corporate_tax_registration_number",
    "corporate_tax_rate",
    "corporate_tax_first_return_from",
    "corporate_tax_liability_account_id",
    "corporate_tax_liability_offset_account_id",
    "corporate_tax_add_back_expense_account_id",
    "corporate_tax_income_deducted_account_id",
    "corporate_tax_entertainment_expenditure_account_id",
    "corporate_tax_net_interest_expenditure_account_id",
  ]);
  pgm.dropTable("tax_rates");
};
