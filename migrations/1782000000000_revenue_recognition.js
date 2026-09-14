/* eslint-disable */
exports.shorthands = undefined;

// Revenue Recognition (Settings -> General -> Revenue Recognition, previously a placeholder —
// see the "revenue-recognition" settings slug in src/lib/settings.ts). Lets an invoice line
// item defer its revenue over a service period instead of recognizing it all on the invoice
// date, matching accrual-basis accounting: money billed today for a 12-month service should
// show up as income a twelfth at a time, not all at once.
//
// Design:
//   - `revenue_recognition_rules`: a small, reusable, org-scoped picklist of recognition
//     methods a line item can be tagged with — plain flat CRUD entity (src/lib/entities.ts),
//     same "static picklist stored as text, UI-only enforcement" convention as
//     other_charges.category / customers.customer_type. "immediate" is the default/no-op
//     method (behaves exactly like today — the whole amount posts to Income on the invoice
//     date); "straight_line" is the real deferral method this feature adds.
//   - `invoice_items` gains 3 nullable columns: which rule a line uses, and the service period
//     (start/end date) that rule's proration spans. Nullable/optional on every line — an
//     invoice with no recognition-tagged lines behaves identically to before this migration.
//     `revenue_recognition_rule_id` is a lookup reference (onDelete SET NULL, matching
//     projects.legal_entity_id's precedent), not composition — deleting a rule un-tags any
//     line using it rather than deleting the line.
//   - `revenue_recognition_schedules`: the generated proration — one row per (invoice line,
//     period), each period's own amount and a nullable `recognized_at`/`journal_id` set once
//     that period's own Dr Deferred Revenue / Cr Income journal has actually been posted (see
//     processDueRevenueRecognition in src/lib/auto-journal.ts, which — like every date-driven
//     effect in this app (see processDueJournalReversals) — runs on read rather than via a
//     cron this app doesn't have). `invoice_id` cascades: deleting the invoice deletes every
//     schedule row for it, recognized or not — there's no invoice left for them to mean
//     anything against. `invoice_item_id` is onDelete SET NULL, NOT cascade, and (unlike every
//     other FK in this migration) nullable rather than notNull — documents-api.ts's
//     updateDocument edits an invoice's lines by deleting every existing invoice_items row and
//     reinserting fresh ones (new ids) on every save, even when only one line actually changed;
//     a cascading invoice_item_id would silently wipe out a schedule row's link — and, via
//     ON DELETE CASCADE, the row itself — the moment the invoice was merely re-saved, including
//     rows that already have a real, posted recognition journal behind them. SET NULL instead
//     lets syncRevenueRecognitionSchedule (auto-journal.ts) decide what survives an edit: it
//     checks BEFORE any of this happens (via invoice_id, not invoice_item_id) whether any row
//     for the invoice has recognized, and if so leaves the whole schedule untouched — "frozen",
//     never regenerated — precisely because invoice_item_id can no longer be trusted to survive
//     the edit either way. `journal_id` is onDelete SET NULL for the same reason in reverse:
//     once a period has actually been recognized, deleting or editing the invoice later must
//     not silently delete that historical journal entry.
//
// A genuinely new "Deferred Revenue" account (code 2040) rather than reusing the existing
// "Unearned Revenue" (2020) account — that one already has a distinct job (parking the
// unapplied/advance portion of a received payment, see syncPaymentJournal) and conflating the
// two would mix two different liabilities in one GL line. Backfilled onto every existing
// organization, same "backfill everyone, not just new orgs" convention as Opening Balance
// Adjustments (1762000000000_opening_balances.js) and Tax Rates before it.
exports.up = (pgm) => {
  pgm.createTable("revenue_recognition_rules", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    name: { type: "text", notNull: true },
    // 'immediate' | 'straight_line' — UI-only enforcement, see entities.ts.
    method: { type: "text", notNull: true, default: "straight_line" },
    // 'monthly' is the only supported frequency this pass implements (see auto-journal.ts's
    // proration helper) — stored as its own column rather than hardcoded so a future pass can
    // add 'daily'/'yearly' without another migration.
    frequency: { type: "text", notNull: true, default: "monthly" },
    description: { type: "text" },
    is_active: { type: "boolean", notNull: true, default: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("revenue_recognition_rules", "organization_id");

  pgm.addColumns("invoice_items", {
    revenue_recognition_rule_id: { type: "uuid", references: "revenue_recognition_rules", onDelete: "set null" },
    service_start_date: { type: "date" },
    service_end_date: { type: "date" },
  });

  pgm.createTable("revenue_recognition_schedules", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    organization_id: { type: "uuid", notNull: true, references: "organizations", onDelete: "cascade" },
    invoice_id: { type: "uuid", notNull: true, references: "invoices", onDelete: "cascade" },
    // Nullable + SET NULL, not notNull + cascade — see the header comment above for why.
    invoice_item_id: { type: "uuid", references: "invoice_items", onDelete: "set null" },
    period_start: { type: "date", notNull: true },
    period_end: { type: "date", notNull: true },
    amount: { type: "numeric", notNull: true, default: 0 },
    recognized_at: { type: "timestamptz" },
    journal_id: { type: "uuid", references: "manual_journals", onDelete: "set null" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("revenue_recognition_schedules", "organization_id");
  pgm.createIndex("revenue_recognition_schedules", "invoice_id");
  pgm.createIndex("revenue_recognition_schedules", "invoice_item_id");
  // The exact lookup processDueRevenueRecognition runs on every call — due, unrecognized rows.
  pgm.createIndex("revenue_recognition_schedules", ["period_end", "recognized_at"]);

  pgm.sql(`
    INSERT INTO accounts (organization_id, code, name, type)
    SELECT id, '2040', 'Deferred Revenue', 'other_current_liability'
    FROM organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts a WHERE a.organization_id = o.id AND a.name = 'Deferred Revenue'
    )
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("revenue_recognition_schedules");
  pgm.dropColumns("invoice_items", ["revenue_recognition_rule_id", "service_start_date", "service_end_date"]);
  pgm.dropTable("revenue_recognition_rules");
  // Deliberately NOT removing the backfilled "Deferred Revenue" accounts — same convention as
  // every other data backfill in this codebase (irreversible seed, not schema).
};
