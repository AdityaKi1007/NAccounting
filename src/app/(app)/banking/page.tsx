import { listRows } from "@/lib/crud";
import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import BankingClient from "@/components/banking/BankingClient";

export default async function BankingPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "banking", "view");
  const rows = await listRows("bank-accounts", ctx.orgId);
  return <BankingClient rows={rows as never[]} />;
}
