/* eslint-disable */
exports.shorthands = undefined;

// Platform-level Super Admin + org approval + module toggles + subscription plan/user limits +
// per-module Read/Write access control (extends the existing per-org Roles feature).
//
// Scope decisions (confirmed with the account owner before building):
//  - Super Admin is a platform-level flag on `users`, not tied to any organization. Only
//    aditya.kishor@gmail.com is flagged here.
//  - Every organization that already exists at the time this migration runs is grandfathered
//    to approval_status='approved' in the same migration, so nothing already live is ever
//    blocked by the new gate. Only orgs created AFTER this migration get the new 'pending'
//    default (via /api/signup and /api/organizations, updated separately).
//  - Disabled modules are "fully blocked": hidden from nav AND blocked at the page/API level
//    if reached directly (enforced in application code via requireModuleAccess()).
//  - Per-module Read/Write access control extends the existing (previously decorative) `roles`
//    entity rather than centralizing it in the Super Admin panel: each org's own Owner/Admin
//    defines what a custom role can view/create/edit/delete per module. `role_permissions` is
//    a real relational table (id, role_id, module_key, can_view, can_write), matching this
//    codebase's established preference (see tax_rates, account_opening_balances) over a jsonb
//    blob. `memberships.role_id` is nullable and purely additive: existing memberships keep
//    role_id = null, which means "use the legacy owner/admin/staff behavior, unrestricted for
//    staff" exactly as today — zero regression risk. Assigning a role_id to a 'staff' membership
//    is what opts that member into the new per-module permission matrix.

exports.up = (pgm) => {
  // ---------- Super Admin ----------
  pgm.addColumns('users', {
    is_super_admin: { type: 'boolean', notNull: true, default: false },
  });
  pgm.sql(`UPDATE users SET is_super_admin = true WHERE email = 'aditya.kishor@gmail.com'`);

  // ---------- Org approval / plan / module toggles ----------
  pgm.addColumns('organizations', {
    approval_status: { type: 'text', notNull: true, default: 'pending' }, // pending | approved | rejected
    approved_at: { type: 'timestamptz' },
    approved_by: { type: 'uuid', references: 'users', onDelete: 'set null' },
    rejection_reason: { type: 'text' },
    subscription_plan: { type: 'text', notNull: true, default: 'standard' },
    max_users: { type: 'integer' }, // null = unlimited
    disabled_modules: { type: 'text[]', notNull: true, default: '{}' }, // empty = everything enabled
  });

  // Grandfather every organization that already exists: auto-approve so today's users are
  // never gated by a feature that didn't exist when their org was created.
  pgm.sql(`UPDATE organizations SET approval_status = 'approved', approved_at = now()`);

  // ---------- Per-module Read/Write permissions for custom roles ----------
  pgm.createTable('role_permissions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    role_id: { type: 'uuid', notNull: true, references: 'roles', onDelete: 'cascade' },
    module_key: { type: 'text', notNull: true },
    can_view: { type: 'boolean', notNull: true, default: true },
    can_write: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('role_permissions', 'role_permissions_role_module_unique', 'UNIQUE(role_id, module_key)');
  pgm.createIndex('role_permissions', 'role_id');

  // ---------- Membership -> custom role link ----------
  // Nullable, no default: null keeps a membership's access exactly as it behaves today
  // (owner/admin always full access; staff with role_id=null stays unrestricted). Only set
  // when an org's Owner/Admin explicitly assigns a custom role to a 'staff' member.
  pgm.addColumns('memberships', {
    role_id: { type: 'uuid', references: 'roles', onDelete: 'set null' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('memberships', ['role_id']);
  pgm.dropTable('role_permissions', { ifExists: true, cascade: true });
  pgm.dropColumns('organizations', [
    'approval_status',
    'approved_at',
    'approved_by',
    'rejection_reason',
    'subscription_plan',
    'max_users',
    'disabled_modules',
  ]);
  pgm.dropColumns('users', ['is_super_admin']);
};
