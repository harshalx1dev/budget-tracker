import { Suspense } from "react";
import { ArrowDownLeft, ArrowUpRight, Landmark, PiggyBank, ShieldCheck } from "lucide-react";
import { FreeToSpend, FreeToSpendWorking } from "@/components/free-to-spend";
import { SetupSteps } from "@/components/setup-steps";
import { listLoans, listRecurring } from "@/server/services/commitments";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { safeToSpend } from "@/server/services/planner";
import { AiButton } from "@/components/ai-bits";
import { summariseMonthAction } from "@/app/app/ai-actions";
import { hasKey } from "@/server/ai/gateway";
import { getSummary } from "@/server/services/ai-features";
import { listAccounts, listCategories, listTransactions } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { isAssetType } from "@/lib/savings";
import { netWorthNow } from "@/server/services/savings";
import { formatDay, thisMonth } from "@/lib/dates";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

async function OverviewLoader() {
  const { user, workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [accounts, categories, recent, sts, key, summary, nw, rules, loans] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 8),
    safeToSpend(workspace.id, home),
    hasKey(user.id),
    getSummary(workspace.id, "month", thisMonth()),
    netWorthNow(workspace.id, home),
    listRecurring(workspace.id),
    listLoans(workspace.id),
  ]);
  // Balances are summed only for accounts in the home currency; others need FX rates (later phase).
  const balance = accounts.filter((a) => a.currency === home && !isAssetType(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  const hasForeign = accounts.some((a) => a.currency !== home);
  const steps = [
    { done: balance !== 0 || accounts.length > 1, title: "Add your accounts and what is in them", why: "Bank, cash, cards and wallets.", href: "/app/accounts" },
    { done: rules.some((r) => r.kind === "income"), title: "Tell it when your salary arrives", why: "So it can count down to payday.", href: "/app/plan/commitments" },
    { done: loans.length > 0 || rules.some((r) => r.kind === "expense"), title: "Add rent, EMIs and subscriptions", why: "These are held back before anything is called free.", href: "/app/plan/commitments", none: "I have none" },
  ];
  const setting = steps.some((st) => !st.done);
  // With nothing entered yet, a wall of zeros says less than the three steps do.
  const empty = setting && recent.length === 0 && balance === 0;
  const since = sts.monthly.fromPayday ? `since ${formatDay(sts.monthly.cycleStart)}` : "this month";
  const nwNote = nw.assetsMinor > 0 ? `${formatMinor(nw.assetsMinor, home)} saved and invested` : "Add savings under Plan";

  return (
    <div className="settle stack">
      <h1>Overview</h1>
      {setting && <SetupSteps steps={steps} />}
      {!empty && <>
      <section className="stats" aria-label="Summary">
        <div className="stat stat--hero well well--cloth">
          <div className="stat__top"><p className="label">Free to spend</p><span className="stat__icon"><ShieldCheck size={18} aria-hidden /></span></div>
          <FreeToSpend sts={sts} home={home} />
        </div>
        <div className="stat well">
          <div className="stat__top"><p className="label">Balance</p><span className="stat__icon"><Landmark size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(balance, home, { whole: true })}</p>
        </div>
        <div className="stat well">
          <div className="stat__top"><p className="label">Net worth</p><span className="stat__icon"><PiggyBank size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(nw.netWorthMinor, home, { whole: true })}</p>
          <p className="label">{nwNote}</p>
        </div>
        <div className="stat well" data-tone="in">
          <div className="stat__top"><p className="label">Money in {since}</p><span className="stat__icon"><ArrowDownLeft size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(sts.monthly.income, home, { whole: true })}</p>
        </div>
        <div className="stat well" data-tone="out">
          <div className="stat__top"><p className="label">Spent {since}</p><span className="stat__icon"><ArrowUpRight size={18} aria-hidden /></span></div>
          <p className="figure">{formatMinor(sts.monthly.spent, home, { whole: true })}</p>
        </div>
      </section>
      <FreeToSpendWorking sts={sts} home={home} />
      </>}
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
        <LedgerTable rows={recent} categories={categories} empty="Add your first entry above. Income and spending land here, newest first." />
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
