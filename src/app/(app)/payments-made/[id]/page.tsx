import { notFound } from "next/navigation";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query, queryOne } from "@/lib/db";
import { getOrgLogoDataUri } from "@/lib/s3";
import PaymentMadeDetailView from "@/components/payments/PaymentMadeDetailView";

interface PaymentRow {
  id: string;
  payment_number: string;
  vendor_id: string | null;
  payment_date: string;
  amount: string;
  payment_mode: string;
  bank_account_id: string | null;
  reference_number: string | null;
  status: string;
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

interface VendorRow {
  display_name: string;
  company_name: string | null;
  billing_address: string | null;
}

interface BankAccountRow {
  account_name: string;
}

interface AllocationRow {
  bill_id: string;
  bill_number: string;
  bill_total: string;
  amount: string;
}

interface OrgRow {
  name: string;
  address_street1: string | null;
  address_street2: string | null;
  address_city: string | null;
  address_state: string | null;
  location_country: string | null;
  currency: string;
}

interface JournalLineRow {
  account_name: string;
  debit: string;
  credit: string;
}

export default async function PaymentMadeDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "payments-made", "view");

  const payment = await queryOne<PaymentRow>(
    `SELECT id, payment_number, vendor_id, payment_date, amount, payment_mode,
            bank_account_id, reference_number, status, notes, project_id, unit_id
     FROM payments_made WHERE id = $1 AND organization_id = $2`,
    [params.id, ctx.orgId]
  );
  if (!payment) notFound();

  const [vendor, bankAccount, allocations, journalLines, org, logoDataUri, project, unit] = await Promise.all([
    payment.vendor_id
      ? queryOne<VendorRow>(`SELECT display_name, company_name, billing_address FROM vendors WHERE id = $1 AND organization_id = $2`, [
          payment.vendor_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    payment.bank_account_id
      ? queryOne<BankAccountRow>(`SELECT account_name FROM bank_accounts WHERE id = $1 AND organization_id = $2`, [
          payment.bank_account_id,
          ctx.orgId,
        ])
      : Promise.resolve(null),
    query<AllocationRow>(
      `SELECT bpa.bill_id, b.bill_number, b.total AS bill_total, bpa.amount
       FROM bill_payment_allocations bpa
       JOIN bills b ON b.id = bpa.bill_id
       WHERE bpa.payment_made_id = $1
       ORDER BY b.bill_date ASC`,
      [payment.id]
    ),
    query<JournalLineRow>(
      `SELECT a.name AS account_name, jl.debit, jl.credit
       FROM journal_lines jl
       JOIN manual_journals mj ON mj.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE mj.payment_made_id = $1
       ORDER BY jl.id ASC`,
      [payment.id]
    ),
    queryOne<OrgRow>(
      `SELECT name, address_street1, address_street2, address_city, address_state, location_country, currency
       FROM organizations WHERE id = $1`,
      [ctx.orgId]
    ),
    getOrgLogoDataUri(ctx.orgId),
    payment.project_id
      ? queryOne<ProjectRow>(`SELECT id, name FROM projects WHERE id = $1 AND organization_id = $2`, [payment.project_id, ctx.orgId])
      : Promise.resolve(null),
    payment.unit_id
      ? queryOne<UnitRow>(`SELECT id, name FROM inventory WHERE id = $1 AND organization_id = $2`, [payment.unit_id, ctx.orgId])
      : Promise.resolve(null),
  ]);

  return (
    <PaymentMadeDetailView
      payment={{
        id: payment.id,
        paymentNumber: payment.payment_number,
        paymentDate: payment.payment_date,
        amount: Number(payment.amount),
        paymentMode: payment.payment_mode,
        referenceNumber: payment.reference_number,
        status: payment.status,
        notes: payment.notes,
      }}
      vendorName={vendor ? (vendor.company_name ? `${vendor.display_name} (${vendor.company_name})` : vendor.display_name) : "-"}
      vendorAddressLines={vendor?.billing_address?.split("\n").filter(Boolean) ?? []}
      bankAccountName={bankAccount?.account_name ?? "-"}
      org={{
        name: org?.name ?? "",
        addressLines: [org?.address_street1, org?.address_street2, org?.address_city, org?.address_state, org?.location_country].filter(
          (v): v is string => Boolean(v && v.trim())
        ),
        logoDataUri,
      }}
      allocations={allocations.map((a) => ({
        billId: a.bill_id,
        billNumber: a.bill_number,
        billTotal: Number(a.bill_total),
        amount: Number(a.amount),
      }))}
      journalLines={journalLines.map((j) => ({
        accountName: j.account_name,
        debit: Number(j.debit),
        credit: Number(j.credit),
      }))}
      currency={org?.currency ?? "AED"}
      project={project ? { id: project.id, name: project.name } : null}
      unit={unit ? { id: unit.id, name: unit.name } : null}
    />
  );
}
