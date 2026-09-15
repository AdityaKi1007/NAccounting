import { requireActiveContext } from "@/lib/session";
import { requireModuleAccess } from "@/lib/module-access";
import { query } from "@/lib/db";
import ImportedTransactionsClient, { type ImportedTxnRow, type BankAccountOption, type CategoryOption } from "@/components/banking/ImportedTransactionsClient";

// Banks -> "Imported Transactions" — the review/categorize/post landing page for rows staged
// by the Import Statement wizard (StatementImportWizard.tsx / bank-statement-imports.ts).
// Nothing here has posted to the books until a category is picked and the row is posted.
export default async function ImportedTransactionsPage() {
  const ctx = await requireActiveContext();
  await requireModuleAccess(ctx, "banking", "view");

  const rows = await query<ImportedTxnRow>(
    `SELECT ibt.id, ibt.bank_account_id, ba.account_name AS bank_account_name, ibt.txn_date, ibt.description,
            ibt.reference, ibt.amount, ibt.direction, ibt.status, ibt.category_account_id, ibt.journal_id, ibt.created_at
     FROM imported_bank_transactions ibt
     JOIN bank_accounts ba ON ba.id = ibt.bank_account_id
     WHERE ibt.organization_id = $1
     ORDER BY ibt.txn_date DESC, ibt.created_at DESC
     LIMIT 500`,
    [ctx.orgId]
  );

  const bankAccountOptions = await query<BankAccountOption>(
    `SELECT id, account_name FROM bank_accounts WHERE organization_id = $1 ORDER BY account_name ASC`,
    [ctx.orgId]
  );

  const categoryOptions = await query<CategoryOption>(
    `SELECT id, name, type FROM accounts WHERE organization_id = $1 AND is_active ORDER BY name ASC`,
    [ctx.orgId]
  );

  return <ImportedTransactionsClient rows={rows} bankAccountOptions={bankAccountOptions} categoryOptions={categoryOptions} />;
}
