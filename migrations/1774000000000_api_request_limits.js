/* eslint-disable */
exports.shorthands = undefined;

// Super Admin-configurable daily request cap for the third-party REST API (/api/v1/*), plus
// the daily usage counter it's checked against. Same "blank/null = unlimited" convention as
// organizations.max_users. Enforced in src/lib/api-context.ts's checkApiRequestLimit(), called
// from every /api/v1 route right after API-key auth succeeds. Surfaced read-only to the
// organization's own Admin/Owner under Settings -> Configurations -> General, alongside the
// existing Subscription Plan and Max Users (which a company Admin previously had no way to see
// at all, even though a Super Admin has controlled them since the 2026-09-12 Super Admin
// Access Control migration).
exports.up = (pgm) => {
  pgm.addColumns('organizations', {
    api_request_limit_per_day: { type: 'integer' }, // null = unlimited
  });

  pgm.createTable('api_usage_daily', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    usage_date: { type: 'date', notNull: true },
    request_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('api_usage_daily', 'api_usage_daily_org_date_unique', 'UNIQUE(organization_id, usage_date)');
  pgm.createIndex('api_usage_daily', 'organization_id');
};

exports.down = (pgm) => {
  pgm.dropTable('api_usage_daily', { ifExists: true, cascade: true });
  pgm.dropColumns('organizations', ['api_request_limit_per_day']);
};
