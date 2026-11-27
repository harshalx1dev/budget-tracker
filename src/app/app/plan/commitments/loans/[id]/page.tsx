import { Suspense } from "react";
import { Banknote, CalendarClock, Percent } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { ArchiveButton, RevisionForm } from "@/components/commit-forms";
import { requireWorkspace } from "@/server/session";
import { getLoan, loanSchedule } from "@/server/services/commitments";
import { formatMinor } from "@/lib/money";
import { formatDayYear, todayISO } from "@/lib/dates";

export const metadata = { title: "Loan" };

async function LoanLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const found = await getLoan(workspace.id, id);
  if (!found) notFound();
  const { loan, revisions } = found;
  const home = workspace.homeCurrency;
  const { rows, stalled } = loanSchedule(loan, revisions);
  const today = todayISO();
  const hasBalance = loan.principalMinor !== null;
  const totalInterest = hasBalance ? rows.reduce((s, r) => s + (r.interestMinor ?? 0), 0) : null;

  return (
    <div className="settle stack">
      <div className="head-row"><h1>{loan.name}</h1><Link href="/app/plan/commitments" className="btn btn--secondary">All bills and EMIs</Link></div>
      <section className="stats" aria-label="Loan summary">
        <div className="stat well"><div className="stat__top"><p className="label">EMI</p><span className="stat__icon"><Banknote size={18} aria-hidden /></span></div><p className="figure">{formatMinor(loan.emiMinor, home)}</p></div>
        <div className="stat well"><div className="stat__top"><p className="label">Instalments left</p><span className="stat__icon"><CalendarClock size={18} aria-hidden /></span></div><p className="figure">{rows.filter((r) => r.dueOn >= today).length}</p></div>
        <div className="stat well"><div className="stat__top"><p className="label">{hasBalance ? "Interest still to pay" : "Last instalment"}</p><span className="stat__icon"><Percent size={18} aria-hidden /></span></div><p className="figure">{totalInterest !== null ? formatMinor(totalInterest, home) : rows.at(-1) ? formatDayYear(rows.at(-1)!.dueOn) : "—"}</p></div>
      </section>
      {stalled && <p role="alert" className="error">At this EMI and rate the loan never pays down. Check the EMI or the rate.</p>}
      {!hasBalance && <p className="label">Add the balance left and the rate to the loan to see the interest and principal split. Everything else, including the plan, already works.</p>}

      <section className="stack-sm" aria-labelledby="rev-h">
        <h2 id="rev-h">Changes over time</h2>
        <p className="label">EMIs shift when rates move or you prepay. A change applies from its date onward and the past stays as it was.</p>
        <RevisionForm loanId={loan.id} hasBalance={hasBalance} />
        {revisions.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>From</th><th>Change</th><th>Note</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDayYear(r.effectiveOn)}</td>
                    <td>{r.kind === "emi" ? `EMI becomes ${formatMinor(r.emiMinor ?? 0, home)}` : r.kind === "rate" ? `rate becomes ${Number(r.ratePct)}%` : `prepaid ${formatMinor(r.amountMinor ?? 0, home)}`}</td>
                    <td>{r.note ?? ""}</td>
                    <td><ArchiveButton kind="revision" id={r.id} label="Remove this change" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="sch-h">
        <h2 id="sch-h">Schedule</h2>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>#</th><th>Due</th><th className="num">Payment</th>{hasBalance && <><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance</th></>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} data-past={r.dueOn < today}>
                  <td>{r.n}</td><td>{formatDayYear(r.dueOn)}</td><td className="num">{formatMinor(r.amountMinor, home)}</td>
                  {hasBalance && <><td className="num">{formatMinor(r.interestMinor ?? 0, home)}</td><td className="num">{formatMinor(r.principalMinor ?? 0, home)}</td><td className="num">{formatMinor(r.balanceAfterMinor ?? 0, home)}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div><ArchiveButton kind="loan" id={loan.id} label="Remove this loan" /></div>
    </div>
  );
}

export default function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<PageSkeleton />}><LoanLoader params={params} /></Suspense>;
}
