import { COUNTRIES } from "@/lib/countries";

// Central registry describing every "flat" (single-table, no line items) entity in the
// system. Driving CRUD off this metadata means one generic list page, one generic
// create/edit form, and one generic API route implementation serve every module.

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "boolean"
  | "email";

export interface SelectOption {
  label: string;
  value: string;
  group?: string; // renders as an <optgroup> when consecutive options share a group
}

export interface FieldDef {
  name: string; // column name
  label: string;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[]; // static options (type=select)
  refEntity?: string; // dynamic options sourced from another entity's rows (a key in the entities registry)
  refLabelField?: string; // which field of the ref entity to show as the label
  default?: string | number | boolean;
  showInList?: boolean;
  placeholder?: string;
  helpText?: string;
  /** Skip DataTable's automatic "refEntity fields link to their record" behavior for this
   * field. Needed for the organizations refEntity special-case (see crud.ts's loadRefOptions)
   * since there's no generic /organizations/[id] detail route to link to. */
  noLink?: boolean;
  /** Overrides DataTable's default "Active"/"Inactive" pill text for a boolean column whose
   * true/false states aren't actually an active/inactive distinction (e.g. tax-rates'
   * is_default — "Default"/"—"). */
  booleanLabels?: { true: string; false: string };
  /** Overrides this field's list-column header, when the natural form label (e.g. "Parent
   * Account") reads better in an edit form than the fuller header a list column wants (e.g.
   * "Parent Account Name" — matches Zoho Books' own Chart of Accounts list). Falls back to
   * `label` when unset, same as every other field always did before this existed. */
  listLabel?: string;
}

export interface EntityDef {
  key: string; // url slug, also registry key
  table: string; // postgres table
  label: string;
  labelPlural: string;
  module: string;
  fields: FieldDef[];
  listColumns: string[]; // subset of field names + "created_at"
  titleField: string;
  orderBy?: string;
  kind: "flat" | "document" | "journal" | "customer" | "payment" | "sales_order";
  numberField?: string; // e.g. invoice_number, auto-generated
  numberPrefix?: string;
  /** Row's titleField links to a read-only /[key]/[id] detail page instead of the edit
   * form directly; editing moves to /[key]/[id]/edit. See src/lib/accounts.ts for the
   * one place this is used so far (chart-of-accounts). */
  hasDetailView?: boolean;
  /** Renders a file-upload/attachments panel (see src/components/attachments/AttachmentsField.tsx)
   * in the generic EntityForm — used for entities whose create/edit form IS the generic
   * form (vendors, and payments-received's edit form). Entities with a bespoke dedicated
   * form component (customers, sales-orders, payments-received's own create form) render
   * AttachmentsField directly in that component instead and don't need this flag. */
  attachments?: boolean;
  /** No generic "+ New" button, no generic row-level Edit/Delete actions, and the generic
   * /api/entities/[entity] CRUD routes refuse to touch this table at all (see the explicit
   * check in those routes). Use for a table whose every write has side effects (a balance to
   * keep in sync, a GL journal to post) that only a bespoke, transactional endpoint knows how
   * to apply correctly — credit-notes/debit-notes are the first case: they're only ever
   * created from an invoice (POST /api/invoices/[id]/credit-notes|debit-notes) and only ever
   * reversed via their own /void endpoint, never edited or deleted directly. */
  restrictedCrud?: boolean;
  /** When true, only owner/admin/Super-Admin members may create, edit or delete rows of this
   * entity through the generic /api/entities routes (enforced server-side in route.ts and
   * [id]/route.ts, not just by hiding the UI — see the "roles" entity, added for the Access
   * Matrix feature, 2026-09-14). Reads are unrestricted; the settings page itself is what
   * actually keeps ordinary staff from finding the screen in the first place. */
  adminOnly?: boolean;
  /** Overrides the list page's "+ New" button target for an entity that's restrictedCrud
   * (so the generic `/${key}/new` route, which wouldn't work anyway, is never used) but that
   * still has a real, working creation flow reachable through a bespoke entry point — e.g.
   * Credit Notes' "+ New" button, which needs to send the user to pick a customer + invoice
   * first (see src/app/(app)/credit-notes/new/page.tsx) rather than create one out of thin
   * air, since a credit note only ever exists against a specific invoice. */
  customNewHref?: string;
  /** Renders the title column as plain, unlinked text instead of the usual title-links-to-
   * edit-or-detail-page behavior (see DataTable.tsx's title-column rendering) — for an
   * entity where the row's own edit action (the pencil icon) is the intended way to open the
   * record, and clicking the name itself should do nothing. First used for Units
   * (`inventory`): its Building/Project refEntity columns are already clickable links to
   * those parents' own detail pages, and the user found a plain click on the Unit Name
   * itself opening the edit form to be unexpected/unwanted. */
  disableTitleLink?: boolean;
}

// Zoho Books' full Account Type list, grouped exactly as its own dropdown groups them.
// Values are the detailed type itself (not a coarse asset/liability/... bucket) — see
// src/lib/accounts.ts for how a detailed type maps back to its top-level category for
// balance-sign and grouping purposes.
export const ACCOUNT_TYPE_OPTIONS: SelectOption[] = [
  { group: "Asset", label: "Other Asset", value: "other_asset" },
  { group: "Asset", label: "Other Current Asset", value: "other_current_asset" },
  { group: "Asset", label: "Cash", value: "cash" },
  { group: "Asset", label: "Bank", value: "bank" },
  { group: "Asset", label: "Fixed Asset", value: "fixed_asset" },
  { group: "Asset", label: "Accounts Receivable", value: "accounts_receivable" },
  { group: "Asset", label: "Stock", value: "stock" },
  { group: "Asset", label: "Payment Clearing Account", value: "payment_clearing_account" },
  { group: "Asset", label: "Intangible Asset", value: "intangible_asset" },
  { group: "Asset", label: "Non Current Asset", value: "non_current_asset" },
  { group: "Asset", label: "Deferred Tax Asset", value: "deferred_tax_asset" },
  { group: "Asset", label: "Capital Work In Progress", value: "capital_work_in_progress" },
  { group: "Asset", label: "Intangible Assets Under Development", value: "intangible_assets_under_development" },

  { group: "Liability", label: "Other Current Liability", value: "other_current_liability" },
  { group: "Liability", label: "Credit Card", value: "credit_card" },
  { group: "Liability", label: "Non Current Liability", value: "non_current_liability" },
  { group: "Liability", label: "Other Liability", value: "other_liability" },
  { group: "Liability", label: "Accounts Payable", value: "accounts_payable" },
  { group: "Liability", label: "Deferred Tax Liability", value: "deferred_tax_liability" },

  { group: "Equity", label: "Equity", value: "equity" },

  { group: "Income", label: "Income", value: "income" },
  { group: "Income", label: "Other Income", value: "other_income" },

  { group: "Expense", label: "Expense", value: "expense" },
  { group: "Expense", label: "Cost Of Goods Sold", value: "cost_of_goods_sold" },
  { group: "Expense", label: "Other Expense", value: "other_expense" },
];

const currency: SelectOption[] = [
  { label: "AED - UAE Dirham", value: "AED" },
  { label: "USD - US Dollar", value: "USD" },
  { label: "EUR - Euro", value: "EUR" },
  { label: "GBP - British Pound", value: "GBP" },
  { label: "INR - Indian Rupee", value: "INR" },
];

// Same country list used by Company Profile / New Organization, reused here so a Project's
// Country field offers the exact same options.
const COUNTRY_OPTIONS: SelectOption[] = COUNTRIES.map((c) => ({ label: c, value: c }));

export const entities: Record<string, EntityDef> = {
  items: {
    key: "items",
    table: "items",
    label: "Item",
    labelPlural: "Items",
    module: "Items",
    kind: "flat",
    titleField: "name",
    orderBy: "created_at desc",
    listColumns: ["name", "sku", "type", "sales_price", "purchase_price", "is_active"],
    fields: [
      { name: "name", label: "Item Name", type: "text", required: true },
      { name: "sku", label: "SKU", type: "text" },
      {
        name: "type",
        label: "Type",
        type: "select",
        default: "goods",
        options: [
          { label: "Goods", value: "goods" },
          { label: "Service", value: "service" },
        ],
      },
      { name: "unit", label: "Unit", type: "text", placeholder: "pcs, hrs, kg..." },
      { name: "sales_price", label: "Selling Price", type: "currency", default: 0 },
      { name: "purchase_price", label: "Cost Price", type: "currency", default: 0 },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  customers: {
    key: "customers",
    table: "customers",
    label: "Customer",
    labelPlural: "Customers",
    module: "Sales",
    kind: "customer",
    titleField: "display_name",
    orderBy: "created_at desc",
    // Read-only detail view (contact info, address, receivables, income chart, recent
    // transactions) instead of going straight to the edit form — see
    // src/app/(app)/customers/[id]/page.tsx. Editing moves to /customers/[id]/edit.
    hasDetailView: true,
    listColumns: ["display_name", "company_name", "email", "work_phone", "currency", "is_active"],
    fields: [
      { name: "customer_type", label: "Customer Type", type: "select", default: "business", options: [
        { label: "Business", value: "business" },
        { label: "Individual", value: "individual" },
      ] },
      { name: "salutation", label: "Salutation", type: "text" },
      { name: "first_name", label: "First Name", type: "text" },
      { name: "last_name", label: "Last Name", type: "text" },
      { name: "company_name", label: "Company Name", type: "text" },
      { name: "display_name", label: "Display Name", type: "text", required: true },
      { name: "secondary_display_name", label: "Display Name (Arabic)", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "work_phone", label: "Work Phone", type: "text" },
      { name: "mobile", label: "Mobile", type: "text" },
      { name: "language", label: "Customer Language", type: "select", default: "English", options: [
        { label: "English", value: "English" },
        { label: "Arabic", value: "Arabic" },
      ] },
      { name: "currency", label: "Currency", type: "select", options: currency, default: "AED" },
      { name: "accounts_receivable_account_id", label: "Accounts Receivable", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      { name: "opening_balance", label: "Opening Balance", type: "currency", default: 0 },
      { name: "payment_terms", label: "Payment Terms", type: "select", default: "due_on_receipt", options: [
        { label: "Due on Receipt", value: "due_on_receipt" },
        { label: "Net 15", value: "net_15" },
        { label: "Net 30", value: "net_30" },
        { label: "Net 45", value: "net_45" },
        { label: "Net 60", value: "net_60" },
      ] },
      { name: "portal_enabled", label: "Allow portal access for this customer", type: "boolean", default: false },
      { name: "billing_address", label: "Billing Address", type: "textarea" },
      { name: "shipping_address", label: "Shipping Address", type: "textarea" },
      { name: "remarks", label: "Remarks", type: "textarea" },
      // External CRM system's own reference number for this customer
      // (migrations/1776000000000_crm_reference_numbers.js) — free text, no uniqueness check.
      // This entry is what the v1 API's crud.ts-based create/update path reads; the app UI's
      // own bespoke create/edit form goes through customers.ts's HEADER_COLUMNS instead (see
      // that file), so this field had to be added there too.
      { name: "crm_customer_no", label: "CRM Customer No", type: "text" },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  "pricing-engine": {
    key: "pricing-engine",
    table: "price_lists",
    label: "Price List",
    labelPlural: "Pricing Engine",
    module: "Items",
    kind: "flat",
    titleField: "name",
    orderBy: "created_at desc",
    listColumns: ["name", "transaction_type", "price_list_type", "percentage_type", "percentage_value", "is_active"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "transaction_type",
        label: "Transaction Type",
        type: "select",
        default: "sales",
        required: true,
        options: [
          { label: "Sales", value: "sales" },
          { label: "Purchase", value: "purchase" },
        ],
      },
      {
        name: "price_list_type",
        label: "Price List Type",
        type: "select",
        default: "all_items",
        required: true,
        options: [
          { label: "All Items", value: "all_items" },
          { label: "Individual Items", value: "individual_items" },
        ],
      },
      { name: "description", label: "Description", type: "textarea" },
      {
        name: "percentage_type",
        label: "Adjustment",
        type: "select",
        default: "markup",
        required: true,
        options: [
          { label: "Markup", value: "markup" },
          { label: "Markdown", value: "markdown" },
        ],
      },
      { name: "percentage_value", label: "Percentage", type: "number", required: true, default: 0 },
      {
        name: "round_off_to",
        label: "Round Off To",
        type: "select",
        default: "never_mind",
        required: true,
        options: [
          { label: "Never Mind", value: "never_mind" },
          { label: "Nearest 1.00", value: "1.00" },
          { label: "Nearest 0.50", value: "0.50" },
          { label: "Nearest 0.10", value: "0.10" },
          { label: "Nearest 0.05", value: "0.05" },
          { label: "Nearest 0.01", value: "0.01" },
        ],
      },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  quotes: {
    key: "quotes",
    table: "quotes",
    label: "Quote",
    labelPlural: "Quotes",
    module: "Sales",
    kind: "document",
    titleField: "quote_number",
    numberField: "quote_number",
    numberPrefix: "QT",
    orderBy: "created_at desc",
    listColumns: ["quote_number", "customer_id", "quote_date", "status", "total"],
    fields: [
      { name: "quote_number", label: "Quote #", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "quote_date", label: "Quote Date", type: "date", default: "" },
      { name: "expiry_date", label: "Expiry Date", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Sent", value: "sent" },
          { label: "Accepted", value: "accepted" },
          { label: "Declined", value: "declined" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "sales-orders": {
    key: "sales-orders",
    table: "sales_orders",
    label: "Sales Order",
    labelPlural: "Sales Orders",
    module: "Sales",
    // Rich dedicated form matching Zoho's real Sales Order screen (reference #, payment
    // terms, delivery method, salesperson, per-line discount) — see SalesOrderFormPage /
    // SalesOrderForm, wired in via this "sales_order" kind in the generic [slug] new/edit
    // routes, same pattern as "payment" already uses for Record Payment.
    kind: "sales_order",
    titleField: "so_number",
    numberField: "so_number",
    numberPrefix: "SO",
    // The SO# links to a read-only, print/PDF-styled detail page instead of straight to
    // editing — see src/app/(app)/sales-orders/[id]/page.tsx (a literal route, so it wins
    // over the generic [slug]/[id] one above regardless of "kind").
    hasDetailView: true,
    orderBy: "created_at desc",
    listColumns: ["so_number", "customer_id", "unit_id", "order_date", "shipment_date", "status", "total"],
    fields: [
      { name: "so_number", label: "Sales Order #", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "reference_number", label: "Reference #", type: "text" },
      { name: "order_date", label: "Sales Order Date", type: "date", default: "" },
      { name: "shipment_date", label: "Expected Shipment Date", type: "date" },
      { name: "payment_terms", label: "Payment Terms", type: "text" },
      { name: "delivery_method", label: "Delivery Method", type: "text" },
      { name: "salesperson", label: "Salesperson", type: "text" },
      // Optional Property Master tags (same pattern/reasoning as invoices.project_id/unit_id
      // above) — SalesOrderForm.tsx (the real edit form for this "sales_order" kind) never
      // reads entity.fields at all, so these entries exist purely so the generic list/detail
      // machinery (DataTable's refEntity auto-link, loadRefOptions) can resolve+show them.
      // "unit_id" is in listColumns per the user's own request; "project_id" is left off the
      // (already busy) list, same restraint already applied to invoices' own project_id.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "unit_id", label: "Unit", type: "select", refEntity: "inventory", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Confirmed", value: "confirmed" },
          { label: "Closed", value: "closed" },
          { label: "Void", value: "void" },
        ],
      },
      { name: "notes", label: "Customer Notes", type: "textarea" },
      { name: "terms_conditions", label: "Terms & Conditions", type: "textarea" },
      // External CRM system's own reference number for this sales order
      // (migrations/1776000000000_crm_reference_numbers.js) — same "exists only for generic
      // list/detail machinery" reasoning as project_id/unit_id above; SalesOrderForm.tsx is
      // where this is actually entered.
      { name: "crm_so_no", label: "CRM SO No", type: "text" },
      // Display-only metadata for the list view — SalesOrderForm.tsx (the real edit form for
      // this "sales_order" kind) never reads entity.fields at all, so this can't leak into
      // any form. Without it, DataTable's renderCell has no type info for the "total" list
      // column and falls back to a plain unformatted number (e.g. "370" instead of "AED370.00").
      { name: "total", label: "Total", type: "currency" },
    ],
  },

  invoices: {
    key: "invoices",
    table: "invoices",
    label: "Invoice",
    labelPlural: "Invoices",
    module: "Sales",
    kind: "document",
    titleField: "invoice_number",
    numberField: "invoice_number",
    numberPrefix: "INV",
    orderBy: "created_at desc",
    // The invoice number links to a read-only, print/PDF-styled detail view instead of
    // straight to editing — see src/app/(app)/invoices/[id]/page.tsx.
    hasDetailView: true,
    listColumns: ["invoice_number", "sales_order_id", "customer_id", "invoice_date", "due_date", "status", "total", "balance_due"],
    fields: [
      { name: "invoice_number", label: "Invoice #", type: "text", required: true },
      // Set automatically when this invoice was created via a Sales Order's "Convert to
      // Invoice" action (see /api/sales-orders/[id]/convert-to-invoice/route.ts) — never
      // user-editable, so it's absent from DocumentForm.tsx's own field set entirely; this
      // entry exists purely so the list/detail views can resolve+show it. noLink because
      // Sales Orders' own detail page isn't reached through this generic mechanism here —
      // matches Zoho's own Order Number column, which is plain text, not a link.
      { name: "sales_order_id", label: "Order Number", type: "select", refEntity: "sales-orders", refLabelField: "so_number", noLink: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "invoice_date", label: "Invoice Date", type: "date" },
      { name: "due_date", label: "Due Date", type: "date" },
      // Optional Property Master tags (see chart-of-accounts' own project_id for the same
      // pattern) — surfaced by DocumentForm.tsx directly (gated on cfg.key === "invoices"),
      // same as salesperson/sales_order_id above; these two entries exist mainly so the
      // generic list/detail machinery can resolve+show them if ever added to listColumns.
      // Deliberately NOT in listColumns for now — kept off the (already busy) Invoices list.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "unit_id", label: "Unit", type: "select", refEntity: "inventory", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        // Paid / Partially Paid are deliberately NOT selectable here — they must only ever
        // be set by the actual payment-allocation flow (see receipts-api.ts), never hand-picked.
        // A user could otherwise mark an invoice "Paid" with zero real payments recorded
        // against it, which is exactly the bug report this fixed: an invoice showing Paid
        // with an empty Payments Received panel, because nothing ever created the link. The
        // API-side createDocument/updateDocument in documents-api.ts also rejects these two
        // values for invoices, so this isn't just a UI-level restriction.
        helpText: "Paid / Partially Paid are set automatically when a payment is recorded.",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Sent", value: "sent" },
          { label: "Overdue", value: "overdue" },
          { label: "Void", value: "void" },
        ],
      },
      { name: "salesperson", label: "Salesperson", type: "text" },
      // External CRM system's own reference number for this invoice
      // (migrations/1776000000000_crm_reference_numbers.js) — surfaced by DocumentForm.tsx
      // directly (gated on cfg.key === "invoices"), same as salesperson/project_id/unit_id
      // above; this entry exists so the generic list/detail machinery can resolve+show it.
      { name: "crm_inv_no", label: "CRM Inv No", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
      // Display-only metadata for the list view, same reasoning as sales-orders' "total"
      // entry above — DocumentForm.tsx never reads entity.fields, so this is invisible to
      // editing; without it these two list columns rendered as plain unformatted numbers.
      { name: "total", label: "Total", type: "currency" },
      { name: "balance_due", label: "Balance Due", type: "currency" },
    ],
  },

  "recurring-invoices": {
    key: "recurring-invoices",
    table: "recurring_invoices",
    label: "Repeat Invoice",
    labelPlural: "Repeat Invoices",
    module: "Sales",
    kind: "flat",
    titleField: "profile_name",
    orderBy: "created_at desc",
    listColumns: ["profile_name", "customer_id", "frequency", "next_invoice_date", "amount", "status"],
    fields: [
      { name: "profile_name", label: "Profile Name", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      {
        name: "frequency",
        label: "Repeat Every",
        type: "select",
        default: "monthly",
        options: [
          { label: "Weekly", value: "weekly" },
          { label: "Monthly", value: "monthly" },
          { label: "Quarterly", value: "quarterly" },
          { label: "Yearly", value: "yearly" },
        ],
      },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "end_date", label: "End Date", type: "date" },
      { name: "next_invoice_date", label: "Next Invoice Date", type: "date" },
      { name: "amount", label: "Amount", type: "currency", default: 0 },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "active",
        options: [
          { label: "Active", value: "active" },
          { label: "Stopped", value: "stopped" },
        ],
      },
    ],
  },

  "delivery-challans": {
    key: "delivery-challans",
    table: "delivery_challans",
    label: "Delivery Challan",
    labelPlural: "Delivery Challans",
    module: "Sales",
    kind: "flat",
    titleField: "challan_number",
    numberField: "challan_number",
    numberPrefix: "DC",
    orderBy: "created_at desc",
    listColumns: ["challan_number", "customer_id", "challan_date", "reason", "status"],
    fields: [
      { name: "challan_number", label: "Challan #", type: "text", placeholder: "Auto-generated if left blank" },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      // required: the DB column is NOT NULL and this generic flat form has no server-side
      // fallback (unlike documents-api.ts, which defaults a missing date to today) — leaving
      // it optional here let a blank submission 500 instead of showing a clear validation
      // message. Found and fixed while testing the Transaction Number Series page.
      { name: "challan_date", label: "Challan Date", type: "date", required: true },
      {
        name: "reason",
        label: "Reason for Delivery",
        type: "select",
        default: "supply_of_goods",
        options: [
          { label: "Supply of Goods", value: "supply_of_goods" },
          { label: "Job Work", value: "job_work" },
          { label: "Others", value: "others" },
        ],
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Delivered", value: "delivered" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "payments-received": {
    key: "payments-received",
    table: "payments_received",
    label: "Payment Received",
    labelPlural: "Payments Received",
    module: "Sales",
    // "payment" gets a dedicated Record Payment form (search-to-select customer, a live
    // Unpaid Invoices table with per-invoice allocation) instead of the generic flat form —
    // see RecordPaymentFormPage / RecordPaymentForm. Editing an existing payment still uses
    // the generic form below (allocations aren't editable there; see the module's notes).
    kind: "payment",
    titleField: "payment_number",
    numberField: "payment_number",
    numberPrefix: "PMT",
    orderBy: "created_at desc",
    // Read-only detail view (allocations + the auto-generated Journal) — see
    // src/app/(app)/payments-received/[id]/page.tsx.
    hasDetailView: true,
    // Editing a payment uses the generic EntityForm (see the "kind" comment above), so this
    // flag is what makes that form render AttachmentsField here. Creating one still goes
    // through RecordPaymentForm.tsx, which renders it directly — see that file.
    attachments: true,
    listColumns: ["payment_number", "customer_id", "payment_date", "amount", "payment_mode", "status"],
    fields: [
      { name: "payment_number", label: "Payment #", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "invoice_id", label: "Against Invoice", type: "select", refEntity: "invoices", refLabelField: "invoice_number" },
      // required — the DB column is NOT NULL; create normally goes through RecordPaymentForm
      // (which always sends today's date), but this same field/validation also governs
      // editing an existing payment via the generic form, so it still needs to be guarded.
      { name: "payment_date", label: "Payment Date", type: "date", required: true },
      { name: "amount", label: "Amount Received", type: "currency", required: true, default: 0 },
      { name: "bank_charges", label: "Bank Charges", type: "currency", default: 0 },
      {
        name: "payment_mode",
        label: "Payment Mode",
        type: "select",
        default: "cash",
        options: [
          { label: "Cash", value: "cash" },
          { label: "Bank Transfer", value: "bank_transfer" },
          { label: "Credit Card", value: "credit_card" },
          { label: "Cheque", value: "cheque" },
        ],
      },
      { name: "bank_account_id", label: "Deposit To", type: "select", refEntity: "bank-accounts", refLabelField: "account_name" },
      { name: "reference_number", label: "Reference #", type: "text" },
      // Optional Property Master tags (same pattern/reasoning as invoices.project_id/unit_id
      // above) — RecordPaymentForm.tsx renders these directly for create; this entry is what
      // makes them show up and save correctly on the generic EntityForm used for editing an
      // existing payment (see the "kind" comment at the top of this entity). Not in
      // listColumns, same decision as Invoices.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "unit_id", label: "Unit", type: "select", refEntity: "inventory", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "paid",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Paid", value: "paid" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
      // External CRM system's own reference number for this receipt
      // (migrations/1776000000000_crm_reference_numbers.js), plain text — used by the
      // generic EntityForm edit path (see the "kind" comment above) and by the v1 API via
      // updateReceiptMeta's explicit whitelist (src/lib/receipts-api.ts). RecordPaymentForm.tsx
      // renders it directly for create.
      { name: "crm_receipt_no", label: "CRM Receipt No", type: "text" },
    ],
  },

  "credit-notes": {
    key: "credit-notes",
    table: "credit_notes",
    label: "Credit Note",
    labelPlural: "Credit Notes",
    module: "Sales",
    kind: "flat",
    titleField: "credit_note_number",
    numberField: "credit_note_number",
    numberPrefix: "CN",
    orderBy: "created_at desc",
    // Always created against a specific invoice — creating one has to adjust that invoice's
    // balance_due and post a GL journal in the same transaction (POST
    // /api/invoices/[id]/credit-notes), so the generic entities API still refuses to create
    // one directly (restrictedCrud). The list page's own "+ New" button is NOT disabled
    // though — customNewHref sends it to /credit-notes/new, a picker (Customer → Invoice)
    // that then forwards into the exact same per-invoice creation flow the invoice's own
    // "..." menu already uses (see src/app/(app)/credit-notes/new/page.tsx). hasDetailView +
    // restrictedCrud still route all further interaction through the bespoke read-only
    // detail view (src/app/(app)/credit-notes/[id]/page.tsx), whose only action is Void
    // (POST /api/credit-notes/[id]/void, itself transactional).
    hasDetailView: true,
    restrictedCrud: true,
    customNewHref: "/credit-notes/new",
    listColumns: ["credit_note_number", "customer_id", "invoice_id", "credit_note_date", "status", "total"],
    fields: [
      { name: "credit_note_number", label: "Credit Note #", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "invoice_id", label: "Invoice", type: "select", refEntity: "invoices", refLabelField: "invoice_number" },
      { name: "credit_note_date", label: "Date", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "open",
        options: [
          { label: "Open", value: "open" },
          { label: "Closed", value: "closed" },
          { label: "Void", value: "void" },
        ],
      },
      { name: "subtotal", label: "Subtotal", type: "currency", default: 0 },
      { name: "tax_total", label: "Tax", type: "currency", default: 0 },
      { name: "total", label: "Total", type: "currency", default: 0 },
      { name: "reference_number", label: "Reference #", type: "text" },
      { name: "reason", label: "Reason", type: "textarea" },
    ],
  },

  "debit-notes": {
    key: "debit-notes",
    table: "debit_notes",
    label: "Debit Note",
    labelPlural: "Debit Notes",
    module: "Sales",
    kind: "flat",
    titleField: "debit_note_number",
    numberField: "debit_note_number",
    numberPrefix: "DN",
    orderBy: "created_at desc",
    // Mirrors credit-notes exactly (see the comment there) — created only from an invoice's
    // "..." menu via POST /api/invoices/[id]/debit-notes, reversed only via its own /void
    // endpoint. A debit note increases the invoice's balance_due (it's additional billing,
    // e.g. correcting an under-charged invoice) rather than reducing it.
    hasDetailView: true,
    restrictedCrud: true,
    listColumns: ["debit_note_number", "customer_id", "invoice_id", "debit_note_date", "status", "total"],
    fields: [
      { name: "debit_note_number", label: "Debit Note #", type: "text", required: true },
      { name: "customer_id", label: "Customer", type: "select", refEntity: "customers", refLabelField: "display_name", required: true },
      { name: "invoice_id", label: "Invoice", type: "select", refEntity: "invoices", refLabelField: "invoice_number" },
      { name: "debit_note_date", label: "Date", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "open",
        options: [
          { label: "Open", value: "open" },
          { label: "Closed", value: "closed" },
          { label: "Void", value: "void" },
        ],
      },
      { name: "subtotal", label: "Subtotal", type: "currency", default: 0 },
      { name: "tax_total", label: "Tax", type: "currency", default: 0 },
      { name: "total", label: "Total", type: "currency", default: 0 },
      { name: "reference_number", label: "Reference #", type: "text" },
      { name: "reason", label: "Reason", type: "textarea" },
    ],
  },

  vendors: {
    key: "vendors",
    table: "vendors",
    label: "Vendor",
    labelPlural: "Vendors",
    module: "Purchases",
    kind: "flat",
    titleField: "display_name",
    orderBy: "created_at desc",
    // Read-only detail view (contact info, attachments, emails, payables, recent
    // transactions) instead of going straight to the edit form — mirrors the Customer detail
    // page (see src/app/(app)/customers/[id]/page.tsx), built when the Send Email feature
    // needed somewhere to show "emails filed under this vendor's profile". See
    // src/app/(app)/vendors/[id]/page.tsx. Editing moves to /vendors/[id]/edit — still the
    // generic EntityForm, no dedicated form (unlike customers).
    hasDetailView: true,
    // Consulted by the generic EntityForm (create AND edit both go through it, unlike
    // customers) — this flag is what makes that form render AttachmentsField here.
    attachments: true,
    listColumns: ["display_name", "company_name", "email", "phone", "currency", "is_active"],
    fields: [
      { name: "display_name", label: "Display Name", type: "text", required: true },
      { name: "company_name", label: "Company Name", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "billing_address", label: "Billing Address", type: "textarea" },
      { name: "currency", label: "Currency", type: "select", options: currency, default: "AED" },
      { name: "opening_balance", label: "Opening Balance", type: "currency", default: 0 },
      // External CRM system's own reference number for this vendor, for orgs syncing to/from
      // an outside CRM (migrations/1776000000000_crm_reference_numbers.js). Free text, no
      // uniqueness constraint — see that migration's own comment for why.
      { name: "crm_vendor_no", label: "CRM Vendor No", type: "text" },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  expenses: {
    key: "expenses",
    table: "expenses",
    label: "Expense",
    labelPlural: "Expenses",
    module: "Purchases",
    kind: "flat",
    // Deliberately NOT account_id/vendor_id — DataTable auto-links every refEntity select
    // column to ITS OWN record already (Expense Account -> chart-of-accounts, Vendor ->
    // vendors), so making one of those the titleField would nest a <Link> for the expense
    // detail page inside the <Link> renderCell() already returns for that ref, which is
    // invalid HTML and ambiguous to click. expense_date is a plain column, so it's the one
    // that opens /expenses/[id] (or used to be reference_number, but that isn't even in
    // listColumns below, so nothing was ever clickable before this fix).
    titleField: "expense_date",
    // Read-only detail view (Journal tab, Paid Through/Paid To, tax fields, receipts) instead
    // of going straight to the edit form — see src/app/(app)/expenses/[id]/page.tsx, same
    // pattern as Vendors/Customers. Editing moves to /expenses/[id]/edit. Both the create and
    // edit routes render a bespoke ExpenseForm (not the generic EntityForm) because of the
    // tax-rate -> tax_amount computation and the screenshot-specific field grouping — see
    // src/components/expenses/ExpenseForm.tsx.
    hasDetailView: true,
    attachments: true,
    orderBy: "created_at desc",
    listColumns: ["expense_date", "vendor_id", "account_id", "amount", "tax_amount"],
    fields: [
      { name: "expense_date", label: "Expense Date", type: "date" },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name" },
      { name: "account_id", label: "Expense Account", type: "select", refEntity: "chart-of-accounts", refLabelField: "name", required: true },
      // Required — same reasoning as Payments Made's "Paid Through" above: no account to
      // credit means syncExpenseJournal can't post a balanced entry at all.
      { name: "paid_through_account_id", label: "Paid Through", type: "select", refEntity: "bank-accounts", refLabelField: "account_name", required: true },
      { name: "amount", label: "Amount", type: "currency", required: true, default: 0 },
      { name: "tax_amount", label: "Tax Amount", type: "currency", default: 0 },
      // Everything below was added for the "Record Expense" screen's UAE-VAT-looking fields —
      // capture-only (see migrations/1760000000000_expense_tax_fields.js): stored and shown on
      // the detail page, but none of it changes syncExpenseJournal's GL posting, which still
      // only ever reads tax_amount above (auto-filled by ExpenseForm.tsx from tax_rate_id).
      { name: "tax_treatment", label: "Tax Treatment", type: "select", default: "non_vat_registered", options: [
        { label: "VAT Registered", value: "vat_registered" },
        { label: "Non VAT Registered", value: "non_vat_registered" },
        { label: "GCC VAT Registered", value: "gcc_vat_registered" },
      ] },
      { name: "place_of_supply", label: "Place of Supply", type: "select", options: [
        { label: "Abu Dhabi", value: "Abu Dhabi" },
        { label: "Dubai", value: "Dubai" },
        { label: "Sharjah", value: "Sharjah" },
        { label: "Ajman", value: "Ajman" },
        { label: "Umm Al Quwain", value: "Umm Al Quwain" },
        { label: "Ras al-Khaimah", value: "Ras al-Khaimah" },
        { label: "Fujairah", value: "Fujairah" },
      ] },
      { name: "reverse_charge", label: "Reverse Charge (DRC)", type: "boolean", default: false },
      { name: "tax_rate_id", label: "Tax", type: "select", refEntity: "tax-rates", refLabelField: "name" },
      { name: "customer_id", label: "Customer Name", type: "select", refEntity: "customers", refLabelField: "display_name" },
      { name: "reference_number", label: "Reference #", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "recurring-expenses": {
    key: "recurring-expenses",
    table: "recurring_expenses",
    label: "Recurring Expense",
    labelPlural: "Recurring Expenses",
    module: "Purchases",
    kind: "flat",
    titleField: "profile_name",
    orderBy: "created_at desc",
    listColumns: ["profile_name", "vendor_id", "frequency", "next_expense_date", "amount", "status"],
    fields: [
      { name: "profile_name", label: "Profile Name", type: "text", required: true },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name" },
      { name: "account_id", label: "Expense Account", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      {
        name: "frequency",
        label: "Repeat Every",
        type: "select",
        default: "monthly",
        options: [
          { label: "Weekly", value: "weekly" },
          { label: "Monthly", value: "monthly" },
          { label: "Quarterly", value: "quarterly" },
          { label: "Yearly", value: "yearly" },
        ],
      },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "next_expense_date", label: "Next Expense Date", type: "date" },
      { name: "amount", label: "Amount", type: "currency", default: 0 },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "active",
        options: [
          { label: "Active", value: "active" },
          { label: "Stopped", value: "stopped" },
        ],
      },
    ],
  },

  "purchase-orders": {
    key: "purchase-orders",
    table: "purchase_orders",
    label: "Purchase Order",
    labelPlural: "Purchase Orders",
    module: "Purchases",
    // Originally a minimal module — generic document form/list only, no dedicated detail
    // page — since it existed mainly so a Sales Order's "Convert to Purchase Order" action
    // had a real record to create. Gained a real read-only, print/PDF-styled detail page (see
    // src/app/(app)/purchase-orders/[id]/page.tsx, mirroring Sales Orders') when the Send
    // Email feature needed a proper home for a "Send Email" action — still uses the plain
    // generic DocumentForm for create/edit (see .../[id]/edit/page.tsx), unlike Sales Orders'
    // bespoke form.
    kind: "document",
    titleField: "po_number",
    numberField: "po_number",
    numberPrefix: "PO",
    // The PO# links to the read-only detail page instead of straight to editing — see
    // src/app/(app)/purchase-orders/[id]/page.tsx (a literal route, so it wins over the
    // generic [slug]/[id] one regardless of "kind"). Editing moves to
    // /purchase-orders/[id]/edit.
    hasDetailView: true,
    orderBy: "created_at desc",
    listColumns: ["po_number", "vendor_id", "order_date", "expected_delivery_date", "status", "total"],
    fields: [
      { name: "po_number", label: "Purchase Order #", type: "text", required: true },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name", required: true },
      { name: "order_date", label: "Order Date", type: "date", default: "" },
      { name: "expected_delivery_date", label: "Expected Delivery Date", type: "date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Confirmed", value: "confirmed" },
          { label: "Closed", value: "closed" },
          { label: "Void", value: "void" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
      // Display-only metadata for the list view, same reasoning as sales-orders'/invoices'
      // "total" entries — DocumentForm.tsx never reads entity.fields, so this is invisible to
      // editing; without it this list column rendered as a plain unformatted number.
      { name: "total", label: "Total", type: "currency" },
    ],
  },

  bills: {
    key: "bills",
    table: "bills",
    label: "Bill",
    labelPlural: "Bills",
    module: "Purchases",
    // Still "document" for entities.ts/[slug] dispatch purposes (harmless — the literal
    // /bills/new, /bills/[id], /bills/[id]/edit routes added alongside BillForm.tsx always
    // win over the generic [slug] catch-all, same as Invoices), but creation/edit now goes
    // through the bespoke BillForm.tsx + /api/bills (see bills-api.ts), NOT the generic
    // DocumentForm/documents-api.ts, because a bill line needs its own Account/Tax/Customer
    // fields that the shared document shape doesn't have.
    kind: "document",
    titleField: "bill_number",
    numberField: "bill_number",
    numberPrefix: "BILL",
    orderBy: "created_at desc",
    // Read-only detail view (item table, Journal, Payments Made history) instead of going
    // straight to the edit form — see src/app/(app)/bills/[id]/page.tsx, same pattern as
    // Invoices/Expenses.
    hasDetailView: true,
    attachments: true,
    listColumns: ["bill_number", "vendor_id", "bill_date", "due_date", "status", "total", "balance_due"],
    fields: [
      { name: "bill_number", label: "Bill #", type: "text", required: true },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name", required: true },
      { name: "bill_date", label: "Bill Date", type: "date" },
      { name: "due_date", label: "Due Date", type: "date" },
      { name: "order_number", label: "Order Number", type: "text" },
      { name: "permit_number", label: "Permit#", type: "text" },
      { name: "subject", label: "Subject", type: "text" },
      {
        name: "payment_terms",
        label: "Payment Terms",
        type: "select",
        default: "due_on_receipt",
        options: [
          { label: "Due on Receipt", value: "due_on_receipt" },
          { label: "Net 15", value: "net_15" },
          { label: "Net 30", value: "net_30" },
          { label: "Net 45", value: "net_45" },
          { label: "Net 60", value: "net_60" },
        ],
      },
      { name: "accounts_payable_account_id", label: "Accounts Payable", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        // Paid / Partially Paid are derived automatically from Payments Made against this
        // bill (see recomputeBillBalance in auto-journal.ts) — not manually selectable, same
        // integrity fix already applied to Invoices (see the note there): letting a user
        // hand-pick "Paid" with nothing actually paid would desync balance_due from reality.
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Open", value: "open" },
          { label: "Overdue", value: "overdue" },
          // Set only via the dedicated Void action (voidBill in bills-api.ts), not hand-picked
          // here — same reasoning as Paid/Partially Paid being excluded above, plus voidBill's
          // own guard against voiding a bill that already has payments applied.
          { label: "Void", value: "void" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
      // Optional Property Master tags (same pattern/reasoning as invoices.project_id/unit_id
      // above) — BillForm.tsx renders real selects for these directly (see the "kind" comment
      // at the top of this entity: BillForm never reads entity.fields at all), so these entries
      // exist purely so the generic list/detail machinery (DataTable's refEntity auto-link,
      // loadRefOptions) could resolve+show them if either were ever added to listColumns —
      // neither is, for now, matching the same restraint already applied to Invoices/Sales
      // Orders' own Project field.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "unit_id", label: "Unit", type: "select", refEntity: "inventory", refLabelField: "name" },
      // Display-only for the list view (same reasoning as invoices'/sales-orders' "total"
      // entries) — BillForm.tsx never reads entity.fields, so this is invisible to editing.
      { name: "total", label: "Total", type: "currency" },
      { name: "balance_due", label: "Balance Due", type: "currency" },
    ],
  },

  "recurring-bills": {
    key: "recurring-bills",
    table: "recurring_bills",
    label: "Recurring Bill",
    labelPlural: "Recurring Bills",
    module: "Purchases",
    kind: "flat",
    titleField: "profile_name",
    orderBy: "created_at desc",
    listColumns: ["profile_name", "vendor_id", "frequency", "next_bill_date", "amount", "status"],
    fields: [
      { name: "profile_name", label: "Profile Name", type: "text", required: true },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name", required: true },
      {
        name: "frequency",
        label: "Repeat Every",
        type: "select",
        default: "monthly",
        options: [
          { label: "Weekly", value: "weekly" },
          { label: "Monthly", value: "monthly" },
          { label: "Quarterly", value: "quarterly" },
          { label: "Yearly", value: "yearly" },
        ],
      },
      { name: "start_date", label: "Start Date", type: "date" },
      { name: "next_bill_date", label: "Next Bill Date", type: "date" },
      { name: "amount", label: "Amount", type: "currency", default: 0 },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "active",
        options: [
          { label: "Active", value: "active" },
          { label: "Stopped", value: "stopped" },
        ],
      },
    ],
  },

  "payments-made": {
    key: "payments-made",
    table: "payments_made",
    label: "Payment Made",
    labelPlural: "Payments Made",
    module: "Purchases",
    // "payment" gets a dedicated Record Payment form (search-to-select vendor, a live Open
    // Bills table with per-bill allocation) instead of the generic flat form — mirrors
    // payments-received's own kind exactly. Editing an existing payment still uses the
    // generic form below (allocations aren't editable there — see RecordPaymentMadeForm.tsx
    // and payments-made-api.ts).
    kind: "payment",
    titleField: "payment_number",
    numberField: "payment_number",
    numberPrefix: "PAY",
    orderBy: "created_at desc",
    // Read-only detail view (bill allocations + the auto-generated Journal) — see
    // src/app/(app)/payments-made/[id]/page.tsx.
    hasDetailView: true,
    attachments: true,
    listColumns: ["payment_number", "vendor_id", "payment_date", "amount", "payment_mode", "status"],
    fields: [
      { name: "payment_number", label: "Payment #", type: "text", placeholder: "Auto-generated if left blank" },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name", required: true },
      // Superseded by bill_payment_allocations (see the migration this was added alongside) —
      // a payment can now settle multiple open bills, not just one, so this single-select FK
      // is kept only for any pre-existing rows and is never written by RecordPaymentMadeForm.
      { name: "bill_id", label: "Against Bill (legacy)", type: "select", refEntity: "bills", refLabelField: "bill_number" },
      // required — see the same fix + comment on delivery-challans' challan_date.
      { name: "payment_date", label: "Payment Date", type: "date", required: true },
      { name: "amount", label: "Amount", type: "currency", required: true, default: 0 },
      {
        name: "payment_mode",
        label: "Payment Mode",
        type: "select",
        default: "cash",
        options: [
          { label: "Cash", value: "cash" },
          { label: "Bank Transfer", value: "bank_transfer" },
          { label: "Credit Card", value: "credit_card" },
          { label: "Cheque", value: "cheque" },
        ],
      },
      // Required — a payment with nowhere it came from can't post a balanced GL entry (see
      // syncPaymentMadeJournal in auto-journal.ts), same reasoning as Record Payment's
      // required "Deposit To".
      { name: "bank_account_id", label: "Paid Through", type: "select", refEntity: "bank-accounts", refLabelField: "account_name", required: true },
      { name: "reference_number", label: "Reference #", type: "text" },
      // Optional Property Master tags (same pattern/reasoning as payments-received's own
      // project_id/unit_id above) — RecordPaymentMadeForm.tsx renders these directly for
      // create; this entry is what makes them show up and save correctly on the generic
      // EntityForm used for editing an existing payment (see the "kind" comment at the top of
      // this entity). Not in listColumns, same decision as Payments Received.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "unit_id", label: "Unit", type: "select", refEntity: "inventory", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "paid",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Paid", value: "paid" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "vendor-credits": {
    key: "vendor-credits",
    table: "vendor_credits",
    label: "Vendor Credit",
    labelPlural: "Vendor Credits",
    module: "Purchases",
    // "document" only for [slug]-dispatch purposes (see the same comment on bills above) —
    // creation/edit goes through the bespoke VendorCreditForm.tsx + /api/vendor-credits (see
    // vendor-credits-api.ts), not the generic flat form this used to be. This entity never had
    // line items before this build (see the migration that added vendor_credit_items).
    kind: "document",
    titleField: "credit_note_number",
    numberField: "credit_note_number",
    numberPrefix: "VC",
    orderBy: "created_at desc",
    // Read-only detail view (item table + Journal) instead of going straight to the edit
    // form — see src/app/(app)/vendor-credits/[id]/page.tsx.
    hasDetailView: true,
    attachments: true,
    listColumns: ["credit_note_number", "vendor_id", "credit_date", "status", "total"],
    fields: [
      { name: "credit_note_number", label: "Vendor Credit #", type: "text", placeholder: "Auto-generated if left blank" },
      { name: "vendor_id", label: "Vendor", type: "select", refEntity: "vendors", refLabelField: "display_name", required: true },
      // required — see the same fix + comment on delivery-challans' challan_date.
      { name: "credit_date", label: "Date", type: "date", required: true },
      { name: "order_number", label: "Order Number", type: "text" },
      { name: "subject", label: "Subject", type: "text" },
      { name: "accounts_payable_account_id", label: "Accounts Payable", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "open",
        options: [
          { label: "Open", value: "open" },
          { label: "Closed", value: "closed" },
        ],
      },
      { name: "total", label: "Total", type: "currency", default: 0 },
      { name: "reason", label: "Reason", type: "textarea" },
    ],
  },

  "manual-journals": {
    key: "manual-journals",
    table: "manual_journals",
    label: "Manual Journal",
    labelPlural: "Manual Journals",
    module: "Accountant",
    kind: "journal",
    titleField: "journal_number",
    numberField: "journal_number",
    numberPrefix: "JNL",
    orderBy: "created_at desc",
    listColumns: ["journal_number", "journal_date", "reference_number", "status"],
    hasDetailView: true,
    fields: [
      { name: "journal_number", label: "Journal #", type: "text", required: true },
      { name: "journal_date", label: "Journal Date", type: "date" },
      { name: "reference_number", label: "Reference #", type: "text" },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "draft",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Published", value: "published" },
        ],
      },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "chart-of-accounts": {
    key: "chart-of-accounts",
    table: "accounts",
    label: "Account",
    labelPlural: "Chart of Accounts",
    module: "Accountant",
    kind: "flat",
    titleField: "name",
    orderBy: "code asc nulls last, name asc",
    listColumns: ["code", "name", "type", "parent_account_id", "is_active"],
    hasDetailView: true,
    fields: [
      { name: "code", label: "Account Code", type: "text" },
      { name: "name", label: "Account Name", type: "text", required: true },
      {
        name: "type",
        label: "Account Type",
        type: "select",
        default: "expense",
        required: true,
        options: ACCOUNT_TYPE_OPTIONS,
      },
      // Self-referencing "make this a sub-account" — see migrations/1785000000000_chart_of_
      // accounts_parent.js for the full design writeup (deliberately no type-matching or
      // balance-rollup enforcement in this pass). The generic refEntity dropdown would
      // otherwise let an account list (and be set as) its own parent — guarded against in two
      // places: crud.ts's loadRefOptions excludes the record being edited from its own options,
      // and validateRefFields rejects a direct API call that tries anyway.
      { name: "parent_account_id", label: "Parent Account", listLabel: "Parent Account Name", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      // Optional — most accounts (Cash, VAT Payable, Accounts Receivable, ...) are org-wide,
      // not tied to any one Property Master project. Lets the few that should be (a
      // project-specific bank account, a project cost-center account) be tagged and then
      // filtered/reported on by project. Not required, unlike Buildings/Units' project_id,
      // since those are a true composition hierarchy under a project and this isn't.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "iban_number", label: "IBAN Number", type: "text" },
      { name: "bank_name", label: "Bank Name", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  budgets: {
    key: "budgets",
    table: "budgets",
    label: "Budget",
    labelPlural: "Budgets",
    module: "Accountant",
    kind: "flat",
    titleField: "name",
    orderBy: "created_at desc",
    listColumns: ["name", "fiscal_year", "account_id", "period", "amount"],
    fields: [
      { name: "name", label: "Budget Name", type: "text", required: true },
      { name: "fiscal_year", label: "Fiscal Year", type: "text", required: true, placeholder: "2026" },
      { name: "account_id", label: "Account", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      {
        name: "period",
        label: "Period",
        type: "select",
        default: "yearly",
        options: [
          { label: "Monthly", value: "monthly" },
          { label: "Quarterly", value: "quarterly" },
          { label: "Yearly", value: "yearly" },
        ],
      },
      { name: "amount", label: "Budgeted Amount", type: "currency", default: 0 },
    ],
  },

  "currency-adjustments": {
    key: "currency-adjustments",
    table: "currency_adjustments",
    label: "Currency Adjustment",
    labelPlural: "Currency Adjustments",
    module: "Accountant",
    kind: "flat",
    titleField: "currency",
    orderBy: "created_at desc",
    listColumns: ["adjustment_date", "account_id", "currency", "exchange_rate", "adjustment_amount"],
    fields: [
      { name: "adjustment_date", label: "Date", type: "date" },
      { name: "account_id", label: "Account", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
      { name: "currency", label: "Currency", type: "select", options: currency, default: "USD" },
      { name: "exchange_rate", label: "New Exchange Rate", type: "number", default: 1 },
      { name: "adjustment_amount", label: "Adjustment Amount", type: "currency", default: 0 },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },

  "transaction-locking": {
    key: "transaction-locking",
    table: "transaction_locks",
    label: "Transaction Lock",
    labelPlural: "Transaction Locking",
    module: "Accountant",
    kind: "flat",
    titleField: "lock_date",
    orderBy: "lock_date desc",
    listColumns: ["lock_date", "reason", "locked_by"],
    fields: [
      { name: "lock_date", label: "Lock Transactions On or Before", type: "date", required: true },
      { name: "reason", label: "Reason", type: "textarea" },
      { name: "locked_by", label: "Locked By", type: "text" },
    ],
  },

  "bank-accounts": {
    key: "bank-accounts",
    table: "bank_accounts",
    label: "Bank / Credit Card",
    labelPlural: "Banks",
    module: "Banks",
    kind: "flat",
    titleField: "account_name",
    orderBy: "is_primary desc, created_at desc",
    listColumns: ["account_name", "account_type", "bank_name", "account_number", "currency", "is_primary"],
    fields: [
      {
        name: "account_type",
        label: "Select Account Type",
        type: "select",
        default: "bank",
        required: true,
        options: [
          { label: "Bank", value: "bank" },
          { label: "Credit Card", value: "credit_card" },
        ],
      },
      { name: "account_name", label: "Account Name", type: "text", required: true },
      { name: "account_code", label: "Account Code", type: "text" },
      { name: "currency", label: "Currency", type: "select", options: currency, default: "AED", required: true },
      { name: "account_number", label: "Account Number", type: "text" },
      { name: "bank_name", label: "Bank Name", type: "text" },
      { name: "bank_identifier_code", label: "Bank Identifier Code", type: "text" },
      // Optional Property Master tag — same reasoning as chart-of-accounts' own project_id
      // (see that entity's comment: "a project-specific bank account" is the literal example
      // given there). Most bank/credit-card accounts are org-wide, not tied to any one
      // project. Independent of gl_account_id's own linked Chart of Accounts entry, which can
      // carry its own separate project_id — tagging one doesn't tag or require tagging the
      // other (migrations/1789000000000_bank_accounts_project_tag.js). Not shown in
      // listColumns (BankingClient.tsx is a bespoke card list, not the generic DataTable);
      // BankAccountModal.tsx renders this as its own dedicated select, same as every other
      // field on this entity.
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_primary", label: "Make this primary", type: "boolean", default: false },
      // Optional — lets this bank/credit-card account be linked to an EXISTING Chart of
      // Accounts entry (e.g. one the user already created by hand) instead of always getting
      // a fresh auto-created one. Left blank on create, getOrCreateBankGLAccount
      // (auto-journal.ts) auto-creates and links a new GL account right away — see the
      // bank-accounts branch in /api/entities/[entity]/route.ts and [id]/route.ts. Not shown
      // in listColumns; BankAccountModal.tsx renders this as its own dedicated select rather
      // than relying on the generic EntityForm, same as every other field on this entity.
      { name: "gl_account_id", label: "Link to Chart of Accounts", type: "select", refEntity: "chart-of-accounts", refLabelField: "name" },
    ],
  },

  roles: {
    key: "roles",
    table: "roles",
    label: "Role",
    labelPlural: "Roles",
    module: "Settings",
    adminOnly: true,
    kind: "flat",
    titleField: "name",
    orderBy: "created_at asc",
    listColumns: ["name", "description"],
    fields: [
      { name: "name", label: "Role Name", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  currencies: {
    key: "currencies",
    table: "currencies",
    label: "Currency",
    labelPlural: "Currencies",
    module: "Settings",
    adminOnly: true,
    kind: "flat",
    titleField: "code",
    orderBy: "code asc",
    listColumns: ["code", "name", "symbol", "exchange_rate", "as_of_date"],
    fields: [
      { name: "code", label: "Currency Code", type: "text", required: true, placeholder: "USD" },
      { name: "name", label: "Currency Name", type: "text", required: true, placeholder: "US Dollar" },
      { name: "symbol", label: "Symbol", type: "text", placeholder: "$" },
      { name: "exchange_rate", label: "Exchange Rate (in base currency)", type: "number" },
      { name: "as_of_date", label: "As Of Date", type: "date" },
    ],
  },

  "payment-terms": {
    key: "payment-terms",
    table: "payment_terms",
    label: "Payment Term",
    labelPlural: "Payment Terms",
    module: "Settings",
    adminOnly: true,
    kind: "flat",
    titleField: "name",
    orderBy: "created_at asc",
    listColumns: ["name", "is_active"],
    fields: [
      { name: "name", label: "Term Name", type: "text", required: true, placeholder: "Net 30" },
      { name: "is_default", label: "Set as default payment term", type: "boolean", default: false },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  // The "Active Taxes" / "Tax Rates" list under Settings -> Taxes. Plain flat entity, same
  // shape as currencies/payment-terms above — no line items, no GL postings of its own.
  // "Default Tax" (is_default) is the rate the reference screenshot's footer note describes
  // ("used for transactions involving a customer whose 'Tax Preference' isn't configured") —
  // this build doesn't yet have a per-customer Tax Preference field, so the flag is stored and
  // shown but nothing reads it automatically yet; disclosed, not wired into document tax
  // calculation, which still uses its own free-entry percent field (DocumentForm.tsx) exactly
  // as it did before this table existed.
  "tax-rates": {
    key: "tax-rates",
    table: "tax_rates",
    label: "Tax",
    labelPlural: "Tax Rates",
    module: "Settings",
    adminOnly: true,
    kind: "flat",
    titleField: "name",
    orderBy: "created_at asc",
    listColumns: ["name", "country_region", "rate", "is_default"],
    fields: [
      { name: "name", label: "Tax Name", type: "text", required: true, placeholder: "e.g. Standard Rate" },
      { name: "country_region", label: "Country/Region", type: "select", options: COUNTRY_OPTIONS },
      { name: "rate", label: "Rate (%)", type: "number", required: true, default: 0 },
      {
        name: "is_default",
        label: "Default Tax",
        type: "boolean",
        default: false,
        helpText: "Used for transactions involving a customer whose Tax Preference isn't configured.",
        booleanLabels: { true: "Default Tax", false: "—" },
      },
    ],
  },

  // The Rules table under Settings -> General -> Revenue Recognition (see
  // RevenueRecognitionSettings.tsx, embedded via SettingsEntityList — same "generic flat
  // entity embedded in a settings sub-page" pattern as currencies/payment-terms above). Plain
  // flat entity, no line items, no GL postings of its own — the GL work happens in
  // auto-journal.ts's syncRevenueRecognitionSchedule, keyed off which rule (if any) an
  // invoice line is tagged with via invoice_items.revenue_recognition_rule_id.
  "revenue-recognition-rules": {
    key: "revenue-recognition-rules",
    table: "revenue_recognition_rules",
    label: "Revenue Recognition Rule",
    labelPlural: "Revenue Recognition Rules",
    module: "Settings",
    adminOnly: true,
    kind: "flat",
    titleField: "name",
    orderBy: "created_at asc",
    listColumns: ["name", "method", "frequency", "is_active"],
    fields: [
      { name: "name", label: "Rule Name", type: "text", required: true, placeholder: "e.g. 12-Month Service" },
      {
        name: "method",
        label: "Recognition Method",
        type: "select",
        default: "straight_line",
        required: true,
        // "Immediate" is the no-op method — a line tagged with it (or left untagged) behaves
        // exactly as every invoice line did before this feature existed, posting its full
        // amount to Income on the invoice date. "Straight-Line" is the real deferral method:
        // the line's amount is spread evenly (by day count) across its service period and
        // recognized a period at a time as each period's end date arrives — see
        // syncRevenueRecognitionSchedule / processDueRevenueRecognition in auto-journal.ts.
        options: [
          { label: "Immediate", value: "immediate" },
          { label: "Straight-Line", value: "straight_line" },
        ],
      },
      {
        name: "frequency",
        label: "Recognition Frequency",
        type: "select",
        default: "monthly",
        required: true,
        // Monthly is the only frequency this pass's proration logic implements (see
        // auto-journal.ts) — stored as its own field rather than hardcoded so Daily/Yearly can
        // be added later without a schema change; the select only offers what's implemented.
        options: [{ label: "Monthly", value: "monthly" }],
      },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "boolean", default: true },
    ],
  },

  // ---------- Property Master ----------
  // Real-estate master-data hierarchy: Projects -> Buildings -> Units. Plain lookup tables,
  // no line items and no GL postings, so the generic flat-entity CRUD (this file +
  // src/lib/crud.ts + the /api/entities/[entity] routes + the [slug] catch-all pages) is
  // enough — no bespoke pages needed, the same way Vendors/Bank Accounts/Chart of Accounts
  // work.
  projects: {
    key: "projects",
    table: "projects",
    label: "Project",
    labelPlural: "Projects",
    module: "Property Master",
    kind: "flat",
    titleField: "name",
    orderBy: "created_at desc",
    // Read-only detail view (shows every field + the Buildings under this project) instead
    // of going straight to the edit form — see src/app/(app)/projects/[id]/page.tsx. Editing
    // moves to /projects/[id]/edit (src/app/(app)/projects/[id]/edit/page.tsx).
    hasDetailView: true,
    listColumns: ["name", "organization_id", "code", "status", "city", "country", "estimated_completion_date"],
    fields: [
      { name: "name", label: "Project Name", type: "text", required: true },
      // A real, functional parent field (unlike the ordinary organization_id scoping every
      // table already has) — its options are every org the current user is a member of (see
      // loadRefOptions's "organizations" special case in crud.ts, since the organizations
      // table itself has no organization_id column to filter a generic ref query by), and
      // changing it actually reassigns the project to that organization: it disappears from
      // this org's Projects list and appears under the new one's instead. Both the create and
      // update paths validate the submitted value against the user's real memberships before
      // writing it (resolveOrgIdForWrite in crud.ts) so a project can never end up under an
      // org the user doesn't actually belong to. noLink because there's no generic
      // /organizations/[id] detail page to link to.
      {
        name: "organization_id",
        label: "Organization",
        type: "select",
        refEntity: "organizations",
        refLabelField: "name",
        required: true,
        noLink: true,
        helpText: "Moving this to a different organization removes it from this org's Projects list.",
      },
      { name: "code", label: "Code", type: "text" },
      { name: "rera_project_name", label: "Rera Project Name", type: "text" },
      {
        name: "legal_entity_id",
        label: "Legal Entity",
        type: "select",
        refEntity: "legal-entities",
        refLabelField: "entity_name",
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "offplan",
        options: [
          { label: "Offplan", value: "offplan" },
          { label: "Ready", value: "ready" },
        ],
      },
      { name: "plot_area", label: "Plot Area", type: "number", default: 0 },
      { name: "project_arabic_name", label: "Project Arabic Name", type: "text" },
      { name: "rera_number", label: "Rera Number", type: "text" },
      { name: "estimated_completion_date", label: "Estimated Completion Date", type: "date" },
      { name: "completion_date", label: "Completion Date", type: "date" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "project_address", label: "Project Address", type: "textarea" },
      { name: "country", label: "Country", type: "select", options: COUNTRY_OPTIONS },
      { name: "city", label: "City", type: "text" },
    ],
  },

  // Plain master-data lookup, requested to be "selectable on projects" — see projects'
  // legal_entity_id field above. Read-only detail view (shows every field + the Projects
  // pointing at this Legal Entity) instead of going straight to the edit form — see
  // src/app/(app)/legal-entities/[id]/page.tsx. Editing moves to /legal-entities/[id]/edit
  // (src/app/(app)/legal-entities/[id]/edit/page.tsx), same pattern as Buildings/Projects.
  "legal-entities": {
    key: "legal-entities",
    table: "legal_entities",
    label: "Legal Entity",
    labelPlural: "Legal Entities",
    module: "Property Master",
    kind: "flat",
    titleField: "entity_name",
    orderBy: "created_at desc",
    hasDetailView: true,
    listColumns: ["entity_name", "entity_name_arabic", "email", "phone", "registration_num"],
    fields: [
      { name: "entity_name", label: "Entity Name", type: "text", required: true },
      { name: "entity_name_arabic", label: "Entity Name Arabic", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "registration_num", label: "Registration Num", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },

  // Cost-breakdown line item belonging to a Project — "selectable on projects" (project_id
  // below) plus surfaced as a list under the Project detail page (see the Other Charges
  // section in src/app/(app)/projects/[id]/page.tsx), the same "child selects its parent,
  // parent's detail page lists its children" pattern Buildings already uses for Projects.
  // No detail view of its own (not requested) — the row's title links straight to the edit
  // form, same as Buildings/Units.
  "other-charges": {
    key: "other-charges",
    table: "other_charges",
    label: "Other Charge",
    labelPlural: "Other Charges",
    module: "Property Master",
    kind: "flat",
    titleField: "category",
    orderBy: "created_at desc",
    listColumns: ["category", "project_id", "calculation_basis", "aed_psqft", "aed_mn", "pct_gross_outflow"],
    fields: [
      {
        name: "category",
        label: "Category",
        type: "select",
        required: true,
        options: [
          { label: "Land payments", value: "Land payments" },
          { label: "Construction cost", value: "Construction cost" },
          { label: "DLD & registration", value: "DLD & registration" },
          { label: "RERA refundable deposit", value: "RERA refundable deposit" },
          { label: "Development overheads", value: "Development overheads" },
          { label: "Sales & marketing", value: "Sales & marketing" },
          { label: "Approval authorities & consultants", value: "Approval authorities & consultants" },
        ],
      },
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name", required: true },
      { name: "calculation_basis", label: "Calculation Basis", type: "text" },
      { name: "aed_psqft", label: "AED (psqft)", type: "number" },
      { name: "aed_mn", label: "AED Mn", type: "number" },
      { name: "pct_gross_outflow", label: "% of Gross Outflow", type: "number" },
    ],
  },

  buildings: {
    key: "buildings",
    table: "buildings",
    label: "Building",
    labelPlural: "Buildings",
    module: "Property Master",
    kind: "flat",
    titleField: "name",
    orderBy: "created_at desc",
    // Read-only detail view (shows every field + the Units under this building) instead of
    // going straight to the edit form — see src/app/(app)/buildings/[id]/page.tsx. Editing
    // moves to /buildings/[id]/edit (src/app/(app)/buildings/[id]/edit/page.tsx).
    hasDetailView: true,
    listColumns: ["name", "project_id", "code", "estimated_handover_date", "actual_handover_date"],
    fields: [
      { name: "name", label: "Building Name", type: "text", required: true },
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name", required: true },
      { name: "code", label: "Code", type: "text" },
      { name: "actual_handover_date", label: "Actual Handover Date", type: "date" },
      { name: "estimated_handover_date", label: "Estimated Handover Date", type: "date" },
    ],
  },

  // Table is `inventory` (matches the field spec's object name); surfaced to users as "Units"
  // since that's the natural everyday name for one sellable unit. Both Building and Project
  // are stored directly on each unit (not just derived transitively through Building) because
  // that's how the field spec models it — lets a unit be filtered/reported on by Project
  // without a join through Building. Note this app's generic refEntity dropdown always lists
  // *every* row of the referenced entity (see loadRefOptions in src/lib/crud.ts) — same as
  // every other parent dropdown in the app (e.g. a Bill picker lists every bill regardless of
  // vendor) — so picking a Building here does not automatically filter or auto-fill the
  // Project dropdown; the two are selected independently and it's on the user to pick a
  // consistent pair.
  inventory: {
    key: "inventory",
    table: "inventory",
    label: "Unit",
    labelPlural: "Units",
    module: "Property Master",
    kind: "flat",
    titleField: "name",
    // Has a real read-only detail view now (src/app/(app)/inventory/[id]/page.tsx — Unit
    // Details plus its related Sales Orders/Invoices/Receipts) — supersedes the earlier
    // disableTitleLink:true decision (there was no detail page then, only an edit form the
    // user didn't want opened on a name click; now the name click lands on a genuine
    // non-editable page instead, exactly what that decision was trying to prevent).
    hasDetailView: true,
    orderBy: "created_at desc",
    listColumns: ["name", "building_id", "project_id", "unit_type", "status", "listed_price"],
    fields: [
      { name: "building_id", label: "Building", type: "select", refEntity: "buildings", refLabelField: "name", required: true },
      { name: "project_id", label: "Project", type: "select", refEntity: "projects", refLabelField: "name", required: true },
      { name: "name", label: "Unit Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text" },
      { name: "floor", label: "Floor", type: "text" },
      { name: "area", label: "Area", type: "number", default: 0 },
      { name: "listed_price", label: "Listed Price", type: "currency", default: 0 },
      {
        name: "status",
        label: "Status",
        type: "select",
        default: "available",
        options: [
          { label: "Reserved", value: "reserved" },
          { label: "Available", value: "available" },
          { label: "Sold", value: "sold" },
          { label: "Cancelled", value: "cancelled" },
        ],
      },
      {
        name: "unit_type",
        label: "Unit Type",
        type: "select",
        options: [
          { label: "Apartment", value: "apartment" },
          { label: "Villa", value: "villa" },
        ],
      },
      {
        name: "unit_sub_type",
        label: "Unit Sub Type",
        type: "select",
        options: [
          { label: "Studio", value: "studio" },
          { label: "1 BR", value: "1br" },
          { label: "2 BR", value: "2br" },
          { label: "3 BR", value: "3br" },
        ],
      },
      {
        name: "usage_type",
        label: "Usage Type",
        type: "select",
        options: [
          { label: "Residential", value: "residential" },
          { label: "Commercial", value: "commercial" },
          { label: "Retail", value: "retail" },
        ],
      },
    ],
  },
};

export function getEntity(key: string): EntityDef | undefined {
  return entities[key];
}
