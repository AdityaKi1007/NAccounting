/* eslint-disable */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  // ---------- Tenancy ----------
  pgm.createTable('organizations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    currency: { type: 'text', notNull: true, default: 'AED' },
    fiscal_year_start: { type: 'text', notNull: true, default: '01-01' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('memberships', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'cascade' },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    role: { type: 'text', notNull: true, default: 'staff' }, // owner | admin | staff
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('memberships', 'memberships_user_org_unique', 'UNIQUE(user_id, organization_id)');

  // ---------- Chart of Accounts ----------
  pgm.createTable('accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    code: { type: 'text' },
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true }, // asset|liability|equity|income|expense
    description: { type: 'text' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Banking ----------
  pgm.createTable('bank_accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    account_type: { type: 'text', notNull: true, default: 'bank' }, // bank | credit_card
    account_name: { type: 'text', notNull: true },
    account_code: { type: 'text' },
    currency: { type: 'text', notNull: true, default: 'AED' },
    account_number: { type: 'text' },
    bank_name: { type: 'text' },
    bank_identifier_code: { type: 'text' },
    description: { type: 'text' },
    is_primary: { type: 'boolean', notNull: true, default: false },
    opening_balance: { type: 'numeric', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Items ----------
  pgm.createTable('items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    sku: { type: 'text' },
    type: { type: 'text', notNull: true, default: 'goods' }, // goods | service
    unit: { type: 'text' },
    sales_price: { type: 'numeric', notNull: true, default: 0 },
    purchase_price: { type: 'numeric', notNull: true, default: 0 },
    description: { type: 'text' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Sales: Customers ----------
  pgm.createTable('customers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    display_name: { type: 'text', notNull: true },
    company_name: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    billing_address: { type: 'text' },
    shipping_address: { type: 'text' },
    currency: { type: 'text', notNull: true, default: 'AED' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Purchases: Vendors ----------
  pgm.createTable('vendors', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    display_name: { type: 'text', notNull: true },
    company_name: { type: 'text' },
    email: { type: 'text' },
    phone: { type: 'text' },
    billing_address: { type: 'text' },
    currency: { type: 'text', notNull: true, default: 'AED' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Quotes ----------
  pgm.createTable('quotes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    quote_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    quote_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    expiry_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|sent|accepted|declined
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('quote_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    quote_id: { type: 'uuid', notNull: true, references: 'quotes', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });

  // ---------- Invoices ----------
  pgm.createTable('invoices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    invoice_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    invoice_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    due_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|sent|paid|partially_paid|overdue
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    balance_due: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('invoice_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    invoice_id: { type: 'uuid', notNull: true, references: 'invoices', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });

  // ---------- Recurring Invoices ----------
  pgm.createTable('recurring_invoices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    profile_name: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    frequency: { type: 'text', notNull: true, default: 'monthly' },
    start_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    end_date: { type: 'date' },
    next_invoice_date: { type: 'date' },
    amount: { type: 'numeric', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'active' }, // active|stopped
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Delivery Challans ----------
  pgm.createTable('delivery_challans', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    challan_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    challan_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    reason: { type: 'text', notNull: true, default: 'supply_of_goods' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|delivered
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Payments Received ----------
  pgm.createTable('payments_received', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    payment_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    invoice_id: { type: 'uuid', references: 'invoices', onDelete: 'set null' },
    payment_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    amount: { type: 'numeric', notNull: true, default: 0 },
    payment_mode: { type: 'text', notNull: true, default: 'cash' },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'set null' },
    reference_number: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Credit Notes ----------
  pgm.createTable('credit_notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    credit_note_number: { type: 'text', notNull: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'set null' },
    credit_note_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    status: { type: 'text', notNull: true, default: 'open' }, // open|closed
    total: { type: 'numeric', notNull: true, default: 0 },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Expenses ----------
  pgm.createTable('expenses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    expense_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    paid_through_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'set null' },
    amount: { type: 'numeric', notNull: true, default: 0 },
    tax_amount: { type: 'numeric', notNull: true, default: 0 },
    reference_number: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Recurring Expenses ----------
  pgm.createTable('recurring_expenses', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    profile_name: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    frequency: { type: 'text', notNull: true, default: 'monthly' },
    start_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    next_expense_date: { type: 'date' },
    amount: { type: 'numeric', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Bills ----------
  pgm.createTable('bills', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    bill_number: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    bill_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    due_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|open|paid|partially_paid|overdue
    subtotal: { type: 'numeric', notNull: true, default: 0 },
    tax_total: { type: 'numeric', notNull: true, default: 0 },
    total: { type: 'numeric', notNull: true, default: 0 },
    balance_due: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('bill_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    bill_id: { type: 'uuid', notNull: true, references: 'bills', onDelete: 'cascade' },
    item_id: { type: 'uuid', references: 'items', onDelete: 'set null' },
    description: { type: 'text' },
    quantity: { type: 'numeric', notNull: true, default: 1 },
    rate: { type: 'numeric', notNull: true, default: 0 },
    amount: { type: 'numeric', notNull: true, default: 0 },
  });

  // ---------- Recurring Bills ----------
  pgm.createTable('recurring_bills', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    profile_name: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    frequency: { type: 'text', notNull: true, default: 'monthly' },
    start_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    next_bill_date: { type: 'date' },
    amount: { type: 'numeric', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Payments Made ----------
  pgm.createTable('payments_made', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    payment_number: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    bill_id: { type: 'uuid', references: 'bills', onDelete: 'set null' },
    payment_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    amount: { type: 'numeric', notNull: true, default: 0 },
    payment_mode: { type: 'text', notNull: true, default: 'cash' },
    bank_account_id: { type: 'uuid', references: 'bank_accounts', onDelete: 'set null' },
    reference_number: { type: 'text' },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Vendor Credits ----------
  pgm.createTable('vendor_credits', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    credit_note_number: { type: 'text', notNull: true },
    vendor_id: { type: 'uuid', references: 'vendors', onDelete: 'set null' },
    credit_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    status: { type: 'text', notNull: true, default: 'open' },
    total: { type: 'numeric', notNull: true, default: 0 },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Accountant: Manual Journals ----------
  pgm.createTable('manual_journals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    journal_number: { type: 'text', notNull: true },
    journal_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    reference_number: { type: 'text' },
    notes: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'draft' }, // draft|published
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('journal_lines', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    journal_id: { type: 'uuid', notNull: true, references: 'manual_journals', onDelete: 'cascade' },
    account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    description: { type: 'text' },
    debit: { type: 'numeric', notNull: true, default: 0 },
    credit: { type: 'numeric', notNull: true, default: 0 },
  });

  // ---------- Budgets ----------
  pgm.createTable('budgets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    fiscal_year: { type: 'text', notNull: true },
    account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    period: { type: 'text', notNull: true, default: 'yearly' }, // monthly|quarterly|yearly
    amount: { type: 'numeric', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Currency Adjustments ----------
  pgm.createTable('currency_adjustments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    adjustment_date: { type: 'date', notNull: true, default: pgm.func('current_date') },
    account_id: { type: 'uuid', references: 'accounts', onDelete: 'set null' },
    currency: { type: 'text', notNull: true, default: 'USD' },
    exchange_rate: { type: 'numeric', notNull: true, default: 1 },
    adjustment_amount: { type: 'numeric', notNull: true, default: 0 },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Transaction Locking ----------
  pgm.createTable('transaction_locks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    organization_id: { type: 'uuid', notNull: true, references: 'organizations', onDelete: 'cascade' },
    lock_date: { type: 'date', notNull: true },
    reason: { type: 'text' },
    locked_by: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // ---------- Indexes for tenant scoping ----------
  const tenantTables = [
    'accounts', 'bank_accounts', 'items', 'customers', 'vendors', 'quotes', 'invoices',
    'recurring_invoices', 'delivery_challans', 'payments_received', 'credit_notes',
    'expenses', 'recurring_expenses', 'bills', 'recurring_bills', 'payments_made',
    'vendor_credits', 'manual_journals', 'budgets', 'currency_adjustments', 'transaction_locks',
  ];
  for (const t of tenantTables) {
    pgm.createIndex(t, 'organization_id');
  }
};

exports.down = (pgm) => {
  const tables = [
    'transaction_locks', 'currency_adjustments', 'budgets', 'journal_lines', 'manual_journals',
    'vendor_credits', 'payments_made', 'recurring_bills', 'bill_items', 'bills',
    'recurring_expenses', 'expenses', 'credit_notes', 'payments_received', 'delivery_challans',
    'recurring_invoices', 'invoice_items', 'invoices', 'quote_items', 'quotes',
    'vendors', 'customers', 'items', 'bank_accounts', 'accounts',
    'memberships', 'users', 'organizations',
  ];
  for (const t of tables) pgm.dropTable(t, { ifExists: true, cascade: true });
};
