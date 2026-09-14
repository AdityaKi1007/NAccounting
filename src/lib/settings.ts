import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Users,
  SlidersHorizontal,
  Palette,
  Zap,
  FileText,
  CreditCard,
  ShoppingCart,
  Plug,
  Percent,
  History,
} from "lucide-react";

export interface SettingsItem {
  slug: string;
  label: string;
  description: string;
  /** Which built-in page renders this item; omit for a generic placeholder. */
  view?:
    | "company-profile"
    | "users-list"
    | "branding"
    | "tax-settings"
    | "tax-rates-list"
    | "tax-preferences"
    | "corporate-tax"
    | "currencies-list"
    | "payment-terms-list"
    | "reminders"
    | "api-keys"
    | "number-series"
    | "opening-balances"
    | "email-settings"
    | "file-storage"
    | "general-info"
    | "audit-logs"
    | "api-usage"
    | "revenue-recognition"
    | "access-matrix";
}

export interface SettingsGroup {
  slug: string;
  label: string;
  icon: LucideIcon;
  section: "organization" | "module";
  items: SettingsItem[];
}

export const settingsGroups: SettingsGroup[] = [
  {
    slug: "company",
    label: "Company",
    icon: Building2,
    section: "organization",
    items: [
      { slug: "profile", label: "Profile", description: "Name, address, registration details, industry, regional settings and report basis.", view: "company-profile" },
      { slug: "branding", label: "Branding", description: "Logo, brand color and document theme.", view: "branding" },
      { slug: "custom-domain", label: "Custom Domain", description: "Serve the customer portal from your own domain." },
      { slug: "locations", label: "Locations", description: "Manage multiple business locations or branches." },
      { slug: "ai-integration", label: "AI Integration", description: "Connect AI-assisted categorization and insights." },
      { slug: "manage-subscription", label: "Manage Subscription", description: "Plan, billing and invoices for this workspace." },
    ],
  },
  {
    slug: "users-roles",
    label: "Users & Roles",
    icon: Users,
    section: "organization",
    items: [
      { slug: "users", label: "Users", description: "Everyone with access to this organization.", view: "users-list" },
      { slug: "user-preferences", label: "User Preferences", description: "Personal display and notification preferences." },
      // Re-adds custom roles (retired 2026-09-13, schema never dropped) plus a new 10-level
      // Access Matrix (No Access, Read/Write/Full x Own/Team/All) replacing the old 3-state
      // View/Write grid — see claude/known-issues-local-env-addendum-access-matrix-2026-09-14.md.
      // Owner/Admin/Super Admin only, enforced both by hiding this page's content (page.tsx)
      // and server-side (adminOnly on the "roles" entity, plus the permissions PUT route).
      { slug: "access-matrix", label: "Access Matrix", description: "Define custom roles and what each can read, write or delete, object by object.", view: "access-matrix" },
    ],
  },
  {
    // A dedicated top-level group (matching the real Zoho Books "Taxes" section, which sits
    // beside Users & Roles rather than inside it) — previously this was a single "Taxes" item
    // buried under Users & Roles. Added 2026-09-10: Tax Rates, Tax Preferences and Corporate
    // Tax, rounding out the group to match the reference screenshots (EmaraTax isn't built —
    // it's a real UAE government e-invoicing integration, out of scope, not asked for). The
    // reference screenshots show Corporate Tax under its own "OTHER TAXES" sub-heading inside
    // a dedicated Taxes sidebar — this app's settings navigation doesn't have a per-group
    // sidebar at all (every group is a flat list of items reached via the main Settings page,
    // see settings/page.tsx), so Corporate Tax is listed here as a plain item instead of
    // introducing a new sidebar paradigm just for this one group; its own page still carries
    // an "Other Taxes" label in its description so the distinction isn't lost.
    slug: "taxes",
    label: "Taxes",
    icon: Percent,
    section: "organization",
    items: [
      {
        slug: "tax-rates",
        label: "Tax Rates",
        description: "The tax rates available when creating a transaction.",
        view: "tax-rates-list",
      },
      {
        slug: "tax-settings",
        label: "Tax Settings",
        description: "VAT/tax registration details and return reporting period.",
        view: "tax-settings",
      },
      {
        slug: "tax-preferences",
        label: "Tax Preferences",
        description: "Optional VAT calculation schemes, such as the Profit Margin Scheme.",
        view: "tax-preferences",
      },
      {
        slug: "corporate-tax",
        label: "Corporate Tax",
        description: "Other Taxes — corporate tax registration, rate and GL accounts.",
        view: "corporate-tax",
      },
    ],
  },
  {
    slug: "configurations",
    label: "Configurations",
    icon: SlidersHorizontal,
    section: "organization",
    items: [
      { slug: "general", label: "General", description: "Your plan, user and API limits, and organization defaults.", view: "general-info" },
      { slug: "currencies", label: "Currencies", description: "Currencies you transact in and exchange rates.", view: "currencies-list" },
      { slug: "payment-terms", label: "Payment Terms", description: "Default due-date terms for invoices and bills.", view: "payment-terms-list" },
      { slug: "opening-balances", label: "Opening Balances", description: "Starting balances when you switched to NeoAccounting.", view: "opening-balances" },
      { slug: "reminders", label: "Reminders", description: "Automatic payment reminder schedules.", view: "reminders" },
      { slug: "customer-portal", label: "Customer Portal", description: "What customers can see and do online." },
      { slug: "vendor-portal", label: "Vendor Portal", description: "What vendors can see and do online." },
    ],
  },
  {
    slug: "customization",
    label: "Customization",
    icon: Palette,
    section: "organization",
    items: [
      { slug: "transaction-number-series", label: "Transaction Number Series", description: "Numbering format for invoices, bills and more.", view: "number-series" },
      { slug: "pdf-templates", label: "PDF Templates", description: "Layout and branding of generated PDFs." },
      { slug: "email-notifications", label: "Email Notifications", description: "Templates for emails sent to customers and vendors." },
      { slug: "reporting-tags", label: "Reporting Tags", description: "Tag transactions for custom reporting." },
      { slug: "web-tabs", label: "Web Tabs", description: "Embed external links inside the app's navigation." },
    ],
  },
  {
    slug: "automation",
    label: "Automation",
    icon: Zap,
    section: "organization",
    items: [
      { slug: "workflow-rules", label: "Workflow Rules", description: "Trigger actions automatically on record changes." },
      { slug: "workflow-actions", label: "Workflow Actions", description: "Reusable actions your workflow rules can run." },
      { slug: "workflow-logs", label: "Workflow Logs", description: "History of every automated workflow run." },
      { slug: "schedules", label: "Schedules", description: "Time-based triggers for recurring automation." },
    ],
  },
  {
    slug: "general",
    label: "General",
    icon: FileText,
    section: "module",
    items: [
      { slug: "customers-and-vendors", label: "Customers and Vendors", description: "Default fields and settings for contacts." },
      { slug: "items", label: "Items", description: "Default units, warehouses and item settings." },
      {
        slug: "revenue-recognition",
        label: "Revenue Recognition",
        description: "Rules for when revenue is recognized.",
        view: "revenue-recognition",
      },
      { slug: "accountant", label: "Accountant", description: "Closing dates and accountant-only preferences." },
      { slug: "projects", label: "Projects", description: "Project tracking defaults." },
      { slug: "timesheet", label: "Timesheet", description: "Time entry rules for time tracking." },
    ],
  },
  {
    slug: "online-payments",
    label: "Online Payments",
    icon: CreditCard,
    section: "module",
    items: [
      { slug: "payment-gateways", label: "Payment Gateways", description: "Connect a gateway so customers can pay online." },
    ],
  },
  {
    slug: "sales-and-purchases",
    label: "Sales and Purchases",
    icon: ShoppingCart,
    section: "module",
    items: [
      { slug: "quotes", label: "Quotes", description: "Default terms and validity period for quotes." },
      { slug: "sales-orders", label: "Sales Orders", description: "Sales order defaults and approval flow." },
      { slug: "delivery-challans", label: "Delivery Challans", description: "Defaults for goods delivery documentation." },
      { slug: "invoices", label: "Invoices", description: "Default terms, footer notes and reminders." },
      { slug: "recurring-invoices", label: "Repeat Invoices", description: "Defaults for auto-generated invoices." },
      { slug: "payments-received", label: "Payments Received", description: "Default deposit account and payment modes." },
      { slug: "credit-notes", label: "Credit Notes", description: "Defaults for customer credit notes." },
      { slug: "delivery-notes", label: "Delivery Notes", description: "Defaults for delivery note documentation." },
      { slug: "packing-slips", label: "Packing Slips", description: "Defaults for packing slip documentation." },
      { slug: "expenses", label: "Expenses", description: "Default expense accounts and approval flow." },
      { slug: "recurring-expenses", label: "Recurring Expenses", description: "Defaults for auto-generated expenses." },
      { slug: "purchase-orders", label: "Purchase Orders", description: "Purchase order defaults and approval flow." },
      { slug: "bills", label: "Bills", description: "Default terms and approval flow for bills." },
      { slug: "recurring-bills", label: "Recurring Bills", description: "Defaults for auto-generated bills." },
      { slug: "payments-made", label: "Payments Made", description: "Default payment account and payment modes." },
      { slug: "vendor-credits", label: "Vendor Credits", description: "Defaults for vendor credit notes." },
    ],
  },
  {
    // Requested directly by the account owner: a place to see who changed what (Audit Logs,
    // Owner/Admin only — gated inside the page itself, same pattern as every other
    // canManage-gated settings view in this file) and a consolidated view of third-party API
    // usage (reusing the existing api_keys.request_count/last_used_at and api_usage_daily
    // counters rather than a new per-request log table).
    slug: "usages",
    label: "Usages",
    icon: History,
    section: "organization",
    items: [
      {
        slug: "audit-logs",
        label: "Audit Logs",
        description: "Who created, changed or deleted records, and what changed. Owner and Admin only.",
        view: "audit-logs",
      },
      {
        slug: "api-usage",
        label: "API Usage",
        description: "Request activity for your API keys, and today's usage against your daily limit.",
        view: "api-usage",
      },
    ],
  },
  {
    slug: "integrations",
    label: "Integrations",
    icon: Plug,
    section: "module",
    items: [
      { slug: "api-keys", label: "API Keys", description: "Generate keys so third-party systems can send invoices, receipts, customers and sales orders over REST.", view: "api-keys" },
      { slug: "email", label: "Email Settings", description: "Connect SMTP, SendGrid, or AWS SES so invoices, receipts and other emails send from your own address — one provider active at a time.", view: "email-settings" },
      { slug: "file-storage", label: "File Storage (S3)", description: "Connect an S3 bucket so file attachments across every module are stored there.", view: "file-storage" },
      { slug: "whatsapp", label: "WhatsApp", description: "Send invoices, reminders and receipts over WhatsApp." },
      { slug: "sms", label: "SMS", description: "Send payment reminders and alerts over SMS." },
    ],
  },
];

export function getSettingsGroup(slug: string) {
  return settingsGroups.find((g) => g.slug === slug);
}

export function getSettingsItem(groupSlug: string, itemSlug: string) {
  const group = getSettingsGroup(groupSlug);
  const item = group?.items.find((i) => i.slug === itemSlug);
  return group && item ? { group, item } : null;
}
