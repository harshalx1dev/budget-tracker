import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories, listTransactions } from "@/server/services/ledger";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

export const metadata = { title: "transactions" };

export default async function Transactions() {
  const { workspace } = await requireWorkspace();
  const [accounts, categories, rows] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 200),
  ]);
  return (
    <div className="settle stack">
      <h1>transactions</h1>
      <TransactionForm accounts={accounts} categories={categories} homeCurrency={workspace.homeCurrency} />
      <section className="well" aria-label="ledger">
        <LedgerTable rows={rows} empty="Nothing here yet. Add an entry above." />
      </section>
    </div>
  );
}
