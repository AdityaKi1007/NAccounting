import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { requireActiveContext } from "@/lib/session";
import { getEntity } from "@/lib/entities";
import PageHeader from "@/components/crud/PageHeader";
import CustomerForm from "@/components/crud/CustomerForm";

export default async function CustomerFormPage({ id }: { id?: string }) {
  const entity = getEntity("customers");
  if (!entity) notFound();

  const ctx = await requireActiveContext();

  const accountRows = await query<{ id: string; name: string; code: string | null }>(
    `SELECT id, name, code FROM accounts WHERE organization_id = $1 ORDER BY name ASC`,
    [ctx.orgId]
  );
  const accountOptions = accountRows.map((r) => ({
    value: r.id,
    label: r.code ? `${r.code} - ${r.name}` : r.name,
  }));

  let initial:
    | {
        header: Record<string, unknown>;
        contacts: {
          key: string;
          salutation: string;
          first_name: string;
          last_name: string;
          email: string;
          work_phone: string;
          mobile: string;
          designation: string;
          department: string;
        }[];
      }
    | null = null;

  if (id) {
    const header = await queryOne(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [
      ctx.orgId,
      id,
    ]);
    if (!header) notFound();

    const contactRows = await query<Record<string, unknown>>(
      `SELECT * FROM customer_contacts WHERE customer_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    const contacts = contactRows.map((c, i) => ({
      key: `existing-${String(c.id ?? i)}`,
      salutation: String(c.salutation ?? ""),
      first_name: String(c.first_name ?? ""),
      last_name: String(c.last_name ?? ""),
      email: String(c.email ?? ""),
      work_phone: String(c.work_phone ?? ""),
      mobile: String(c.mobile ?? ""),
      designation: String(c.designation ?? ""),
      department: String(c.department ?? ""),
    }));

    initial = { header: header as Record<string, unknown>, contacts };
  }

  return (
    <div>
      <PageHeader
        title={id ? "Edit Customer" : "New Customer"}
        subtitle={id ? "Update this customer" : "Add a new customer"}
      />
      <div className="m-6 max-w-4xl">
        <CustomerForm accountOptions={accountOptions} initial={initial} recordId={id} />
      </div>
    </div>
  );
}
