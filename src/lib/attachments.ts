// Shared config for the file-upload feature on Sales Orders, Purchase Orders, Payments
// Received, Customers, and Vendors — see src/app/api/attachments/route.ts (upload/list),
// src/app/api/attachments/[id]/route.ts (delete), and
// src/components/attachments/AttachmentsField.tsx (the shared UI these routes back).

/** Every entityType this feature is wired up for, mapped to the real table its entity_id
 * has to exist in (and be scoped to the caller's organization_id) before we let anyone
 * attach a file to it. Deliberately an explicit whitelist rather than trusting whatever
 * string the client sends — attachments.entity_type/entity_id aren't real foreign keys (see
 * the migration's comment), so this is the only thing standing between a client-supplied
 * entityType and an arbitrary table name ending up in a SQL query. */
export const ATTACHMENT_ENTITY_TABLES: Record<string, string> = {
  "sales-orders": "sales_orders",
  "purchase-orders": "purchase_orders",
  "payments-received": "payments_received",
  customers: "customers",
  vendors: "vendors",
};

export type AttachmentEntityType = keyof typeof ATTACHMENT_ENTITY_TABLES;

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_ENTITY_TABLES, value);
}

/** Common document/image types — matches what an accounting team actually attaches
 * (scanned invoices, signed POs, payment proofs). Anything else is rejected with a clear
 * error rather than silently accepted and then failing to preview. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
export const MAX_ATTACHMENTS_PER_ENTITY = 10; // matches the cap already advertised in the UI

/** Per-organization storage allowance across every entity type combined. Enforced by
 * summing attachments.size_bytes for the org (see checkQuota below) rather than a running
 * counter column, so it can never drift from what's actually stored. */
export const ATTACHMENT_QUOTA_BYTES = 1 * 1024 * 1024 * 1024; // 1GB

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
