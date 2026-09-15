import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
  Package,
  ShoppingCart,
  ShoppingBag,
  Clock,
  Landmark,
  Users,
  BarChart3,
  FolderOpen,
  Building2,
  UploadCloud,
} from "lucide-react";

export interface NavChild {
  label: string;
  href: string;
}

export interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  children?: NavChild[];
}

export const nav: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Billing Items",
    icon: Package,
    children: [
      { label: "Items", href: "/items" },
      { label: "Pricing Engine", href: "/pricing-engine" },
    ],
  },
  {
    label: "Sales",
    icon: ShoppingCart,
    children: [
      { label: "Customers", href: "/customers" },
      { label: "Quotes", href: "/quotes" },
      { label: "Sales Orders", href: "/sales-orders" },
      { label: "Invoices", href: "/invoices" },
      { label: "Repeat Invoices", href: "/recurring-invoices" },
      { label: "Delivery Challans", href: "/delivery-challans" },
      { label: "Payments Received", href: "/payments-received" },
      { label: "Credit Notes", href: "/credit-notes" },
      { label: "Debit Notes", href: "/debit-notes" },
    ],
  },
  {
    label: "Buys",
    icon: ShoppingBag,
    children: [
      { label: "Vendors", href: "/vendors" },
      { label: "Purchase Orders", href: "/purchase-orders" },
      { label: "Expenses", href: "/expenses" },
      { label: "Recurring Expenses", href: "/recurring-expenses" },
      { label: "Bills", href: "/bills" },
      { label: "Recurring Bills", href: "/recurring-bills" },
      { label: "Payments Made", href: "/payments-made" },
      { label: "Vendor Credits", href: "/vendor-credits" },
    ],
  },
  { label: "Manage time", href: "/time-tracking", icon: Clock },
  { label: "Banks", href: "/banking", icon: Landmark },
  {
    label: "Property Master",
    icon: Building2,
    children: [
      { label: "Projects", href: "/projects" },
      { label: "Buildings", href: "/buildings" },
      { label: "Units", href: "/inventory" },
      { label: "Legal Entities", href: "/legal-entities" },
      { label: "Other Charges", href: "/other-charges" },
    ],
  },
  {
    label: "Accounting",
    icon: Users,
    children: [
      { label: "Manual Journals", href: "/manual-journals" },
      { label: "Bulk Update", href: "/bulk-update" },
      { label: "Currency Adjustments", href: "/currency-adjustments" },
      { label: "Chart of Accounts", href: "/chart-of-accounts" },
      { label: "Budgets", href: "/budgets" },
      { label: "Transaction Locking", href: "/transaction-locking" },
    ],
  },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Import", href: "/import", icon: UploadCloud },
];
