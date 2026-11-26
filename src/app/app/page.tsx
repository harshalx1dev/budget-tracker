import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, PiggyBank, ShieldCheck } from "lucide-react";
import { Spark } from "@/components/spark";
import { monthlyTotals } from "@/server/services/reports";
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
  const [accounts, categories, recent, month, sts, key, summary, nw, trend] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 8),
    monthSummary(workspace.id, home, thisMonth()),
    safeToSpend(workspace.id, home),
    hasKey(user.id),
    getSummary(workspace.id, "month", thisMonth()),
    netWorthNow(workspace.id, home),
    monthlyTotals(workspace.id, home, thisMonth(), 6),
  ]);
  // Balances are summed only for accounts in the home currency; others need FX rates (later phase).
  const balance = accounts.filter((a) => a.currency === home && !isAssetType(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  const hasForeign = accounts.some((a) => a.currency !== home);
  const safePct = balance > 0 ? Math.max(0, Math.min(1, sts.safe / balance)) : 0;
  const safeNote = sts.safe > 0 ? `${formatMinor(sts.perDay, home)} a day until ${sts.incomeKnown && sts.nextIncome ? "payday" : "month end"}` : "Nothing spare yet";
  const nwNote = nw.assetsMinor > 0 ? `${formatMinor(nw.assetsMinor, home)} saved and invested` : "Add savings under Plan";

  return (
    <div className="settle stack">
      <h1>Overview</h1>
      <section className="stats" aria-label="Summary">
        <div className="stat stat--hero well well--cloth">
          <div className="stat__top"><p className="label">Safe to spend</p><span className="stat__icon"><ShieldCheck size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(sts.safe, home)}</p>
          <div className="meter" role="img" aria-label={`${Math.round(safePct * 100)}% of your balance is free to spend`}><div className="meter__fill" style={{ transform: `scaleX(${safePct})` }} /></div>
          <p className="label" style={{ marginTop: "var(--space-sm)" }}><span className="pulse" aria-hidden />{safeNote}</p>
        </div>
        <div className="stat well">
          <div className="stat__top"><p className="label">Balance</p><span className="stat__icon"><Landmark size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(balance, home)}</p>
        </div>
        <div className="stat well">
          <div className="stat__top"><p className="label">Net worth</p><span className="stat__icon"><PiggyBank size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(nw.netWorthMinor, home)}</p>
          <p className="label">{nwNote}</p>
        </div>
        <div className="stat well" data-tone="in">
          <div className="stat__top"><p className="label">In this month</p><span className="stat__icon"><ArrowDownLeft size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(month.income, home)}</p>
          <Spark values={trend.map((t) => t.income)} />
        </div>
        <div className="stat well" data-tone="out">
          <div className="stat__top"><p className="label">Out this month</p><span className="stat__icon"><ArrowUpRight size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(month.expense, home)}</p>
          <Spark values={trend.map((t) => t.expense)} />
        </div>
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
