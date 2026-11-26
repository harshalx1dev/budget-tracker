import { Suspense } from "react";
import { Summary } from "@/components/summary";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { MonthlyChart } from "@/components/monthly-chart";
import { requireWorkspace } from "@/server/session";
import { monthlyTotals, spendingByCategory, topPayees } from "@/server/services/reports";
import { formatMinor } from "@/lib/money";
import { thisMonth } from "@/lib/dates";
import { savingsRate } from "@/lib/savings";
import { nextMonth } from "@/lib/planner";
import { addMonths } from "@/lib/dates";

export const metadata = { title: "Reports" };

const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

async function ReportsLoader({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const cur = thisMonth();
  const month = m && /^\d{4}-\d{2}$/.test(m) && m <= cur ? m : cur;
  const [totals, cats, payees] = await Promise.all([monthlyTotals(workspace.id, home, month, 6), spendingByCategory(workspace.id, home, month), topPayees(workspace.id, home, month)]);
  const spent = cats.reduce((s, c) => s + c.total, 0);
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);

  return (
    <div className="settle stack">
      <div className="head-row">
        <h1>Reports</h1>
        <nav className="subnav" aria-label="Month">
          <Link href={`/app/plan/reports?m=${prev}`} className="pill pill--outline">Earlier</Link>
          <span className="pill" aria-current="page">{label(month)}</span>
          {month < cur ? <Link href={`/app/plan/reports?m=${nextMonth(month)}`} className="pill pill--outline">Later</Link> : null}
        </nav>
      </div>

      <Summary figure={formatMinor(spent, home, { whole: true })} caption={`spent in ${label(month)}, against ${formatMinor(totals.find((r) => r.month === month)?.income ?? 0, home, { whole: true })} received`} />

      <section className="stack-sm" aria-labelledby="trend-h">
        <h2 id="trend-h">Income and spending, six months</h2>
        <div className="well" style={{ padding: "var(--space-lg)" }}><MonthlyChart rows={totals} currency={home} /></div>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Spending</th><th className="num">Kept</th><th className="num">Saved</th><th className="num">Savings rate</th></tr></thead>
            <tbody>
              {totals.map((r) => (
                <tr key={r.month}><td>{label(r.month)}</td><td className="num amt" data-kind="income">{formatMinor(r.income, home)}</td><td className="num">{formatMinor(r.expense, home)}</td><td className="num">{formatMinor(r.income - r.expense, home)}</td><td className="num">{formatMinor(r.saved, home)}</td><td className="num">{savingsRate(r.saved, r.income) ?? "—"}{savingsRate(r.saved, r.income) === null ? "" : "%"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="cat-h">
        <h2 id="cat-h">Where {label(month)} went</h2>
        {cats.length === 0 ? <div className="well empty"><h3>No spending this month</h3><p>Entries you add or import will show up here by category.</p></div> : (
          <ul className="well rows">
            {cats.map((c) => {
              const pct = spent > 0 ? Math.round((c.total / spent) * 100) : 0;
              return (
                <li key={c.name} className="row">
                  <div className="bar__head"><p className="row__title">{c.name}</p><p className="row__value">{formatMinor(c.total, home, { whole: true })} <span className="label">{pct}%</span></p></div>
                  <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${c.name} share of spending`}><div className="bar__fill" style={{ transform: `scaleX(${pct / 100})` }} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {payees.length > 0 && (
        <section className="stack-sm" aria-labelledby="pay-h">
          <h2 id="pay-h">Biggest payees</h2>
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Payee</th><th className="num">Times</th><th className="num">Total</th></tr></thead>
              <tbody>{payees.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num">{p.n}</td><td className="num">{formatMinor(p.total, home)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function Reports({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  return <Suspense fallback={<PageSkeleton />}><ReportsLoader searchParams={searchParams} /></Suspense>;
}
