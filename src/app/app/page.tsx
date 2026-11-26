import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { safeToSpend } from "@/server/services/planner";
import { AiButton } from "@/components/ai-bits";
import { summariseMonthAction } from "@/app/app/ai-actions";
import { hasKey } from "@/server/ai/gateway";
import { getSummary } from "@/server/services/ai-features";
import { listAccounts, listCategories, listTransactions, monthSummary } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { isAssetType } from "@/lib/savings";
import { netWorthNow } from "@/server/services/savings";
import { thisMonth } from "@/lib/dates";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

async function OverviewLoader() {
  const { user, workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [accounts, categories, recent, month, sts, key, summary, nw] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 8),
    monthSummary(workspace.id, home, thisMonth()),
    safeToSpend(workspace.id, home),
    hasKey(user.id),
    getSummary(workspace.id, "month", thisMonth()),
    netWorthNow(workspace.id, home),
  ]);
  // Balances are summed only for accounts in the home currency; others need FX rates (later phase).
  const balance = accounts.filter((a) => a.currency === home && !isAssetType(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  const hasForeign = accounts.some((a) => a.currency !== home);
  const stats = [
    { label: "Balance", value: formatMinor(balance, home) },
    { label: "Safe to spend", value: formatMinor(sts.safe, home), note: sts.safe > 0 ? `${formatMinor(sts.perDay, home)} a day until ${sts.incomeKnown && sts.nextIncome ? "payday" : "month end"}` : "Nothing spare yet" },
    { label: "Net worth", value: formatMinor(nw.netWorthMinor, home), note: nw.assetsMinor > 0 ? `${formatMinor(nw.assetsMinor, home)} saved and invested` : "Add savings under Plan" },
    { label: "In this month", value: formatMinor(month.income, home) },
    { label: "Out this month", value: formatMinor(month.expense, home) },
  ];

  return (
    <div className="settle stack">
      <h1>Overview</h1>
      <section className="stats" aria-label="Summary">
        {stats.map((s) => (
          <div key={s.label} className="stat well raised">
            <p className="label">{s.label}</p>
            <p className="figure">{s.value}</p>
            {"note" in s && s.note ? <p className="label">{s.note}</p> : null}
          </div>
        ))}
      </section>
      {hasForeign && <p className="label">Balance counts {home} accounts only until exchange rates arrive.</p>}
      <section aria-labelledby="add-h" className="stack-sm">
        <h2 id="add-h">Quick add</h2>
        <QuickAddBar />
        <details className="more">
          <summary className="pill">Full form</summary>
        <TransactionForm accounts={accounts} categories={categories} homeCurrency={home} />
        </details>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }} aria-labelledby="sum-h">
        <h2 id="sum-h">This month in words</h2>
        {summary ? <p className="prose-ai">{summary.body}</p> : <p className="label">A short AI write-up of how the month is going, built from your own totals.</p>}
        <AiButton label={summary ? "Refresh" : "Write this month up"} run={summariseMonthAction} enabled={Boolean(key)} />
      </section>
      <section className="well" aria-labelledby="ledger-h">
        <h2 id="ledger-h" className="well__head">Recent</h2>
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
