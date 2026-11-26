import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { safeToSpend } from "@/server/services/planner";
import { listAccounts, listCategories, listTransactions, monthSummary } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { thisMonth } from "@/lib/dates";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

async function OverviewLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [accounts, categories, recent, month, sts] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 8),
    monthSummary(workspace.id, home, thisMonth()),
    safeToSpend(workspace.id, home),
  ]);
  // Balances are summed only for accounts in the home currency; others need FX rates (later phase).
  const balance = accounts.filter((a) => a.currency === home).reduce((s, a) => s + a.balanceMinor, 0);
  const hasForeign = accounts.some((a) => a.currency !== home);
  const stats = [
    { label: "balance", value: formatMinor(balance, home) },
    { label: "safe to spend", value: formatMinor(sts.safe, home), note: sts.safe > 0 ? `${formatMinor(sts.perDay, home)} a day until ${sts.incomeKnown && sts.nextIncome ? "payday" : "month end"}` : "nothing spare yet" },
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
            {"note" in s && s.note ? <p className="label">{s.note}</p> : null}
          </div>
        ))}
      </section>
      {hasForeign && <p className="label">balance counts {home} accounts only until exchange rates arrive.</p>}
      <section aria-labelledby="add-h" className="stack-sm">
        <h2 id="add-h">quick add</h2>
        <QuickAddBar />
        <details className="more">
          <summary className="pill">full form</summary>
        <TransactionForm accounts={accounts} categories={categories} homeCurrency={home} />
        </details>
      </section>
      <section className="well" aria-labelledby="ledger-h">
        <h2 id="ledger-h" className="well__head">recent</h2>
        <LedgerTable rows={recent} empty="Add your first entry above. Income and spending land here, newest first." />
      </section>
    </div>
  );
}

export default function Overview() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewLoader />
    </Suspense>
  );
}
