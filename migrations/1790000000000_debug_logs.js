/* eslint-disable */
exports.shorthands = undefined;

// "Debug Logs" — a new settings section next to Usages (Audit Logs / API Usage), requested
// directly: "create section Debug Logs next to Usages, to enable debug logs and record all
// kind of exceptions logs under new object Debug Logs. also enable option to delete logs by
// admin and super admin."
//
// organizations.debug_logs_enabled is the opt-in toggle (default OFF, same "quiet by default"
// convention as api_field_configs — see 1772000000000_api_field_configs.js) — every write path
// into debug_logs checks it first (see src/lib/debug-logs.ts's logException) and no-ops when
// off, so nothing is captured or stored until an Owner/Admin/Super Admin explicitly turns it on
// from the Debug Logs settings page.
//
// debug_logs itself is deliberately NOT a per-entity audit trail like audit_log — it's a
// catch-all for unexpected exceptions (bugs), not intentional user actions. organization_id is
// nullable because a small number of capture points (e.g. an error surfaced before an org
// context could be resolved at all) have no organization to attach to; those rows are only
// ever visible to a Super Admin (see the read-side scoping in debug-logs.ts), never to a
// regular org Owner/Admin. source distinguishes where the exception was caught ('server' for
// an API route/library exception, 'client' for a browser-side JS error or React render crash —
// see DebugLogCapture.tsx / DebugErrorBoundary.tsx). context is a free-form jsonb bag (route,
// method, url, entity, user agent, React component stack, ...) — deliberately unstructured
// since the whole point of this table is to catch cases nobody anticipated in advance.
exports.up = (pgm) => {
  pgm.addColumns('organizations', {
    debug_logs_enabled: { type: 'boolean', notNull: true, default: false },
  });

  pgm.createTable('debug_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', references: 'organizations', onDelete: 'cascade' },
    source: { type: 'text', notNull: true }, // 'server' | 'client'
    level: { type: 'text', notNull: true, default: 'error' }, // room to grow; only 'error' is written today
    message: { type: 'text', notNull: true },
    stack: { type: 'text' },
    context: { type: 'jsonb' }, // route/method/url/entity/userAgent/componentStack/... — free-form
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('debug_logs', ['organization_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('debug_logs');
  pgm.dropColumns('organizations', ['debug_logs_enabled']);
};
