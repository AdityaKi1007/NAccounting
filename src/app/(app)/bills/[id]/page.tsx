import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { type JournalLineData } from "@/components/accounting/JournalPanel";
import BillDetailView from "@/components/bills/BillDetailView";

interface BillRow {
  id: string;
  bill_number: string;
  vendor_id: string | null;
  bill_date: string;
  due_date: string | null;
  order_number: string | null;
  permit_number: string | null;
  subject: string | null;
  payment_terms: string;
  accounts_payable_account_id: string | null;
  status: string;
  subtotal: string;
  tax_total: string;
  total: string;
  balance_due: string;
  notes: string | null;
  project_id: string | null;
  unit_id: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
}

interface UnitRow {
  id: string;
  name: string;
}

interface LineRow {
  id: string;
  item_id: string | null;
  description: string | null;
  quantity: string;
  rate: string;
  amount: string;
  account_id: string | null;
  account_name: string | null;
  tax_rate_id: string | null;
  tax_name: string | null;
  tax_rate: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

interface PaymentRow {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: string;
}

interface PurchaseOrderRow {
  id: string;
  po_number: string;
  order_date: string;
  status: string;
}

/** Read-only detail view at /bills/[id] — reached by clicking the Bill # from the list, or
 * right after Save (see BillForm.tsx). Thin server wrapper: fetches everything, then hands off
 * to BillDetailView.tsx (a client component) for rendering + the interactive actions (Record
 * Payment, Void) that a pure server component can't own. */
export default async function BillDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "bills", "view");

  const bill = await queryOne<BillRow>(
    `SELECT id, bill_number, vendor_id, bill_date, due_date, order_number, permit_number, subject,
            payment_terms, accounts_payable_account_id, status, subtotal, tax_total, total, balance_due, notes,
            project_id, unit_id
     FROM bills WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!bill) notFound();

  const [vendor, apAccount, org, lines, payments, journalLines, project, unit, purchaseOrders] = await Promise.all([
    bill.vendor_id
      ? queryOne<{ id: string; display_name: string }>(`SELECT id, display_name FROM vendors WHERE id = $1 AND organization_id = $2`, [
          bill.vendor_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    bill.accounts_payable_account_id
      ? queryOne<{ name: string }>(`SELECT name FROM accounts WHERE id = $1 AND organization_id = $2`, [
          bill.accounts_payable_account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    queryOne<{ currency: string }>(`SELECT currency FROM organizations WHERE id = $1`, [ctx.orgId]),
    query<LineRow>(
      `SELECT bi.id, bi.item_id, bi.description, bi.quantity, bi.rate, bi.amount,
              bi.account_id, a.name AS account_name,
              bi.tax_rate_id, tr.name AS tax_name, tr.rate AS tax_rate,
              bi.customer_id, c.display_name AS customer_name
       FROM bill_items bi
       LEFT JOIN accounts a ON a.id = bi.account_id
       LEFT JOIN tax_rates tr ON tr.id = bi.tax_rate_id
       LEFT JOIN customers c ON c.id = bi.customer_id
       WHERE bi.bill_id = $1
       ORDER BY bi.id ASC`,
      [bill.id]
    ),
    query<PaymentRow>(
      `SELECT pm.id, pm.payment_number, pm.payment_date, bpa.amount
       FROM bill_payment_allocations bpa
       JOIN payments_made pm ON pm.id = bpa.payment_made_id
       WHERE bpa.bill_id = $1
       ORDER BY pm.payment_date ASC`,
      [bill.id]
    ),
    query<{ account_id: string; account_name: string; debit: string; credit: string }>(
      `SELECT a.id AS account_id, a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.bill_id = $1
       ORDER BY jl.id ASC`,
      [bill.id]
    ),
    bill.project_id
      ? queryOne<ProjectRow>(`SELECT id, name FROM projects WHERE id = $1 AND organization_id = $2`, [bill.project_id, ctx.orgId])
      : Promise.resolve(null),
    bill.unit_id
      ? queryOne<UnitRow>(`SELECT id, name FROM inventory WHERE id = $1 AND organization_id = $2`, [bill.unit_id, ctx.orgId])
      : Promise.resolve(null),
    // Purchase Order(s) this bill was converted from — see purchase_orders.converted_bill_id
    // and src/app/api/purchase-orders/[id]/convert-to-bill/route.ts. Queried as a list for
    // robustness even though in practice it's at most one today.
    query<PurchaseOrderRow>(
      `SELECT id, po_number, order_date, status FROM purchase_orders
       WHERE converted_bill_id = $1 AND organization_id = $2
       ORDER BY order_date ASC`,
      [bill.id, ctx.orgId]
    ),
  ]);

  const currency = org?.currency ?? "AED";
  const journal: JournalLineData[] = journalLines.map((j) => ({
    accountName: j.account_name,
    accountId: j.account_id,
    debit: Number(j.debit),
    credit: Number(j.credit),
  }));

  return (
    <BillDetailView
      bill={{
        id: bill.id,
        billNumber: bill.bill_number,
        vendorId: bill.vendor_id,
        billDate: bill.bill_date,
        dueDate: bill.due_date,
        orderNumber: bill.order_number,
        permitNumber: bill.permit_number,
        subject: bill.subject,
        paymentTerms: bill.payment_terms,
        status: bill.status,
        subtotal: Number(bill.subtotal),
        taxTotal: Number(bill.tax_total),
        total: Number(bill.total),
        balanceDue: Number(bill.balance_due),
        notes: bill.notes,
      }}
      vendor={vendor ? { id: vendor.id, displayName: vendor.display_name } : null}
      apAccountName={apAccount?.name ?? null}
      currency={currency}
      lines={lines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        amount: Number(l.amount),
        accountId: l.account_id,
        accountName: l.account_name,
        taxName: l.tax_name,
        taxRate: l.tax_rate ? Number(l.tax_rate) : null,
        customerId: l.customer_id,
        customerName: l.customer_name,
      }))}
      payments={payments.map((p) => ({
        id: p.id,
        paymentNumber: p.payment_number,
        paymentDate: p.payment_date,
        amount: Number(p.amount),
      }))}
      journalLines={journal}
      project={project ? { id: project.id, name: project.name } : null}
      unit={unit ? { id: unit.id, name: unit.name } : null}
      purchaseOrders={purchaseOrders.map((po) => ({
        id: po.id,
        poNumber: po.po_number,
        orderDate: po.order_date,
        status: po.status,
      }))}
    />
  );
}
