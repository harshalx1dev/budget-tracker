import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { ArchiveButton, RevisionForm } from "@/components/commit-forms";
import { requireWorkspace } from "@/server/session";
import { getLoan, loanSchedule } from "@/server/services/commitments";
import { formatMinor } from "@/lib/money";
import { formatDayYear, todayISO } from "@/lib/dates";

export const metadata = { title: "loan" };

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
      <div className="head-row"><h1>{loan.name}</h1><Link href="/app/plan/commitments" className="btn btn--secondary">all commitments</Link></div>
      <section className="stats" aria-label="loan summary">
        <div className="stat well raised"><p className="label">emi</p><p className="figure">{formatMinor(loan.emiMinor, home)}</p></div>
        <div className="stat well raised"><p className="label">instalments left</p><p className="figure">{rows.filter((r) => r.dueOn >= today).length}</p></div>
        <div className="stat well raised"><p className="label">{hasBalance ? "interest still to pay" : "last instalment"}</p><p className="figure">{totalInterest !== null ? formatMinor(totalInterest, home) : rows.at(-1) ? formatDayYear(rows.at(-1)!.dueOn) : "—"}</p></div>
      </section>
      {stalled && <p role="alert" className="error">At this EMI and rate the loan never pays down. Check the EMI or the rate.</p>}
      {!hasBalance && <p className="label">Add the balance left and the rate to the loan to see the interest and principal split. Everything else, including the plan, already works.</p>}

      <section className="stack-sm" aria-labelledby="rev-h">
        <h2 id="rev-h">changes over time</h2>
        <p className="label">EMIs shift when rates move or you prepay. A change applies from its date onward and the past stays as it was.</p>
        <RevisionForm loanId={loan.id} hasBalance={hasBalance} />
        {revisions.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>from</th><th>change</th><th>note</th><th><span className="visually-hidden">remove</span></th></tr></thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDayYear(r.effectiveOn)}</td>
                    <td>{r.kind === "emi" ? `emi becomes ${formatMinor(r.emiMinor ?? 0, home)}` : r.kind === "rate" ? `rate becomes ${Number(r.ratePct)}%` : `prepaid ${formatMinor(r.amountMinor ?? 0, home)}`}</td>
                    <td>{r.note ?? ""}</td>
                    <td><ArchiveButton kind="revision" id={r.id} label="remove this change" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="sch-h">
        <h2 id="sch-h">schedule</h2>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>#</th><th>due</th><th className="num">payment</th>{hasBalance && <><th className="num">interest</th><th className="num">principal</th><th className="num">balance</th></>}</tr></thead>
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
      <div><ArchiveButton kind="loan" id={loan.id} label="remove this loan" /></div>
    </div>
  );
}

export default function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<PageSkeleton />}><LoanLoader params={params} /></Suspense>;
}
