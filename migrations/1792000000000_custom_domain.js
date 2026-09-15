/* eslint-disable */
exports.shorthands = undefined;

// "build custom domain feature for admin / owner and super admins so companies can make their
// own domain e.g. companyname.accounting.propcrm.app. feature to be available under custom
// domains" (2026-09-15). The existing Settings -> Company -> Custom Domain page was a
// placeholder ("Serve the customer portal from your own domain" with no working view).
//
// Scoped down after asking: this is a subdomain-of-our-own-domain slug (companyname ->
// companyname.accounting.propcrm.app), not a bring-your-own external domain with DNS/CNAME
// verification — and it's the domain settings only (pick/save/validate/enable a subdomain),
// matching the "wired up, ready for the feature that will consume it" pattern already used
// elsewhere in this app (there's no customer-facing portal built yet for this to actually
// route traffic to — see customers.portal_enabled, a stored flag with nothing consuming it
// either). Edit access is owner/admin/Super Admin only, via the same canManageOrgSettings gate
// added for every other Settings screen on 2026-09-15 (see
// claude/known-issues-local-env-addendum-settings-readonly-access-2026-09-15.md).
exports.up = (pgm) => {
  pgm.addColumns("organizations", {
    // The chosen slug only (e.g. "companyname"), never the full hostname — the base domain
    // (accounting.propcrm.app) is an app-wide constant (src/lib/custom-domain.ts), not stored
    // per-org, so it can be changed in one place if the app's own domain ever changes.
    // Nullable: no subdomain chosen yet is the default state for every existing + new org.
    custom_domain_subdomain: { type: "text" },
    // Separate from "is a subdomain saved" so an org can pick a subdomain, decide it's not
    // ready to go live, and flip it back on later without re-entering/re-validating the slug —
    // same "saved but toggled off" shape as multiple_transaction_series_enabled elsewhere on
    // this table.
    custom_domain_enabled: { type: "boolean", notNull: true, default: false },
  });

  // Case-insensitive uniqueness across the whole platform (not just per-org) — two
  // organizations can never claim the same subdomain, since it would otherwise be ambiguous
  // which org's portal a visitor to that hostname should see. Partial expression index (WHERE
  // NOT NULL) so any number of orgs can simultaneously have no subdomain chosen. Raw SQL
  // because pgm.createIndex's column list takes plain column names, not expressions.
  pgm.sql(`
    CREATE UNIQUE INDEX "organizations_custom_domain_subdomain_unique"
    ON "organizations" (lower(custom_domain_subdomain))
    WHERE custom_domain_subdomain IS NOT NULL
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS "organizations_custom_domain_subdomain_unique"`);
  pgm.dropColumns("organizations", ["custom_domain_subdomain", "custom_domain_enabled"]);
};
