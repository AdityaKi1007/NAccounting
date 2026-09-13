import { query } from "@/lib/db";
import { formatCurrency, titleCase } from "@/lib/format";

// Backend for the Topbar's global search box (see GlobalSearch.tsx). The box was previously
// pure decoration — a styled <input> with a hardcoded "Search in Customers" placeholder and no
// state, no fetch, no backend at all (see the "global search is not working" report). This is
// the first real implementation: one ILIKE-based query per entity type, run in parallel, each
// matching the entity's own document number plus its counterparty's name — so typing a
// customer's name surfaces that customer AND their invoices/sales orders/receipts, not just
// the customer record itself.

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchResultGroup {
  key: string;
  label: string;
  items: SearchResultItem[];
}

const RESULTS_PER_GROUP = 6;

// Escapes ILIKE's own metacharacters (% and _) so a literal "%" or "_" typed by the user (e.g.
// searching a discount "10%" reference) doesn't act as a wildcard — paired with `ESCAPE '\'` in
// every query below. The backslash itself is escaped first so a user-typed backslash doesn't
// break the escape sequence.
function likeParam(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

interface GroupDef {
  key: string;
  label: string;
  /** Module key from src/lib/modules.ts — gates this group by the caller's own module access,
   * same as the Sidebar nav (see getVisibleModuleKeys in module-access.ts). A member who can't
   * see Bills in the nav shouldn't find them through search either. */
  moduleKey: string;
  run: (orgId: string, like: string) => Promise<SearchResultItem[]>;
}

const GROUPS: GroupDef[] = [
  {
    key: "customers",
    label: "Customers",
    moduleKey: "customers",
    run: async (orgId, like) => {
      const rows = await query<{
        id: string;
        display_name: string;
        company_name: string | null;
        email: string | null;
        phone: string | null;
      }>(
        `SELECT id, display_name, company_name, email, phone
         FROM customers
         WHERE organization_id = $1 AND (
           display_name ILIKE $2 ESCAPE '\\' OR company_name ILIKE $2 ESCAPE '\\' OR
           email ILIKE $2 ESCAPE '\\' OR phone ILIKE $2 ESCAPE '\\'
         )
         ORDER BY display_name
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.display_name,
        subtitle: [r.company_name, r.email, r.phone].filter(Boolean).join(" · ") || "Customer",
        href: `/customers/${r.id}`,
      }));
    },
  },
  {
    key: "vendors",
    label: "Vendors",
    moduleKey: "vendors",
    run: async (orgId, like) => {
      const rows = await query<{
        id: string;
        display_name: string;
        company_name: string | null;
        email: string | null;
        phone: string | null;
      }>(
        `SELECT id, display_name, company_name, email, phone
         FROM vendors
         WHERE organization_id = $1 AND (
           display_name ILIKE $2 ESCAPE '\\' OR company_name ILIKE $2 ESCAPE '\\' OR
           email ILIKE $2 ESCAPE '\\' OR phone ILIKE $2 ESCAPE '\\'
         )
         ORDER BY display_name
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.display_name,
        subtitle: [r.company_name, r.email, r.phone].filter(Boolean).join(" · ") || "Vendor",
        href: `/vendors/${r.id}`,
      }));
    },
  },
  {
    key: "invoices",
    label: "Invoices",
    moduleKey: "invoices",
    run: async (orgId, like) => {
      const rows = await query<{
        id: string;
        invoice_number: string;
        customer_name: string | null;
        total: string;
        status: string;
      }>(
        `SELECT i.id, i.invoice_number, c.display_name AS customer_name, i.total, i.status
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.organization_id = $1 AND (
           i.invoice_number ILIKE $2 ESCAPE '\\' OR c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY i.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.invoice_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/invoices/${r.id}`,
      }));
    },
  },
  {
    key: "quotes",
    label: "Quotes",
    moduleKey: "quotes",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; quote_number: string; customer_name: string | null; total: string; status: string }>(
        `SELECT q.id, q.quote_number, c.display_name AS customer_name, q.total, q.status
         FROM quotes q
         LEFT JOIN customers c ON c.id = q.customer_id
         WHERE q.organization_id = $1 AND (
           q.quote_number ILIKE $2 ESCAPE '\\' OR c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY q.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.quote_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/quotes/${r.id}`,
      }));
    },
  },
  {
    key: "sales-orders",
    label: "Sales Orders",
    moduleKey: "sales-orders",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; so_number: string; customer_name: string | null; total: string; status: string }>(
        `SELECT so.id, so.so_number, c.display_name AS customer_name, so.total, so.status
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
         WHERE so.organization_id = $1 AND (
           so.so_number ILIKE $2 ESCAPE '\\' OR so.reference_number ILIKE $2 ESCAPE '\\' OR
           c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY so.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.so_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/sales-orders/${r.id}`,
      }));
    },
  },
  {
    key: "payments-received",
    label: "Payments Received",
    moduleKey: "payments-received",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; payment_number: string; customer_name: string | null; amount: string }>(
        `SELECT p.id, p.payment_number, c.display_name AS customer_name, p.amount
         FROM payments_received p
         LEFT JOIN customers c ON c.id = p.customer_id
         WHERE p.organization_id = $1 AND (
           p.payment_number ILIKE $2 ESCAPE '\\' OR p.reference_number ILIKE $2 ESCAPE '\\' OR
           c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY p.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.payment_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.amount)}`,
        href: `/payments-received/${r.id}`,
      }));
    },
  },
  {
    key: "credit-notes",
    label: "Credit Notes",
    moduleKey: "credit-notes",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; credit_note_number: string; customer_name: string | null; total: string; status: string }>(
        `SELECT cn.id, cn.credit_note_number, c.display_name AS customer_name, cn.total, cn.status
         FROM credit_notes cn
         LEFT JOIN customers c ON c.id = cn.customer_id
         WHERE cn.organization_id = $1 AND (
           cn.credit_note_number ILIKE $2 ESCAPE '\\' OR cn.reference_number ILIKE $2 ESCAPE '\\' OR
           c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY cn.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.credit_note_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/credit-notes/${r.id}`,
      }));
    },
  },
  {
    key: "debit-notes",
    label: "Debit Notes",
    moduleKey: "debit-notes",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; debit_note_number: string; customer_name: string | null; total: string; status: string }>(
        `SELECT dn.id, dn.debit_note_number, c.display_name AS customer_name, dn.total, dn.status
         FROM debit_notes dn
         LEFT JOIN customers c ON c.id = dn.customer_id
         WHERE dn.organization_id = $1 AND (
           dn.debit_note_number ILIKE $2 ESCAPE '\\' OR dn.reference_number ILIKE $2 ESCAPE '\\' OR
           c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY dn.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.debit_note_number,
        subtitle: `${r.customer_name ?? "No customer"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/debit-notes/${r.id}`,
      }));
    },
  },
  {
    key: "bills",
    label: "Bills",
    moduleKey: "bills",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; bill_number: string; vendor_name: string | null; total: string; status: string }>(
        `SELECT b.id, b.bill_number, v.display_name AS vendor_name, b.total, b.status
         FROM bills b
         LEFT JOIN vendors v ON v.id = b.vendor_id
         WHERE b.organization_id = $1 AND (
           b.bill_number ILIKE $2 ESCAPE '\\' OR b.order_number ILIKE $2 ESCAPE '\\' OR
           b.permit_number ILIKE $2 ESCAPE '\\' OR v.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY b.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.bill_number,
        subtitle: `${r.vendor_name ?? "No vendor"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/bills/${r.id}`,
      }));
    },
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    moduleKey: "purchase-orders",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; po_number: string; vendor_name: string | null; total: string; status: string }>(
        `SELECT po.id, po.po_number, v.display_name AS vendor_name, po.total, po.status
         FROM purchase_orders po
         LEFT JOIN vendors v ON v.id = po.vendor_id
         WHERE po.organization_id = $1 AND (
           po.po_number ILIKE $2 ESCAPE '\\' OR po.reference_number ILIKE $2 ESCAPE '\\' OR
           v.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY po.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.po_number,
        subtitle: `${r.vendor_name ?? "No vendor"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/purchase-orders/${r.id}`,
      }));
    },
  },
  {
    key: "payments-made",
    label: "Payments Made",
    moduleKey: "payments-made",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; payment_number: string; vendor_name: string | null; amount: string }>(
        `SELECT p.id, p.payment_number, v.display_name AS vendor_name, p.amount
         FROM payments_made p
         LEFT JOIN vendors v ON v.id = p.vendor_id
         WHERE p.organization_id = $1 AND (
           p.payment_number ILIKE $2 ESCAPE '\\' OR p.reference_number ILIKE $2 ESCAPE '\\' OR
           v.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY p.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.payment_number,
        subtitle: `${r.vendor_name ?? "No vendor"} · ${formatCurrency(r.amount)}`,
        href: `/payments-made/${r.id}`,
      }));
    },
  },
  {
    key: "vendor-credits",
    label: "Vendor Credits",
    moduleKey: "vendor-credits",
    run: async (orgId, like) => {
      const rows = await query<{ id: string; credit_note_number: string; vendor_name: string | null; total: string; status: string }>(
        `SELECT vc.id, vc.credit_note_number, v.display_name AS vendor_name, vc.total, vc.status
         FROM vendor_credits vc
         LEFT JOIN vendors v ON v.id = vc.vendor_id
         WHERE vc.organization_id = $1 AND (
           vc.credit_note_number ILIKE $2 ESCAPE '\\' OR vc.order_number ILIKE $2 ESCAPE '\\' OR
           vc.subject ILIKE $2 ESCAPE '\\' OR v.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY vc.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.credit_note_number,
        subtitle: `${r.vendor_name ?? "No vendor"} · ${formatCurrency(r.total)} · ${titleCase(r.status)}`,
        href: `/vendor-credits/${r.id}`,
      }));
    },
  },
  {
    key: "expenses",
    label: "Expenses",
    moduleKey: "expenses",
    run: async (orgId, like) => {
      const rows = await query<{
        id: string;
        expense_date: string;
        vendor_name: string | null;
        customer_name: string | null;
        amount: string;
        reference_number: string | null;
      }>(
        `SELECT e.id, e.expense_date, v.display_name AS vendor_name, c.display_name AS customer_name, e.amount, e.reference_number
         FROM expenses e
         LEFT JOIN vendors v ON v.id = e.vendor_id
         LEFT JOIN customers c ON c.id = e.customer_id
         WHERE e.organization_id = $1 AND (
           e.reference_number ILIKE $2 ESCAPE '\\' OR e.notes ILIKE $2 ESCAPE '\\' OR
           v.display_name ILIKE $2 ESCAPE '\\' OR c.display_name ILIKE $2 ESCAPE '\\'
         )
         ORDER BY e.created_at DESC
         LIMIT ${RESULTS_PER_GROUP}`,
        [orgId, like]
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.reference_number || `Expense (${r.vendor_name ?? r.customer_name ?? "Unassigned"})`,
        subtitle: `${r.vendor_name ?? r.customer_name ?? "No vendor/customer"} · ${formatCurrency(r.amount)}`,
        href: `/expenses/${r.id}`,
      }));
    },
  },
];

/**
 * Runs every applicable entity search in parallel and returns only the groups that found
 * something — the frontend renders one section per group with its own heading. `visibleModuleKeys`
 * comes from getVisibleModuleKeys(ctx) so a member who can't see a module in the nav can't find
 * its records through search either (same access boundary, not a separate one).
 */
export async function runGlobalSearch(
  orgId: string,
  rawQuery: string,
  visibleModuleKeys: Set<string>
): Promise<SearchResultGroup[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const like = likeParam(q);

  const applicable = GROUPS.filter((g) => visibleModuleKeys.has(g.moduleKey));
  const settled = await Promise.all(
    applicable.map(async (g) => ({ key: g.key, label: g.label, items: await g.run(orgId, like) }))
  );
  return settled.filter((g) => g.items.length > 0);
}
