// Shared config for the Send Email feature (Invoices, Sales Orders, Purchase Orders,
// Payments Received) — see src/app/api/emails/route.ts (send/list), src/lib/email.ts (the
// SMTP wrapper), and src/components/emails/SendEmailModal.tsx / EmailsList.tsx (the shared
// UI these routes back). Client-safe (no node-only imports), same as src/lib/attachments.ts.

/** Every entityType this feature is wired up for, mapped to the real table its entity_id has
 * to exist in (and be scoped to the caller's organization_id) before we let anyone email it.
 * Deliberately an explicit whitelist rather than trusting whatever string the client sends —
 * sent_emails.entity_type/entity_id aren't real foreign keys (see the migration's comment),
 * so this is the only thing standing between a client-supplied entityType and an arbitrary
 * table name ending up in a SQL query. */
export const EMAIL_ENTITY_TABLES: Record<string, string> = {
  invoices: "invoices",
  "sales-orders": "sales_orders",
  "purchase-orders": "purchase_orders",
  "payments-received": "payments_received",
};

export type EmailEntityType = keyof typeof EMAIL_ENTITY_TABLES;

export function isEmailEntityType(value: string): value is EmailEntityType {
  return Object.prototype.hasOwnProperty.call(EMAIL_ENTITY_TABLES, value);
}

/** Which party (customer or vendor) each entity type's email gets filed under, and the
 * column on the entity's own row that points at it. Resolved server-side from the document
 * itself (see the route) rather than trusted from client input, so an email can never end up
 * logged under a customer/vendor other than the one the document actually belongs to. */
export const EMAIL_ENTITY_PARTY: Record<EmailEntityType, { partyType: "customer" | "vendor"; partyColumn: string }> = {
  invoices: { partyType: "customer", partyColumn: "customer_id" },
  "sales-orders": { partyType: "customer", partyColumn: "customer_id" },
  "purchase-orders": { partyType: "vendor", partyColumn: "vendor_id" },
  "payments-received": { partyType: "customer", partyColumn: "customer_id" },
};

/** Where a party_type resolves to for the ownership check — mirrors ATTACHMENT_ENTITY_TABLES'
 * reasoning above, one level up (party_type/party_id are polymorphic too). */
export const EMAIL_PARTY_TABLES: Record<string, string> = {
  customer: "customers",
  vendor: "vendors",
};

export type EmailPartyType = keyof typeof EMAIL_PARTY_TABLES;

export function isEmailPartyType(value: string): value is EmailPartyType {
  return Object.prototype.hasOwnProperty.call(EMAIL_PARTY_TABLES, value);
}

export const EMAIL_DOC_LABELS: Record<EmailEntityType, string> = {
  invoices: "Invoice",
  "sales-orders": "Sales Order",
  "purchase-orders": "Purchase Order",
  "payments-received": "Payment Receipt",
};

export function defaultEmailSubject(entityType: EmailEntityType, docNumber: string, orgName: string): string {
  return `${EMAIL_DOC_LABELS[entityType]} ${docNumber} from ${orgName}`;
}

export function defaultEmailBody(
  entityType: EmailEntityType,
  opts: { docNumber: string; orgName: string; partyName: string }
): string {
  const { docNumber, orgName, partyName } = opts;
  const greeting = `Dear ${partyName || "Sir/Madam"},`;
  const closing = `Regards,\n${orgName}`;
  switch (entityType) {
    case "invoices":
      return `${greeting}\n\nPlease find attached invoice ${docNumber}.\n\nThank you for your business.\n\n${closing}`;
    case "sales-orders":
      return `${greeting}\n\nPlease find attached sales order ${docNumber} for your reference.\n\n${closing}`;
    case "purchase-orders":
      return `${greeting}\n\nPlease find attached purchase order ${docNumber}. Kindly proceed accordingly.\n\n${closing}`;
    case "payments-received":
      return `${greeting}\n\nPlease find attached the receipt for payment ${docNumber}. Thank you for your payment.\n\n${closing}`;
    default:
      return `${greeting}\n\nPlease find attached ${docNumber}.\n\n${closing}`;
  }
}
