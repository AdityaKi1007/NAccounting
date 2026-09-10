/* eslint-disable */
exports.shorthands = undefined;

// Incoming webhooks create an Expense row when hit, using a fixed field mapping
// (amount, date, reference_number, notes) documented on the create form rather than a
// configurable mapping UI — the same honest-scope-down used elsewhere in this build.
// incoming_webhook_calls exists purely so "Usage Stats (per day)" can be computed
// accurately instead of guessed from a running counter.

exports.up = (pgm) => {
  pgm.createTable("incoming_webhooks", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    token: { type: "text", notNull: true, unique: true },
    default_account_id: { type: "uuid", references: "accounts", onDelete: "set null" },
    default_paid_through_account_id: { type: "uuid", references: "bank_accounts", onDelete: "set null" },
    is_active: { type: "boolean", notNull: true, default: true },
    trigger_count: { type: "integer", notNull: true, default: 0 },
    last_triggered_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("incoming_webhooks", "organization_id");
  pgm.createIndex("incoming_webhooks", "token");

  pgm.createTable("incoming_webhook_calls", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    webhook_id: { type: "uuid", notNull: true, references: "incoming_webhooks", onDelete: "cascade" },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    called_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    status_code: { type: "integer", notNull: true },
    error: { type: "text" },
  });
  pgm.createIndex("incoming_webhook_calls", "organization_id");
  pgm.createIndex("incoming_webhook_calls", "called_at");
};

exports.down = (pgm) => {
  pgm.dropTable("incoming_webhook_calls", { ifExists: true, cascade: true });
  pgm.dropTable("incoming_webhooks", { ifExists: true, cascade: true });
};
