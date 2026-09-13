import { pool, query } from "@/lib/db";

// Field catalog + per-organization opt-outs for the "Request Payload Builder" feature on
// Settings -> Integrations -> API Keys. This lets an org add/remove which OPTIONAL fields
// their /api/v1/* integration is allowed to send on create/update, per entity — while a small
// set of CORE fields per entity/operation can never be turned off (removing them would make
// the write meaningless, e.g. an invoice with no customer_id).
//
// This is a real, enforced restriction, not just a docs tool: every /api/v1/* POST/PATCH route
// listed in the catalog below calls filterConfigurableFields() on the relevant slice of its
// request body before handing it to the underlying create/update logic (documents-api.ts,
// receipts-api.ts, credit-debit-notes-api.ts, crud.ts) — a field the org has disabled is
// stripped out silently (as if the caller never sent it) rather than erroring, since it's a
// payload-shape restriction, not a validation failure. Multi-tenant by construction: every
// row in api_field_configs is scoped by organization_id (see the migration), so one org's
// configuration can never affect another org's integration, and every lookup here always goes
// through the caller's own ctx.orgId, exactly like every other /api/v1/* read or write.

export type ConfigurableEntity = "invoices" | "sales-orders" | "receipts" | "customers" | "vendors" | "credit-notes";
export type ConfigurableOperation = "create" | "update";

export interface FieldSpec {
  name: string;
  label: string;
  /** Core fields are always sent/accepted — they can't be disabled, and don't appear as a
   * togglable checkbox in the builder UI (shown there as permanently-on instead). */
  core?: boolean;
  /** Sample value used to render the request/response preview in the builder UI and is not
   * otherwise used by the actual enforcement logic. */
  sample: string | number | boolean | null;
  /** True for a field the server assigns a value for on its own even when the client's own
   * value is disabled/stripped (e.g. invoice_number falls back to the org's number series) —
   * so the builder's response preview should keep showing a sample value for it instead of
   * null when it's turned off, unlike every other optional field. */
  autoAssignedIfDisabled?: boolean;
}

type Catalog = Record<ConfigurableEntity, Partial<Record<ConfigurableOperation, FieldSpec[]>>>;

export const FIELD_CATALOG: Catalog = {
  invoices: {
    create: [
      { name: "customer_id", label: "Customer", core: true, sample: "05dfee68-f504-4694-83b0-471c251676ab" },
      { name: "invoice_number", label: "Invoice #", sample: "INV-000123", autoAssignedIfDisabled: true },
      { name: "invoice_date", label: "Invoice Date", sample: "2026-09-12" },
      { name: "due_date", label: "Due Date", sample: "2026-09-26" },
      { name: "status", label: "Status", sample: "sent" },
      { name: "notes", label: "Notes", sample: "Thank you for your business" },
      { name: "salesperson", label: "Salesperson", sample: "Aditya" },
      { name: "sales_order_id", label: "Sales Order", sample: null },
      { name: "project_id", label: "Project", sample: null },
      { name: "unit_id", label: "Unit", sample: null },
      { name: "crm_inv_no", label: "CRM Inv No", sample: "CRM-INV-3301" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
    update: [
      { name: "customer_id", label: "Customer", core: true, sample: "05dfee68-f504-4694-83b0-471c251676ab" },
      { name: "invoice_number", label: "Invoice #", sample: "INV-000123", autoAssignedIfDisabled: true },
      { name: "invoice_date", label: "Invoice Date", sample: "2026-09-12" },
      { name: "due_date", label: "Due Date", sample: "2026-09-26" },
      { name: "status", label: "Status", sample: "sent" },
      { name: "notes", label: "Notes", sample: "Corrected notes" },
      { name: "salesperson", label: "Salesperson", sample: "Aditya" },
      { name: "sales_order_id", label: "Sales Order", sample: null },
      { name: "project_id", label: "Project", sample: null },
      { name: "unit_id", label: "Unit", sample: null },
      { name: "crm_inv_no", label: "CRM Inv No", sample: "CRM-INV-3301" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
  },
  "sales-orders": {
    create: [
      { name: "customer_id", label: "Customer", core: true, sample: "05dfee68-f504-4694-83b0-471c251676ab" },
      { name: "so_number", label: "Sales Order #", sample: "SO-000045", autoAssignedIfDisabled: true },
      { name: "order_date", label: "Sales Order Date", sample: "2026-09-12" },
      { name: "shipment_date", label: "Expected Shipment Date", sample: "2026-09-20" },
      { name: "status", label: "Status", sample: "confirmed" },
      { name: "notes", label: "Customer Notes", sample: "Handle with care" },
      { name: "reference_number", label: "Reference #", sample: "PO-9981" },
      { name: "payment_terms", label: "Payment Terms", sample: "net_30" },
      { name: "delivery_method", label: "Delivery Method", sample: "Courier" },
      { name: "salesperson", label: "Salesperson", sample: "Aditya" },
      { name: "terms_conditions", label: "Terms & Conditions", sample: "Standard terms apply" },
      { name: "project_id", label: "Project", sample: null },
      { name: "unit_id", label: "Unit", sample: null },
      { name: "crm_so_no", label: "CRM SO No", sample: "CRM-SO-771" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
    update: [
      { name: "customer_id", label: "Customer", core: true, sample: "05dfee68-f504-4694-83b0-471c251676ab" },
      { name: "so_number", label: "Sales Order #", sample: "SO-000045", autoAssignedIfDisabled: true },
      { name: "order_date", label: "Sales Order Date", sample: "2026-09-12" },
      { name: "shipment_date", label: "Expected Shipment Date", sample: "2026-09-20" },
      { name: "status", label: "Status", sample: "confirmed" },
      { name: "notes", label: "Customer Notes", sample: "Handle with care" },
      { name: "reference_number", label: "Reference #", sample: "PO-9981" },
      { name: "payment_terms", label: "Payment Terms", sample: "net_30" },
      { name: "delivery_method", label: "Delivery Method", sample: "Courier" },
      { name: "salesperson", label: "Salesperson", sample: "Aditya" },
      { name: "terms_conditions", label: "Terms & Conditions", sample: "Standard terms apply" },
      { name: "project_id", label: "Project", sample: null },
      { name: "unit_id", label: "Unit", sample: null },
      { name: "crm_so_no", label: "CRM SO No", sample: "CRM-SO-771" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
  },
  receipts: {
    create: [
      { name: "customer_id", label: "Customer", core: true, sample: "05dfee68-f504-4694-83b0-471c251676ab" },
      { name: "amount", label: "Amount Received", core: true, sample: 1500 },
      { name: "bank_account_id", label: "Deposit To", core: true, sample: "08c46dd9-221c-4fe9-88e0-5086fcd420e5" },
      { name: "payment_number", label: "Payment #", sample: "PMT-000078", autoAssignedIfDisabled: true },
      { name: "payment_date", label: "Payment Date", sample: "2026-09-12" },
      { name: "bank_charges", label: "Bank Charges", sample: 0 },
      { name: "payment_mode", label: "Payment Mode", sample: "bank_transfer" },
      { name: "reference_number", label: "Reference #", sample: "TXN-88213" },
      { name: "notes", label: "Notes", sample: "Wire received" },
      { name: "status", label: "Status", sample: "paid" },
      { name: "project_id", label: "Project", sample: null },
      { name: "unit_id", label: "Unit", sample: null },
      { name: "crm_receipt_no", label: "CRM Receipt No", sample: "CRM-R-5512" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
    update: [
      { name: "payment_date", label: "Payment Date", sample: "2026-09-12" },
      { name: "reference_number", label: "Reference #", sample: "TXN-88213-corrected" },
      { name: "notes", label: "Notes", sample: "Corrected ref #" },
      { name: "payment_mode", label: "Payment Mode", sample: "bank_transfer" },
      { name: "crm_receipt_no", label: "CRM Receipt No", sample: "CRM-R-5512-corrected" },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
  },
  customers: {
    create: [
      { name: "display_name", label: "Display Name", core: true, sample: "Test Customer Co" },
      { name: "customer_type", label: "Customer Type", sample: "business" },
      { name: "salutation", label: "Salutation", sample: "Mr." },
      { name: "first_name", label: "First Name", sample: "John" },
      { name: "last_name", label: "Last Name", sample: "Doe" },
      { name: "company_name", label: "Company Name", sample: "Test Customer Co" },
      { name: "secondary_display_name", label: "Display Name (Arabic)", sample: null },
      { name: "email", label: "Email", sample: "cust@example.com" },
      { name: "work_phone", label: "Work Phone", sample: "555-1000" },
      { name: "mobile", label: "Mobile", sample: "555-2000" },
      { name: "language", label: "Customer Language", sample: "English" },
      { name: "currency", label: "Currency", sample: "AED" },
      { name: "accounts_receivable_account_id", label: "Accounts Receivable", sample: null },
      { name: "opening_balance", label: "Opening Balance", sample: 0 },
      { name: "payment_terms", label: "Payment Terms", sample: "net_30" },
      { name: "portal_enabled", label: "Allow Portal Access", sample: false },
      { name: "billing_address", label: "Billing Address", sample: "123 Main St" },
      { name: "shipping_address", label: "Shipping Address", sample: null },
      { name: "remarks", label: "Remarks", sample: null },
      { name: "crm_customer_no", label: "CRM Customer No", sample: "CRM-C-2210" },
      { name: "is_active", label: "Active", sample: true },
    ],
    update: [
      { name: "display_name", label: "Display Name", core: true, sample: "Test Customer Co" },
      { name: "customer_type", label: "Customer Type", sample: "business" },
      { name: "salutation", label: "Salutation", sample: "Mr." },
      { name: "first_name", label: "First Name", sample: "John" },
      { name: "last_name", label: "Last Name", sample: "Doe" },
      { name: "company_name", label: "Company Name", sample: "Test Customer Co" },
      { name: "secondary_display_name", label: "Display Name (Arabic)", sample: null },
      { name: "email", label: "Email", sample: "cust@example.com" },
      { name: "work_phone", label: "Work Phone", sample: "555-1000" },
      { name: "mobile", label: "Mobile", sample: "555-2000" },
      { name: "language", label: "Customer Language", sample: "English" },
      { name: "currency", label: "Currency", sample: "AED" },
      { name: "accounts_receivable_account_id", label: "Accounts Receivable", sample: null },
      { name: "opening_balance", label: "Opening Balance", sample: 0 },
      { name: "payment_terms", label: "Payment Terms", sample: "net_30" },
      { name: "portal_enabled", label: "Allow Portal Access", sample: false },
      { name: "billing_address", label: "Billing Address", sample: "123 Main St" },
      { name: "shipping_address", label: "Shipping Address", sample: null },
      { name: "remarks", label: "Remarks", sample: null },
      { name: "crm_customer_no", label: "CRM Customer No", sample: "CRM-C-2210" },
      { name: "is_active", label: "Active", sample: true },
    ],
  },
  vendors: {
    create: [
      { name: "display_name", label: "Display Name", core: true, sample: "Test Vendor Co" },
      { name: "company_name", label: "Company Name", sample: "Test Vendor Co" },
      { name: "email", label: "Email", sample: "vendor@example.com" },
      { name: "phone", label: "Phone", sample: "555-3000" },
      { name: "billing_address", label: "Billing Address", sample: "456 Supplier Ave" },
      { name: "currency", label: "Currency", sample: "AED" },
      { name: "opening_balance", label: "Opening Balance", sample: 0 },
      { name: "crm_vendor_no", label: "CRM Vendor No", sample: "CRM-V-1042" },
      { name: "is_active", label: "Active", sample: true },
    ],
    update: [
      { name: "display_name", label: "Display Name", core: true, sample: "Test Vendor Co" },
      { name: "company_name", label: "Company Name", sample: "Test Vendor Co" },
      { name: "email", label: "Email", sample: "vendor@example.com" },
      { name: "phone", label: "Phone", sample: "555-3000" },
      { name: "billing_address", label: "Billing Address", sample: "456 Supplier Ave" },
      { name: "currency", label: "Currency", sample: "AED" },
      { name: "opening_balance", label: "Opening Balance", sample: 0 },
      { name: "crm_vendor_no", label: "CRM Vendor No", sample: "CRM-V-1042" },
      { name: "is_active", label: "Active", sample: true },
    ],
  },
  "credit-notes": {
    // No "update" entry — credit_notes has no v1 update/PATCH endpoint at all (only create +
    // void — see /api/v1/credit-notes/[id]/route.ts), so there is nothing to configure there,
    // same as for every other credit-memo field.
    create: [
      { name: "invoice_id", label: "Invoice", core: true, sample: "392da528-fea4-4bfb-85e2-1d46029c361c" },
      { name: "note_date", label: "Date", sample: "2026-09-12" },
      { name: "reference_number", label: "Reference #", sample: "RMA-4471" },
      { name: "reason", label: "Reason", sample: "Damaged goods" },
      { name: "taxPercent", label: "Tax %", sample: 0 },
      { name: "legal_entity_id", label: "Legal Entity", sample: null },
    ],
  },
};

export const ENTITY_LABELS: Record<ConfigurableEntity, string> = {
  invoices: "Invoices",
  "sales-orders": "Sales Orders",
  receipts: "Receipts",
  customers: "Customers",
  vendors: "Vendors",
  "credit-notes": "Credit Memos",
};

function isConfigurableEntity(x: string): x is ConfigurableEntity {
  return Object.prototype.hasOwnProperty.call(FIELD_CATALOG, x);
}

export function getFieldSpecs(entity: string, operation: string): FieldSpec[] | null {
  if (!isConfigurableEntity(entity)) return null;
  const ops = FIELD_CATALOG[entity];
  const specs = ops[operation as ConfigurableOperation];
  return specs ?? null;
}

// Treated the same way the pre-existing 42703/42P01 handling in receipts-api.ts and
// credit-debit-notes-api.ts treats a schema that's behind: if the api_field_configs migration
// hasn't been run yet on some environment, every real /api/v1/* create/update call must keep
// working exactly as it did before this feature existed (i.e. every field accepted) rather
// than 500ing on every single write. getDisabledFields/getAllDisabledFields below swallow
// exactly "undefined_table" (42P01) and log once, returning "nothing disabled" — every other
// database error still propagates normally.
function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42P01";
}

/** Every org's opt-outs for one entity+operation, as a Set of field_name. No rows at all
 * (the default, and the state of every org until it visits the builder) means every optional
 * field is enabled — i.e. today's behavior, unchanged. */
export async function getDisabledFields(orgId: string, entity: string, operation: string): Promise<Set<string>> {
  try {
    const rows = await query<{ field_name: string }>(
      `SELECT field_name FROM api_field_configs WHERE organization_id = $1 AND entity = $2 AND operation = $3`,
      [orgId, entity, operation]
    );
    return new Set(rows.map((r) => r.field_name));
  } catch (err) {
    if (isMissingTable(err)) {
      console.error("api_field_configs table is missing — run `npm run migrate:up`. Treating every field as enabled for now.");
      return new Set();
    }
    throw err;
  }
}

/** Every disabled field for every entity/operation this org has touched, grouped for the
 * settings UI in one query instead of one per entity+operation. */
export async function getAllDisabledFields(orgId: string): Promise<Record<string, string[]>> {
  try {
    const rows = await query<{ entity: string; operation: string; field_name: string }>(
      `SELECT entity, operation, field_name FROM api_field_configs WHERE organization_id = $1`,
      [orgId]
    );
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const key = `${r.entity}:${r.operation}`;
      (out[key] ??= []).push(r.field_name);
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) {
      console.error("api_field_configs table is missing — run `npm run migrate:up`. Request Payload Builder will show all-enabled until then.");
      return {};
    }
    throw err;
  }
}

/** Replaces this org's disabled-field set for one entity+operation with exactly the field
 * names in `disabledFieldNames` — anything not a real, non-core field in the catalog for this
 * entity/operation is silently ignored (never trusted from the request as-is), so a client
 * can never disable a core field or a field that doesn't exist. */
export async function saveDisabledFields(
  orgId: string,
  entity: string,
  operation: string,
  disabledFieldNames: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const specs = getFieldSpecs(entity, operation);
  if (!specs) return { ok: false, error: "Unknown entity/operation." };

  const validNonCore = new Set(specs.filter((f) => !f.core).map((f) => f.name));
  const toDisable = Array.from(new Set(disabledFieldNames)).filter((f) => validNonCore.has(f));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM api_field_configs WHERE organization_id = $1 AND entity = $2 AND operation = $3`, [
      orgId,
      entity,
      operation,
    ]);
    for (const fieldName of toDisable) {
      await client.query(
        `INSERT INTO api_field_configs (organization_id, entity, operation, field_name) VALUES ($1, $2, $3, $4)`,
        [orgId, entity, operation, fieldName]
      );
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { ok: false, error: "Could not save this configuration." };
  } finally {
    client.release();
  }
}

/**
 * Strips any disabled, non-core field out of a plain object of candidate fields before it
 * reaches the real create/update logic — called from every /api/v1/* POST/PATCH route listed
 * in the catalog above, on whichever slice of the request body carries these field names
 * (e.g. `body.header` for invoices/sales-orders, the top-level body for receipts/customers/
 * vendors/credit-notes). A key someone else knows nothing about this feature: passing a
 * disabled field is never an error, it's simply ignored, exactly as if it had never been sent.
 *
 * Only touches keys that are actually part of this entity/operation's catalog (core or not) —
 * anything else on the object (structural fields like `lines`, `taxPercent` on documents, or
 * fields this catalog doesn't know about) passes through completely untouched, since this is
 * a payload-shape restriction over the catalog's own optional fields, not a general allowlist.
 */
export function filterConfigurableFields<T extends Record<string, unknown>>(
  entity: string,
  operation: string,
  input: T,
  disabledFields: Set<string>
): T {
  const specs = getFieldSpecs(entity, operation);
  if (!specs || disabledFields.size === 0) return input;
  const catalogNames = new Set(specs.map((f) => f.name));
  const out: Record<string, unknown> = { ...input };
  for (const name of catalogNames) {
    if (disabledFields.has(name) && name in out) {
      delete out[name];
    }
  }
  return out as T;
}
