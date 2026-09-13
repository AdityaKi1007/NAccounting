// Column catalog for the bulk Excel import feature ("Import" nav item, placed right after
// Documents — see src/lib/nav.ts). One config per importable object type: Invoices, Sales
// Orders, Receipts, Customers, Vendors — exactly the five objects named in the feature
// request. Each column maps one Excel header to one field on the underlying create call
// (createRow for Customers/Vendors, createDocument for Invoices/Sales Orders, createReceipt
// for Receipts — the exact same functions the app's own UI forms already go through, so an
// imported record is indistinguishable from one entered by hand).
//
// Per the account owner's explicit choice (AskUserQuestion, 2026-09-13): Invoices and Sales
// Orders take "one line per row" — each spreadsheet row is one whole document with a single
// line item (Item Description/Quantity/Rate columns on that same row), not a separate
// header/lines sheet pair. Relations (Customer, Project, Unit, Bank Account) are resolved by
// name, case-insensitively, scoped to the importing org — see resolveRelation in importer.ts.
// A name that doesn't resolve (not found, or ambiguous) fails just that row; the row is
// still recorded (with the reason) in the persistent import_log_rows table, never silently
// dropped — see the "log failed records" requirement from the same clarification round.

export type ImportFieldKind = "text" | "number" | "currency" | "date" | "boolean" | "select";

export interface ImportRelation {
  /** DB table to resolve the name against. */
  table: string;
  /** Column on that table holding the human-readable name to match. */
  labelColumn: string;
  /** Human label used in error messages, e.g. "Project". */
  entityLabel: string;
}

export interface ImportColumn {
  /** Excel header text (also the template's header cell and example-row source). */
  header: string;
  /** Internal field name this column feeds — a header/line/root field depending on `scope`. */
  field: string;
  kind: ImportFieldKind;
  required?: boolean;
  /** Where this value goes: a document header field, the single synthesized line item, or a
   *  top-level field (customers/vendors/receipts have no separate header/line split). */
  scope?: "line";
  /** Present only for a name-lookup column; on success the resolved id is written to
   *  `targetField` instead of `field` itself (e.g. field "customer_name" -> targetField
   *  "customer_id"). */
  relation?: ImportRelation;
  targetField?: string;
  /** Allowed values for a "select" column — `label` is what the template/help text shows,
   *  `value` is the underlying stored value (e.g. "Due on Receipt" -> "due_on_receipt"). A
   *  cell is matched against either the label or the value, case-insensitively. */
  options?: { label: string; value: string }[];
  /** Value substituted when the cell is blank. Required for booleans, since createRow's
   *  coerceValue() turns a blank boolean into `false` regardless of the entity's own default
   *  (a pre-existing quirk in src/lib/crud.ts) — the importer must supply the entity's real
   *  default explicitly to match what the in-app "New" form would have produced. */
  defaultValue?: string | number | boolean;
  example?: string | number | boolean;
}

export interface ImportEntityConfig {
  key: "customers" | "vendors" | "invoices" | "sales-orders" | "receipts";
  label: string;
  /** Underlying entities.ts / createRow key, when this object is a flat entity. Absent for
   *  invoices/sales-orders (documents) and receipts (their own dedicated create function). */
  entityKey?: string;
  columns: ImportColumn[];
}

const CUSTOMER_COLUMNS: ImportColumn[] = [
  { header: "Display Name", field: "display_name", kind: "text", required: true, example: "Acme Trading LLC" },
  {
    header: "Customer Type",
    field: "customer_type",
    kind: "select",
    options: [
      { label: "Business", value: "business" },
      { label: "Individual", value: "individual" },
    ],
    defaultValue: "business",
    example: "Business",
  },
  { header: "Company Name", field: "company_name", kind: "text", example: "Acme Trading LLC" },
  { header: "First Name", field: "first_name", kind: "text", example: "John" },
  { header: "Last Name", field: "last_name", kind: "text", example: "Doe" },
  { header: "Email", field: "email", kind: "text", example: "billing@acme.com" },
  { header: "Work Phone", field: "work_phone", kind: "text", example: "+971 4 000 0000" },
  { header: "Mobile", field: "mobile", kind: "text", example: "+971 50 000 0000" },
  { header: "Currency", field: "currency", kind: "text", defaultValue: "AED", example: "AED" },
  { header: "Opening Balance", field: "opening_balance", kind: "currency", defaultValue: 0, example: 0 },
  {
    header: "Payment Terms",
    field: "payment_terms",
    kind: "select",
    options: [
      { label: "Due on Receipt", value: "due_on_receipt" },
      { label: "Net 15", value: "net_15" },
      { label: "Net 30", value: "net_30" },
      { label: "Net 45", value: "net_45" },
      { label: "Net 60", value: "net_60" },
    ],
    defaultValue: "due_on_receipt",
    example: "Due on Receipt",
  },
  { header: "Billing Address", field: "billing_address", kind: "text", example: "" },
  { header: "Shipping Address", field: "shipping_address", kind: "text", example: "" },
  { header: "Remarks", field: "remarks", kind: "text", example: "" },
  { header: "Active (Yes/No)", field: "is_active", kind: "boolean", defaultValue: true, example: "Yes" },
];

const VENDOR_COLUMNS: ImportColumn[] = [
  { header: "Display Name", field: "display_name", kind: "text", required: true, example: "Gulf Supplies Co." },
  { header: "Company Name", field: "company_name", kind: "text", example: "Gulf Supplies Co." },
  { header: "Email", field: "email", kind: "text", example: "accounts@gulfsupplies.com" },
  { header: "Phone", field: "phone", kind: "text", example: "+971 4 111 1111" },
  { header: "Billing Address", field: "billing_address", kind: "text", example: "" },
  { header: "Currency", field: "currency", kind: "text", defaultValue: "AED", example: "AED" },
  { header: "Opening Balance", field: "opening_balance", kind: "currency", defaultValue: 0, example: 0 },
  { header: "Active (Yes/No)", field: "is_active", kind: "boolean", defaultValue: true, example: "Yes" },
];

const INVOICE_COLUMNS: ImportColumn[] = [
  {
    header: "Customer Name",
    field: "customer_name",
    kind: "text",
    required: true,
    relation: { table: "customers", labelColumn: "display_name", entityLabel: "Customer" },
    targetField: "customer_id",
    example: "Acme Trading LLC",
  },
  { header: "Invoice Number", field: "invoice_number", kind: "text", example: "" },
  { header: "Invoice Date", field: "invoice_date", kind: "date", example: "2026-09-01" },
  { header: "Due Date", field: "due_date", kind: "date", example: "2026-09-30" },
  {
    header: "Status",
    field: "status",
    kind: "select",
    options: [
      { label: "Draft", value: "draft" },
      { label: "Sent", value: "sent" },
      { label: "Overdue", value: "overdue" },
      { label: "Void", value: "void" },
    ],
    defaultValue: "draft",
    example: "Draft",
  },
  { header: "Salesperson", field: "salesperson", kind: "text", example: "" },
  { header: "Notes", field: "notes", kind: "text", example: "" },
  {
    header: "Project Name",
    field: "project_name",
    kind: "text",
    relation: { table: "projects", labelColumn: "name", entityLabel: "Project" },
    targetField: "project_id",
    example: "",
  },
  {
    header: "Unit Name",
    field: "unit_name",
    kind: "text",
    relation: { table: "inventory", labelColumn: "name", entityLabel: "Unit" },
    targetField: "unit_id",
    example: "",
  },
  { header: "Item Description", field: "description", kind: "text", required: true, scope: "line", example: "Consulting services" },
  { header: "Quantity", field: "quantity", kind: "number", required: true, scope: "line", defaultValue: 1, example: 1 },
  { header: "Rate", field: "rate", kind: "currency", required: true, scope: "line", example: 1000 },
  { header: "Tax Percent", field: "taxPercent", kind: "number", defaultValue: 0, example: 0 },
];

const SALES_ORDER_COLUMNS: ImportColumn[] = [
  {
    header: "Customer Name",
    field: "customer_name",
    kind: "text",
    required: true,
    relation: { table: "customers", labelColumn: "display_name", entityLabel: "Customer" },
    targetField: "customer_id",
    example: "Acme Trading LLC",
  },
  { header: "Sales Order Number", field: "so_number", kind: "text", example: "" },
  { header: "Order Date", field: "order_date", kind: "date", example: "2026-09-01" },
  { header: "Expected Shipment Date", field: "shipment_date", kind: "date", example: "2026-09-10" },
  { header: "Reference Number", field: "reference_number", kind: "text", example: "" },
  { header: "Payment Terms", field: "payment_terms", kind: "text", example: "Due on Receipt" },
  { header: "Delivery Method", field: "delivery_method", kind: "text", example: "" },
  { header: "Salesperson", field: "salesperson", kind: "text", example: "" },
  {
    header: "Status",
    field: "status",
    kind: "select",
    options: [
      { label: "Draft", value: "draft" },
      { label: "Confirmed", value: "confirmed" },
      { label: "Closed", value: "closed" },
      { label: "Void", value: "void" },
    ],
    defaultValue: "draft",
    example: "Draft",
  },
  { header: "Notes", field: "notes", kind: "text", example: "" },
  { header: "Terms & Conditions", field: "terms_conditions", kind: "text", example: "" },
  {
    header: "Project Name",
    field: "project_name",
    kind: "text",
    relation: { table: "projects", labelColumn: "name", entityLabel: "Project" },
    targetField: "project_id",
    example: "",
  },
  {
    header: "Unit Name",
    field: "unit_name",
    kind: "text",
    relation: { table: "inventory", labelColumn: "name", entityLabel: "Unit" },
    targetField: "unit_id",
    example: "",
  },
  { header: "Item Description", field: "description", kind: "text", required: true, scope: "line", example: "Consulting services" },
  { header: "Quantity", field: "quantity", kind: "number", required: true, scope: "line", defaultValue: 1, example: 1 },
  { header: "Rate", field: "rate", kind: "currency", required: true, scope: "line", example: 1000 },
  { header: "Tax Percent", field: "taxPercent", kind: "number", defaultValue: 0, example: 0 },
];

const RECEIPT_COLUMNS: ImportColumn[] = [
  {
    header: "Customer Name",
    field: "customer_name",
    kind: "text",
    required: true,
    relation: { table: "customers", labelColumn: "display_name", entityLabel: "Customer" },
    targetField: "customer_id",
    example: "Acme Trading LLC",
  },
  { header: "Amount", field: "amount", kind: "currency", required: true, example: 1000 },
  {
    header: "Deposit To (Bank Account)",
    field: "bank_account_name",
    kind: "text",
    required: true,
    relation: { table: "bank_accounts", labelColumn: "account_name", entityLabel: "Bank Account" },
    targetField: "bank_account_id",
    example: "Main Bank Account",
  },
  { header: "Payment Number", field: "payment_number", kind: "text", example: "" },
  { header: "Payment Date", field: "payment_date", kind: "date", example: "2026-09-01" },
  { header: "Payment Mode", field: "payment_mode", kind: "text", example: "Bank Transfer" },
  { header: "Bank Charges", field: "bank_charges", kind: "currency", defaultValue: 0, example: 0 },
  { header: "Reference Number", field: "reference_number", kind: "text", example: "" },
  { header: "Notes", field: "notes", kind: "text", example: "" },
  {
    header: "Status",
    field: "status",
    kind: "select",
    options: [
      { label: "Paid", value: "paid" },
      { label: "Draft", value: "draft" },
    ],
    defaultValue: "paid",
    example: "Paid",
  },
  {
    header: "Project Name",
    field: "project_name",
    kind: "text",
    relation: { table: "projects", labelColumn: "name", entityLabel: "Project" },
    targetField: "project_id",
    example: "",
  },
  {
    header: "Unit Name",
    field: "unit_name",
    kind: "text",
    relation: { table: "inventory", labelColumn: "name", entityLabel: "Unit" },
    targetField: "unit_id",
    example: "",
  },
];

export const IMPORT_CATALOG: Record<string, ImportEntityConfig> = {
  customers: { key: "customers", label: "Customers", entityKey: "customers", columns: CUSTOMER_COLUMNS },
  vendors: { key: "vendors", label: "Vendors", entityKey: "vendors", columns: VENDOR_COLUMNS },
  invoices: { key: "invoices", label: "Invoices", columns: INVOICE_COLUMNS },
  "sales-orders": { key: "sales-orders", label: "Sales Orders", columns: SALES_ORDER_COLUMNS },
  receipts: { key: "receipts", label: "Receipts", columns: RECEIPT_COLUMNS },
};

export const IMPORT_ENTITY_ORDER = ["invoices", "customers", "receipts", "sales-orders", "vendors"] as const;

export function getImportConfig(entity: string): ImportEntityConfig | undefined {
  return IMPORT_CATALOG[entity];
}
