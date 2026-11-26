import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { ArchiveButton, LoanForm, MarkPaidButton, MatchNowButton, RecurringForm } from "@/components/commit-forms";
import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { getLoan, listExpected, listLoans, listRecurring, loanSchedule } from "@/server/services/commitments";
import { formatMinor } from "@/lib/money";
import { formatDay, formatDayYear, shiftDays, todayISO } from "@/lib/dates";

export const metadata = { title: "commitments" };

const FREQ = { weekly: "week", monthly: "month", yearly: "year" } as const;

async function CommitmentsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const today = todayISO();
  const [accounts, categories, loans, rules, expected] = await Promise.all([
    listAccounts(workspace.id), listCategories(workspace.id), listLoans(workspace.id), listRecurring(workspace.id),
    listExpected(workspace.id, shiftDays(today, -45), shiftDays(today, 60)),
  ]);
  const loanRows = await Promise.all(loans.map(async (l) => {
    const d = await getLoan(workspace.id, l.id);
    const { rows } = loanSchedule(l, d!.revisions);
    const left = rows.filter((r) => r.dueOn >= today);
    const paidRows = rows.filter((r) => r.dueOn < today);
    const outstanding = l.principalMinor === null ? null : (paidRows.at(-1)?.balanceAfterMinor ?? l.principalMinor);
    return { l, next: left[0], remaining: left.length, ends: rows.at(-1)?.dueOn, outstanding };
  }));
  const monthly = loanRows.reduce((s, r) => s + (r.next?.amountMinor ?? 0), 0);
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="settle stack">
      <div className="head-row"><h1>commitments</h1><MatchNowButton /></div>

      <section className="stack-sm" aria-labelledby="up-h">
        <h2 id="up-h">coming up</h2>
        {expected.length === 0 ? (
          <div className="well empty"><h3>nothing planned yet</h3><p>Add an EMI or a recurring item below and its payments show up here.</p></div>
        ) : (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>due</th><th>what</th><th className="num">amount</th><th>status</th><th><span className="visually-hidden">action</span></th></tr></thead>
              <tbody>
                {expected.map((e) => (
                  <tr key={e.key}>
                    <td>{formatDay(e.dueOn)}</td>
                    <td>{e.name}</td>
                    <td className="num amt" data-kind={e.kind}>{formatMinor(e.kind === "income" ? e.amountMinor : -e.amountMinor, home, { sign: true })}</td>
                    <td>
                      {e.status === "paid" ? <>paid{e.actualMinor !== null && e.actualMinor !== e.amountMinor ? <span className="label"> {formatMinor(e.actualMinor, home)} against {formatMinor(e.amountMinor, home)}, </span> : null}{e.sourceKind === "loan" && e.actualMinor !== null && e.actualMinor !== e.amountMinor ? <Link href={`/app/plan/commitments/loans/${e.sourceId}`} className="link">revise the emi</Link> : null}</>
                        : e.status === "overdue" ? <span className="error">overdue</span> : "upcoming"}
                    </td>
                    <td>{e.status !== "paid" ? <MarkPaidButton sourceKind={e.sourceKind} sourceId={e.sourceId} dueOn={e.dueOn} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="loan-h">
        <h2 id="loan-h">loans and emis</h2>
        {loanRows.length > 0 && <p className="label">{formatMinor(monthly, home)} goes to EMIs each month right now.</p>}
        {loanRows.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>loan</th><th className="num">emi</th><th>next due</th><th className="num">left</th><th>ends</th><th className="num">balance</th><th><span className="visually-hidden">remove</span></th></tr></thead>
              <tbody>
                {loanRows.map(({ l, next, remaining, ends, outstanding }) => (
                  <tr key={l.id}>
                    <td><Link href={`/app/plan/commitments/loans/${l.id}`} className="link">{l.name}</Link></td>
                    <td className="num">{formatMinor(next?.amountMinor ?? l.emiMinor, home)}</td>
                    <td>{next ? formatDay(next.dueOn) : "finished"}</td>
                    <td className="num">{remaining}</td>
                    <td>{ends ? formatDayYear(ends) : "—"}</td>
                    <td className="num">{outstanding === null ? "—" : formatMinor(outstanding, home)}</td>
                    <td><ArchiveButton kind="loan" id={l.id} label={`remove ${l.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="more"><summary className="pill">add a loan or emi</summary><LoanForm accounts={accountOpts} /></details>
      </section>

      <section className="stack-sm" aria-labelledby="rec-h">
        <h2 id="rec-h">recurring</h2>
        <p className="label">Salary, rent, subscriptions and SIPs. Give an end date or a count if it stops.</p>
        {rules.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>name</th><th className="num">amount</th><th>repeats</th><th>until</th><th><span className="visually-hidden">remove</span></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="num amt" data-kind={r.kind}>{formatMinor(r.kind === "income" ? r.amountMinor : -r.amountMinor, home, { sign: true })}</td>
                    <td>every {r.intervalCount > 1 ? `${r.intervalCount} ` : ""}{FREQ[r.frequency]}{r.intervalCount > 1 ? "s" : ""} from {formatDay(r.startOn)}</td>
                    <td>{r.endOn ? formatDayYear(r.endOn) : r.maxCount ? `${r.maxCount} times` : "no end"}</td>
                    <td><ArchiveButton kind="rule" id={r.id} label={`remove ${r.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="more"><summary className="pill">add a recurring item</summary><RecurringForm accounts={accountOpts} categories={categories} /></details>
      </section>
    </div>
  );
}

export default function Commitments() {
  return <Suspense fallback={<PageSkeleton />}><CommitmentsLoader /></Suspense>;
}
