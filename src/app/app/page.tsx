import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories, listTransactions, monthSummary } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { thisMonth } from "@/lib/dates";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

export default async function Overview() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [accounts, categories, recent, month] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 8),
    monthSummary(workspace.id, home, thisMonth()),
  ]);
  // Balances are summed only for accounts in the home currency; others need FX rates (later phase).
  const balance = accounts.filter((a) => a.currency === home).reduce((s, a) => s + a.balanceMinor, 0);
  const hasForeign = accounts.some((a) => a.currency !== home);
  const stats = [
    { label: "balance", value: formatMinor(balance, home) },
    { label: "in this month", value: formatMinor(month.income, home) },
    { label: "out this month", value: formatMinor(month.expense, home) },
  ];

  return (
    <div className="settle stack">
      <h1>overview</h1>
      <section className="stats" aria-label="summary">
        {stats.map((s) => (
          <div key={s.label} className="stat well raised">
            <p className="label">{s.label}</p>
            <p className="figure">{s.value}</p>
          </div>
        ))}
      </section>
      {hasForeign && <p className="label">balance counts {home} accounts only until exchange rates arrive.</p>}
      <section aria-labelledby="add-h" className="stack-sm">
        <h2 id="add-h">add entry</h2>
        <TransactionForm accounts={accounts} categories={categories} homeCurrency={home} />
      </section>
      <section className="well" aria-labelledby="ledger-h">
        <h2 id="ledger-h" className="well__head">recent</h2>
        <LedgerTable rows={recent} empty="Add your first entry above. Income and spending land here, newest first." />
      </section>
    </div>
  );
}
