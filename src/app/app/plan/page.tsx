import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { ForecastChart } from "@/components/forecast-chart";
import { BufferForm } from "@/components/plan-forms";
import { requireWorkspace } from "@/server/session";
import { forecast, safeToSpend } from "@/server/services/planner";
import { formatMinor } from "@/lib/money";
import { SafeSwitch } from "@/components/safe-switch";
import { formatDay } from "@/lib/dates";

export const metadata = { title: "Plan" };

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

async function ForecastLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [sts, fc] = await Promise.all([safeToSpend(workspace.id, home), forecast(workspace.id, home, 6)]);
  const lowest = fc.rows.reduce((m, r) => (r.end < m.end ? r : m), fc.rows[0]);

  const until = sts.incomeKnown && sts.nextIncome ? `payday on ${formatDay(sts.nextIncome)}` : "the end of the month";
  const safeBlock = (safe: number, perDay: number, basis: string, rows: [string, number][]) => (
    <div className="sts">
      <div>
        <p className="label">{basis}, until {until}</p>
        <p className="figure" data-negative={safe < 0}>{formatMinor(safe, home)}</p>
        <p className="label">{safe > 0 ? `about ${formatMinor(perDay, home)} a day for ${sts.days} day${sts.days === 1 ? "" : "s"}` : "Nothing spare until the next payday"}</p>
      </div>
      <table className="ledger sts__break" aria-label="How this is worked out">
        <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{formatMinor(v, home)}</td></tr>)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="settle stack">
      <h1>Plan</h1>

      <section className="stack-sm" aria-labelledby="sts-h">
        <h2 id="sts-h">Safe to spend</h2>
        <div className="well well--cloth sts-card">
          <SafeSwitch
            month={safeBlock(sts.monthly.safe, sts.monthly.perDay, `Since ${formatDay(sts.monthly.cycleStart)}${sts.monthly.capped ? ", limited by what your accounts hold" : ""}`, [
              ["Received", sts.monthly.income], ["Already spent", -sts.monthly.spent], ["Moved to savings", -sts.monthly.saved],
              ["Bills and EMIs still due", -sts.dueOutflows], ["Set aside for goals", -sts.goalSetAside],
            ])}
            accounts={safeBlock(sts.safe, sts.perDay, "Everything your accounts can spare", [
              ["In your accounts", sts.balance], ["Bills and EMIs due before then", -sts.dueOutflows], ["Set aside for goals", -sts.goalSetAside], ["Your buffer", -sts.buffer],
            ])}
          />
        </div>
        {!sts.incomeKnown && <p className="label">No payday is planned yet. <Link href="/app/plan/commitments" className="link">Add your salary as a recurring item</Link> and this counts down to it.</p>}
        {sts.due.length > 0 && <p className="label">Due before then: {sts.due.map((d) => `${d.name} ${formatMinor(d.amountMinor, home)} on ${formatDay(d.dueOn)}`).join(", ")}.</p>}
        <div className="stack-sm">
          <p className="label">Buffer: money you want left untouched.</p>
          <BufferForm current={String(sts.buffer / 100)} />
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="fc-h">
        <h2 id="fc-h">Next six months</h2>
        {!fc.incomeKnown && <p className="label">The forecast has no income yet, so it only shows money going out. <Link href="/app/plan/commitments" className="link">Add your salary</Link>.</p>}
        <div className="well" style={{ padding: "var(--space-lg)" }}>
          <ForecastChart rows={fc.rows} currency={home} />
          {lowest.end < 0 && <p className="error" role="alert">Your balance goes below zero in {monthLabel(lowest.month)} on this plan.</p>}
        </div>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>Month</th><th className="num">Starts</th><th className="num">Income</th><th className="num">Bills and EMIs</th><th className="num">Everyday spending</th><th className="num">Ends</th></tr></thead>
            <tbody>
              {fc.rows.map((r) => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}</td>
                  <td className="num">{formatMinor(r.start, home)}</td>
                  <td className="num amt" data-kind="income">{formatMinor(r.income, home)}</td>
                  <td className="num">{formatMinor(-r.committed, home)}</td>
                  <td className="num">{formatMinor(-r.variable, home)}</td>
                  <td className="num"><strong>{formatMinor(r.end, home)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="label">
          Everyday spending uses your budget where a category has one, otherwise your average of the last few months ({formatMinor(fc.unbudgetedAvg, home)} a month for categories without a budget).
          {!fc.hasBudgets && " Set budgets to firm this up."} Accounts in other currencies are left out until exchange rates arrive.
        </p>
      </section>
    </div>
  );
}

export default function PlanPage() {
  return <Suspense fallback={<PageSkeleton />}><ForecastLoader /></Suspense>;
}
