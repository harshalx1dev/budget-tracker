import { Suspense } from "react";
import { HandCoins, TrendingUp, Wallet } from "lucide-react";
import { Summary } from "@/components/summary";
import { PageSkeleton } from "@/components/page-skeleton";
import { ForecastChart } from "@/components/forecast-chart";
import { AssetForm, DepositForm, EmergencyForm, MaturityButtons, ValuationForm } from "@/components/savings-forms";
import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";
import { emergencyFund, listAssets, listDeposits, listSnapshots, netWorthNow } from "@/server/services/savings";
import { monthlyTotals } from "@/server/services/reports";
import { formatMinor } from "@/lib/money";
import { formatDay, formatDayYear, thisMonth } from "@/lib/dates";
import { isAssetType, savingsRate, TYPE_LABELS } from "@/lib/savings";

export const metadata = { title: "Savings" };

async function SavingsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [nw, assets, deposits, ef, snaps, accts, totals] = await Promise.all([
    netWorthNow(workspace.id, home), listAssets(workspace.id), listDeposits(workspace.id), emergencyFund(workspace.id),
    listSnapshots(workspace.id, 12), listAccounts(workspace.id), monthlyTotals(workspace.id, home, thisMonth(), 3),
  ]);
  const spendable = accts.filter((a) => !isAssetType(a.type) && a.type !== "card" && a.currency === home);
  const homeAssets = assets.filter((a) => a.currency === home);
  // History from the monthly snapshots, with this month always showing the live figure.
  const trend = [...snaps.filter((s) => s.month !== thisMonth()).map((s) => ({ month: s.month, end: s.liquidMinor + s.assetsMinor - s.liabilitiesMinor })), { month: thisMonth(), end: nw.netWorthMinor }];
  const now = totals.at(-1)!;
  const rate = savingsRate(now.saved, now.income);
  const invested = homeAssets.reduce((s, a) => s + a.investedMinor, 0);

  return (
    <div className="settle stack">
      <h1>Savings</h1>
      <Summary figure={formatMinor(nw.netWorthMinor, home, { whole: true })} caption="net worth: your accounts plus savings, less loans owed" />
      <dl className="trio">
        <div><dt><Wallet size={16} aria-hidden />In your accounts</dt><dd>{formatMinor(nw.liquidMinor, home, { whole: true })}</dd></div>
        <div><dt><TrendingUp size={16} aria-hidden />Saved and invested</dt><dd>{formatMinor(nw.assetsMinor, home, { whole: true })}</dd></div>
        <div><dt><HandCoins size={16} aria-hidden />Loans still owed</dt><dd>{formatMinor(nw.liabilitiesMinor, home, { whole: true })}</dd></div>
      </dl>
      {nw.loansWithoutBalance > 0 && <p className="label">{nw.loansWithoutBalance === 1 ? "One loan isn’t" : `${nw.loansWithoutBalance} loans aren’t`} counted because the amount still owed is unknown. Add it on the loan to include {nw.loansWithoutBalance === 1 ? "it" : "them"}.</p>}
      <p className="label">
        {now.saved < 0 ? `This month you took ${formatMinor(-now.saved, home)} out of savings and investments.`
          : rate === null ? "Add your salary to see your savings rate."
          : `This month you moved ${formatMinor(now.saved, home)} into savings and investments, ${rate}% of your income.`}
      </p>
      {trend.length > 1 && (
        <div className="well" style={{ padding: "var(--space-lg)" }}>
          <h2 className="well__head" style={{ padding: 0, marginBottom: "var(--space-sm)" }}>Net worth by month</h2>
          <ForecastChart rows={trend} currency={home} />
        </div>
      )}

      <section className="stack-sm" aria-labelledby="ef-h">
        <h2 id="ef-h">Emergency fund</h2>
        <div className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
          {ef.known ? (
            <>
              <p className="figure figure--s">{ef.coveredMonths} of {ef.months} months covered</p>
              <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={ef.pct} aria-label="Emergency fund progress"><div className="bar__fill" style={{ transform: `scaleX(${ef.pct / 100})` }} /></div>
              <p className="label">Target {formatMinor(ef.targetMinor, home)}, which is {ef.months} months of {formatMinor(ef.essentialMonthlyMinor, home)} a month in essentials. {ef.shortfallMinor > 0 ? `${formatMinor(ef.shortfallMinor, home)} to go.` : "You are there."}</p>
            </>
          ) : (
            <p className="label">Your essential monthly spending is not known yet. It comes from entries in categories marked essential (rent, groceries, bills, EMIs, transport, health) over the last few months.</p>
          )}
          <EmergencyForm months={ef.months} accountId={ef.accountId} assets={homeAssets.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="inv-h">
        <h2 id="inv-h">Savings and investments</h2>
        {homeAssets.length === 0 ? (
          <div className="well empty"><h3>Nothing here yet</h3><p>Add a mutual fund, stocks, PPF or a savings account below. Move money into it with a transfer, or mark a SIP as saving under Commitments.</p></div>
        ) : (
          <>
            <p className="label">{formatMinor(invested, home)} invested, worth {formatMinor(nw.assetsMinor, home)} today.</p>
            <ul className="bars">
              {homeAssets.map((a) => (
                <li key={a.id} className="well bar">
                  <div className="bar__head">
                    <p>{a.name} <span className="label">{TYPE_LABELS[a.type]}</span></p>
                    <p className="num">{formatMinor(a.valueMinor, home)}</p>
                  </div>
                  <p className="label">
                    Invested {formatMinor(a.investedMinor, home)}
                    {a.investedMinor > 0 ? `, ${a.gainMinor >= 0 ? "up" : "down"} ${formatMinor(Math.abs(a.gainMinor), home)} (${Math.round((a.gainMinor / a.investedMinor) * 1000) / 10}%)` : ""}
                    {a.valuedOn ? `. Value as of ${formatDay(a.valuedOn)}.` : a.type === "fd" ? ". Value estimated from the interest rate." : ". No value entered yet, so this shows what you put in."}
                  </p>
                  {a.type !== "fd" && <ValuationForm accountId={a.id} />}
                </li>
              ))}
            </ul>
          </>
        )}
        <details className="more"><summary className="btn btn--secondary">Add a savings or investment account</summary><AssetForm /></details>
      </section>

      <section className="stack-sm" aria-labelledby="fd-h">
        <h2 id="fd-h">Fixed deposits</h2>
        {deposits.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Deposit</th><th className="num">Deposited</th><th className="num">Worth now</th><th>Matures</th><th className="num">Pays out</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name} <span className="label">{Number(d.annualRatePct)}%</span></td>
                    <td className="num">{formatMinor(d.principalMinor, home)}</td>
                    <td className="num">{formatMinor(d.valueNowMinor, home)}</td>
                    <td>{d.matured ? <span className="error">Matured {formatDayYear(d.maturityOn)}</span> : `${formatDayYear(d.maturityOn)}, in ${d.daysLeft} days`}</td>
                    <td className="num">{formatMinor(d.maturityMinor, home)}</td>
                    <td><MaturityButtons id={d.id} matured={d.matured} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="label">A deposit that matures shows up in your forecast as money coming back on its date, which also helps the wishlist plan.</p>
        <details className="more"><summary className="btn btn--secondary">Add a fixed deposit</summary><DepositForm payoutAccounts={spendable.map((a) => ({ id: a.id, name: a.name }))} /></details>
      </section>
    </div>
  );
}

export default function Savings() {
  return <Suspense fallback={<PageSkeleton />}><SavingsLoader /></Suspense>;
}
