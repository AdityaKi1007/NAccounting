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
    | "roles-list"
    | "tax-settings"
    | "currencies-list"
    | "payment-terms-list"
    | "reminders"
    | "api-keys"
    | "number-series";
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
      { slug: "roles", label: "Roles", description: "Define what each role can see and do.", view: "roles-list" },
      { slug: "user-preferences", label: "User Preferences", description: "Personal display and notification preferences." },
    ],
  },
  {
    // A dedicated top-level group (matching the real Zoho Books "Taxes" section, which sits
    // beside Users & Roles rather than inside it) — previously this was a single "Taxes" item
    // buried under Users & Roles. Only "Tax Settings" is implemented here; "Tax Rates" (Active
    // Taxes) and "Other Taxes > Corporate Tax" from the reference screenshots are NOT built —
    // no field/behavior spec was given for those, so they're intentionally left as future scope
    // rather than guessed at. They can be added as further items in this same group later.
    slug: "taxes",
    label: "Taxes",
    icon: Percent,
    section: "organization",
    items: [
      {
        slug: "tax-settings",
        label: "Tax Settings",
        description: "VAT/tax registration details and return reporting period.",
        view: "tax-settings",
      },
    ],
  },
  {
    slug: "configurations",
    label: "Configurations",
    icon: SlidersHorizontal,
    section: "organization",
    items: [
      { slug: "general", label: "General", description: "Date format, time zone and organization defaults." },
      { slug: "currencies", label: "Currencies", description: "Currencies you transact in and exchange rates.", view: "currencies-list" },
      { slug: "payment-terms", label: "Payment Terms", description: "Default due-date terms for invoices and bills.", view: "payment-terms-list" },
      { slug: "opening-balances", label: "Opening Balances", description: "Starting balances when you switched to NeoAccountingZ." },
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
      { slug: "revenue-recognition", label: "Revenue Recognition", description: "Rules for when revenue is recognized." },
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
    slug: "integrations",
    label: "Integrations",
    icon: Plug,
    section: "module",
    items: [
      { slug: "api-keys", label: "API Keys", description: "Generate keys so third-party systems can send invoices, receipts, customers and sales orders over REST.", view: "api-keys" },
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
