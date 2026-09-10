export interface ContactPersonInput {
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  work_phone?: string;
  mobile?: string;
  designation?: string;
  department?: string;
}

export interface CustomerHeaderInput {
  customer_type?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  display_name?: string;
  secondary_display_name?: string;
  email?: string;
  work_phone?: string;
  mobile?: string;
  language?: string;
  currency?: string;
  accounts_receivable_account_id?: string | null;
  opening_balance?: number | string;
  payment_terms?: string;
  portal_enabled?: boolean;
  billing_address?: string;
  shipping_address?: string;
  remarks?: string;
  is_active?: boolean;
}

const HEADER_COLUMNS = [
  "customer_type",
  "salutation",
  "first_name",
  "last_name",
  "company_name",
  "display_name",
  "secondary_display_name",
  "email",
  "work_phone",
  "mobile",
  "language",
  "currency",
  "accounts_receivable_account_id",
  "opening_balance",
  "payment_terms",
  "portal_enabled",
  "billing_address",
  "shipping_address",
  "remarks",
  "is_active",
] as const;

export function extractHeaderValues(input: CustomerHeaderInput) {
  const values: Record<string, unknown> = {};
  for (const col of HEADER_COLUMNS) {
    let v = input[col];
    if (v === undefined) continue;
    if (col === "accounts_receivable_account_id" && v === "") v = null;
    if (col === "opening_balance") v = v === "" || v === null || v === undefined ? 0 : Number(v);
    if (col === "portal_enabled" || col === "is_active") v = Boolean(v);
    values[col] = v;
  }
  return values;
}

export { HEADER_COLUMNS };
