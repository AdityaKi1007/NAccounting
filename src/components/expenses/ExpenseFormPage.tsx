import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import PageHeader from "@/components/crud/PageHeader";
import ExpenseForm, { type ExpenseOption } from "@/components/expenses/ExpenseForm";

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras al-Khaimah", "Fujairah"];

/** Bespoke create/edit page for Expenses — see ExpenseForm.tsx's own comment for why this
 * isn't the generic EntityFormPage. Mirrors CustomerFormPage.tsx's shape: this server
 * component loads every dropdown's options plus the existing row (when editing) and hands
 * them to the client form as plain props. */
export default async function ExpenseFormPage({ id }: { id?: string }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "expenses", "write");

  const [accountRows, bankRows, vendorRows, customerRows, taxRateRows, org] = await Promise.all([
    query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM accounts
       WHERE organization_id = $1 AND is_active AND type IN ('expense', 'cost_of_goods_sold')
       ORDER BY code NULLS LAST, name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; account_name: string }>(
      `SELECT id, account_name FROM bank_accounts WHERE organization_id = $1 ORDER BY account_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM vendors WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM customers WHERE organization_id = $1 ORDER BY display_name ASC`,
      [ctx.orgId]
    ),
    query<{ id: string; name: string; rate: string }>(
      `SELECT id, name, rate FROM tax_rates WHERE organization_id = $1 ORDER BY created_at ASC`,
      [ctx.orgId]
    ),
    queryOne<{ currency: string; address_state: string | null }>(
      `SELECT currency, address_state FROM organizations WHERE id = $1`,
      [ctx.orgId]
    ),
  ]);

  const accountOptions: ExpenseOption[] = accountRows.map((r) => ({
    value: r.id,
    label: r.code ? `${r.code} - ${r.name}` : r.name,
  }));
  const bankOptions: ExpenseOption[] = bankRows.map((r) => ({ value: r.id, label: r.account_name }));
  const vendorOptions: ExpenseOption[] = vendorRows.map((r) => ({ value: r.id, label: r.display_name }));
  const customerOptions: ExpenseOption[] = customerRows.map((r) => ({ value: r.id, label: r.display_name }));
  const taxRateOptions = taxRateRows.map((r) => ({ value: r.id, label: r.name, rate: Number(r.rate) }));

  // The org's own registered Emirate (Company Profile's "State/Emirate" field) doubles as a
  // sensible Place of Supply default for a brand-new expense — same idea as Zoho pre-filling
  // it from the business's own address. Only used on create; editing keeps the saved value.
  const defaultPlaceOfSupply = EMIRATES.includes(org?.address_state ?? "") ? (org?.address_state as string) : "";

  let initial: Record<string, unknown> | null = null;
  if (id) {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT * FROM expenses WHERE id = $1 AND organization_id = $2`,
      [id, ctx.orgId]
    );
    if (!row) notFound();
    initial = row;
  }

  return (
    <div>
      <PageHeader title={id ? "Edit Expense" : "Record Expense"} />
      <div className="m-6 max-w-3xl">
        <ExpenseForm
          recordId={id}
          initial={initial}
          currency={org?.currency ?? "AED"}
          defaultPlaceOfSupply={defaultPlaceOfSupply}
          accountOptions={accountOptions}
          bankOptions={bankOptions}
          vendorOptions={vendorOptions}
          customerOptions={customerOptions}
          taxRateOptions={taxRateOptions}
        />
      </div>
    </div>
  );
}
