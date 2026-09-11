export interface DocumentConfig {
  key: "quotes" | "invoices" | "bills" | "sales_orders" | "purchase_orders";
  /** The URL slug / documentConfigs lookup key this config is registered under (e.g.
   * "purchase-orders", matching the route segment and the entities.ts registry key). `key`
   * above is a separate, older field used only for business-logic checks (cfg.key ===
   * "invoices"/"bills") and for sales-orders/purchase-orders does NOT match the URL slug
   * (it's the underscored DB-ish form, "sales_orders"/"purchase_orders") — DocumentForm.tsx
   * needs the real slug to build API URLs and redirects, hence this separate field rather
   * than reusing `key` for both purposes. */
  entityKey: string;
  headerTable: string;
  itemsTable: string;
  parentField: string; // fk column on items table pointing back to header
  partyField: "customer_id" | "vendor_id";
  partyRefEntity: "customers" | "vendors";
  dateField: string;
  secondDateField?: string; // due_date / expiry_date
  secondDateLabel?: string;
  numberField: string;
  numberPrefix: string;
  /** Extra headerTable columns beyond the generic party/date/status/notes shape, passed
   * through as-is from body.header when present (no special handling) — e.g. Sales Orders'
   * reference_number/payment_terms/delivery_method/salesperson/terms_conditions. Lets a
   * document type have a richer dedicated form (see SalesOrderForm.tsx) while still going
   * through the same createDocument/updateDocument transaction as every other document type. */
  extraHeaderFields?: string[];
  /** itemsTable has a discount_percent column; amount = qty * rate * (1 - discount/100). */
  hasLineDiscount?: boolean;
  /** Key into the org's number_series preferences (src/lib/number-series.ts) for a real,
   * sequential, per-org auto-number (configurable auto/manual, restart-yearly, etc.) instead
   * of the random docNumber() suffix every other document type falls back to. Originally
   * invoices-only; sales orders opted in too so its form can show a real "next number"
   * preview like Zoho's, not a placeholder. */
  numberSeriesKey?: string;
  /** Renders AttachmentsField (see src/components/attachments/AttachmentsField.tsx) in
   * DocumentForm — this config is shared across Quotes/Invoices/Bills/Sales Orders/Purchase
   * Orders, but only Purchase Orders opted in here (Sales Orders has its own dedicated form,
   * SalesOrderForm.tsx, which renders it directly instead). */
  allowAttachments?: boolean;
}

export const documentConfigs: Record<string, DocumentConfig> = {
  quotes: {
    key: "quotes",
    entityKey: "quotes",
    headerTable: "quotes",
    itemsTable: "quote_items",
    parentField: "quote_id",
    partyField: "customer_id",
    partyRefEntity: "customers",
    dateField: "quote_date",
    secondDateField: "expiry_date",
    secondDateLabel: "Expiry Date",
    numberField: "quote_number",
    numberPrefix: "QT",
    numberSeriesKey: "quotes",
  },
  invoices: {
    key: "invoices",
    entityKey: "invoices",
    headerTable: "invoices",
    itemsTable: "invoice_items",
    parentField: "invoice_id",
    partyField: "customer_id",
    partyRefEntity: "customers",
    dateField: "invoice_date",
    secondDateField: "due_date",
    secondDateLabel: "Due Date",
    numberField: "invoice_number",
    numberPrefix: "INV",
    numberSeriesKey: "invoices",
    // Surfaced by DocumentForm.tsx directly (gated on cfg.key === "invoices") rather than via
    // a bespoke form component — see the field's own comment there. Needed for the Sales by
    // Salesperson report to have real data. "sales_order_id" is never submitted by
    // DocumentForm.tsx at all (no input for it) — it's set exactly once, by
    // convert-to-invoice/route.ts passing it in createDocument()'s header, and left alone by
    // every later edit (updateDocument only touches an extraHeaderField when it's actually
    // present in the PATCH body — see documents-api.ts). "project_id"/"unit_id" are the new
    // optional Property Master tags — DocumentForm.tsx renders real selects for these two
    // (unlike sales_order_id) and submits them like salesperson.
    extraHeaderFields: ["salesperson", "sales_order_id", "project_id", "unit_id"],
  },
  bills: {
    key: "bills",
    entityKey: "bills",
    headerTable: "bills",
    itemsTable: "bill_items",
    parentField: "bill_id",
    partyField: "vendor_id",
    partyRefEntity: "vendors",
    dateField: "bill_date",
    secondDateField: "due_date",
    secondDateLabel: "Due Date",
    numberField: "bill_number",
    numberPrefix: "BILL",
    numberSeriesKey: "bills",
  },
  "sales-orders": {
    key: "sales_orders",
    entityKey: "sales-orders",
    headerTable: "sales_orders",
    itemsTable: "sales_order_items",
    parentField: "sales_order_id",
    partyField: "customer_id",
    partyRefEntity: "customers",
    dateField: "order_date",
    secondDateField: "shipment_date",
    secondDateLabel: "Expected Shipment Date",
    numberField: "so_number",
    numberPrefix: "SO",
    extraHeaderFields: ["reference_number", "payment_terms", "delivery_method", "salesperson", "terms_conditions"],
    hasLineDiscount: true,
    numberSeriesKey: "sales-orders",
  },
  "purchase-orders": {
    key: "purchase_orders",
    entityKey: "purchase-orders",
    headerTable: "purchase_orders",
    itemsTable: "purchase_order_items",
    parentField: "purchase_order_id",
    partyField: "vendor_id",
    partyRefEntity: "vendors",
    dateField: "order_date",
    secondDateField: "expected_delivery_date",
    secondDateLabel: "Expected Delivery Date",
    numberField: "po_number",
    numberPrefix: "PO",
    extraHeaderFields: ["reference_number", "terms_conditions"],
    hasLineDiscount: true,
    numberSeriesKey: "purchase-orders",
    allowAttachments: true,
  },
};

export interface DocumentLineInput {
  item_id?: string | null;
  description?: string;
  quantity: number;
  rate: number;
}
