import { listRows } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import BankingClient from "@/components/banking/BankingClient";

export default async function BankingPage() {
  const ctx = await requireActiveContext();
  const rows = await listRows("bank-accounts", ctx.orgId);
  return <BankingClient rows={rows as never[]} />;
}
