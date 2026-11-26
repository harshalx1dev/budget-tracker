import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { MonthlyChart } from "@/components/monthly-chart";
import { requireWorkspace } from "@/server/session";
import { monthlyTotals, spendingByCategory, topPayees } from "@/server/services/reports";
import { formatMinor } from "@/lib/money";
import { thisMonth } from "@/lib/dates";
import { nextMonth } from "@/lib/planner";
import { addMonths } from "@/lib/dates";

export const metadata = { title: "reports" };

const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).toLowerCase();

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
        <h1>reports</h1>
        <nav className="subnav" aria-label="month">
          <Link href={`/app/plan/reports?m=${prev}`} className="pill pill--outline">earlier</Link>
          <span className="pill" aria-current="page">{label(month)}</span>
          {month < cur ? <Link href={`/app/plan/reports?m=${nextMonth(month)}`} className="pill pill--outline">later</Link> : null}
        </nav>
      </div>

      <section className="stack-sm" aria-labelledby="trend-h">
        <h2 id="trend-h">income and spending, six months</h2>
        <div className="well" style={{ padding: "var(--space-lg)" }}><MonthlyChart rows={totals} currency={home} /></div>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>month</th><th className="num">income</th><th className="num">spending</th><th className="num">kept</th></tr></thead>
            <tbody>
              {totals.map((r) => (
                <tr key={r.month}><td>{label(r.month)}</td><td className="num amt" data-kind="income">{formatMinor(r.income, home)}</td><td className="num">{formatMinor(r.expense, home)}</td><td className="num">{formatMinor(r.income - r.expense, home)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="cat-h">
        <h2 id="cat-h">where {label(month)} went</h2>
        {cats.length === 0 ? <div className="well empty"><h3>no spending this month</h3><p>Entries you add or import will show up here by category.</p></div> : (
          <ul className="bars">
            {cats.map((c) => {
              const pct = spent > 0 ? Math.round((c.total / spent) * 100) : 0;
              return (
                <li key={c.name} className="well bar">
                  <div className="bar__head"><p>{c.name}</p><p className="num">{formatMinor(c.total, home)} <span className="label">{pct}%</span></p></div>
                  <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${c.name} share of spending`}><div className="bar__fill" style={{ transform: `scaleX(${pct / 100})` }} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {payees.length > 0 && (
        <section className="stack-sm" aria-labelledby="pay-h">
          <h2 id="pay-h">biggest payees</h2>
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>payee</th><th className="num">times</th><th className="num">total</th></tr></thead>
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
