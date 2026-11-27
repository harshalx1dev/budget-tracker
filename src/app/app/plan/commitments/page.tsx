import { Suspense } from "react";
import { Summary } from "@/components/summary";
import { EditDialog } from "@/components/edit-dialog";
import { CardSection } from "@/components/card-section";
import { listCards } from "@/server/services/cards";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { ArchiveButton, LoanForm, MarkPaidButton, MatchNowButton, RecurringForm } from "@/components/commit-forms";
import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { getLoan, listExpected, listLoans, listRecurring, loanSchedule } from "@/server/services/commitments";
import { formatMinor } from "@/lib/money";
import { isAssetType } from "@/lib/savings";
import { formatDay, formatDayYear, shiftDays, todayISO } from "@/lib/dates";

export const metadata = { title: "Bills & EMIs" };

const FREQ = { weekly: "week", monthly: "month", yearly: "year" } as const;

async function CommitmentsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const today = todayISO();
  const [accounts, categories, loans, allRules, allExpected] = await Promise.all([
    listAccounts(workspace.id), listCategories(workspace.id), listLoans(workspace.id), listRecurring(workspace.id),
    listExpected(workspace.id, shiftDays(today, -45), shiftDays(today, 60)),
  ]);
  // Income lives with the accounts; this page is about money going out.
  const rules = allRules.filter((r) => r.kind === "expense");
  const expected = allExpected.filter((e) => e.kind === "expense");
  const loanRows = await Promise.all(loans.map(async (l) => {
    const d = await getLoan(workspace.id, l.id);
    const { rows } = loanSchedule(l, d!.revisions);
    const left = rows.filter((r) => r.dueOn >= today);
    const paidRows = rows.filter((r) => r.dueOn < today);
    const outstanding = l.principalMinor === null ? null : (paidRows.at(-1)?.balanceAfterMinor ?? l.principalMinor);
    return { l, next: left[0], remaining: left.length, ends: rows.at(-1)?.dueOn, outstanding };
  }));
  const monthly = loanRows.reduce((s, r) => s + (r.next?.amountMinor ?? 0), 0);
  const cards = await listCards(workspace.id);
  const accountOpts = accounts.filter((a) => !isAssetType(a.type)).map((a) => ({ id: a.id, name: a.name, type: a.type }));

  return (
    <div className="settle stack">
      <div className="head-row"><h1>Bills & EMIs</h1><MatchNowButton /></div>

      {loanRows.length > 0 && <Summary figure={formatMinor(monthly, home, { whole: true })} caption="goes to EMIs each month right now" />}

      <CardSection cards={cards} payFrom={["bank", "wallet", "cash"].flatMap((t) => accounts.filter((a) => a.type === t))} />
      {cards.length === 0 && <p className="label">Pay by credit card? <Link href="/app/accounts" className="link">Add the card as an account</Link> and its bill shows here.</p>}

      <section className="stack-sm" aria-labelledby="up-h">
        <h2 id="up-h">Coming up</h2>
        {expected.length === 0 ? (
          <div className="well empty"><h3>Nothing planned yet</h3><p>Add an EMI or a regular payment below and it shows up here.</p></div>
        ) : (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Due</th><th>What</th><th className="num">Amount</th><th>Status</th><th><span className="visually-hidden">Action</span></th></tr></thead>
              <tbody>
                {expected.map((e) => (
                  <tr key={e.key}>
                    <td>{formatDay(e.dueOn)}</td>
                    <td>{e.name}</td>
                    <td className="num amt" data-kind={e.kind}>{formatMinor(e.kind === "income" ? e.amountMinor : -e.amountMinor, home, { sign: true })}</td>
                    <td>
                      {e.status === "paid" ? <>Paid{e.actualMinor !== null && e.actualMinor !== e.amountMinor ? <span className="label"> {formatMinor(e.actualMinor, home)} against {formatMinor(e.amountMinor, home)}, </span> : null}{e.sourceKind === "loan" && e.actualMinor !== null && e.actualMinor !== e.amountMinor ? <Link href={`/app/plan/commitments/loans/${e.sourceId}`} className="link">Revise the EMI</Link> : null}</>
                        : e.status === "overdue" ? <span className="error">Overdue</span> : "Upcoming"}
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
        <h2 id="loan-h">Loans and EMIs</h2>
        {loanRows.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Loan</th><th className="num">EMI</th><th>Next due</th><th className="num">Left</th><th>Ends</th><th className="num">Balance</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
              <tbody>
                {loanRows.map(({ l, next, remaining, ends, outstanding }) => (
                  <tr key={l.id}>
                    <td><Link href={`/app/plan/commitments/loans/${l.id}`} className="link">{l.name}</Link></td>
                    <td className="num">{formatMinor(next?.amountMinor ?? l.emiMinor, home)}</td>
                    <td>{next ? formatDay(next.dueOn) : "Finished"}</td>
                    <td className="num">{remaining}</td>
                    <td>{ends ? formatDayYear(ends) : "—"}</td>
                    <td className="num">{outstanding === null ? "—" : formatMinor(outstanding, home)}</td>
                    <td><span className="head-actions"><EditDialog label={`Edit ${l.name}`}><LoanForm accounts={accountOpts} item={{
                      id: l.id, name: l.name, emi: String(l.emiMinor / 100), firstDueOn: l.firstDueOn, instalments: l.instalments, pattern: l.matchPattern ?? "", accountId: l.accountId ?? "",
                      lender: l.lender ?? "", principal: l.principalMinor ? String(l.principalMinor / 100) : "", rate: l.annualRatePct === null ? "" : String(Number(l.annualRatePct)),
                    }} /></EditDialog><ArchiveButton kind="loan" id={l.id} label={`Remove ${l.name}`} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="more"><summary className="btn btn--secondary">Add a loan or EMI</summary><LoanForm accounts={accountOpts} /></details>
      </section>

      <section className="stack-sm" aria-labelledby="rec-h">
        <h2 id="rec-h">Regular payments</h2>
        <p className="label">Rent, subscriptions and SIPs. Your salary and other income are under <Link href="/app/accounts#income" className="link">Accounts</Link>.</p>
        {rules.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Name</th><th className="num">Amount</th><th>Repeats</th><th>Until</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}{r.transferToAccountId ? <span className="label"> Saved</span> : null}</td>
                    <td className="num amt" data-kind={r.kind}>{formatMinor(r.kind === "income" ? r.amountMinor : -r.amountMinor, home, { sign: true })}</td>
                    <td>every {r.intervalCount > 1 ? `${r.intervalCount} ` : ""}{FREQ[r.frequency]}{r.intervalCount > 1 ? "s" : ""} from {formatDay(r.startOn)}</td>
                    <td>{r.endOn ? formatDayYear(r.endOn) : r.maxCount ? `${r.maxCount} times` : "No end"}</td>
                    <td><span className="head-actions"><EditDialog label={`Edit ${r.name}`}><RecurringForm only="expense" accounts={accountOpts} categories={categories} savingsAccounts={accounts.filter((a) => isAssetType(a.type)).map((a) => ({ id: a.id, name: a.name }))} item={{
                      id: r.id, name: r.name, kind: r.kind, amount: String(r.amountMinor / 100), frequency: r.frequency, every: r.intervalCount, anchor: r.anchor, weekendShift: r.weekendShift,
                      startOn: r.startOn, endOn: r.endOn ?? "", count: r.maxCount, pattern: r.matchPattern ?? "", accountId: r.accountId ?? "", categoryId: r.categoryId ?? "", intoAccountId: r.transferToAccountId ?? "",
                    }} /></EditDialog><ArchiveButton kind="rule" id={r.id} label={`Remove ${r.name}`} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="more"><summary className="btn btn--secondary">Add a regular payment</summary><RecurringForm only="expense" accounts={accountOpts} categories={categories} savingsAccounts={accounts.filter((a) => isAssetType(a.type)).map((a) => ({ id: a.id, name: a.name }))} /></details>
      </section>
    </div>
  );
}

export default function Commitments() {
  return <Suspense fallback={<PageSkeleton />}><CommitmentsLoader /></Suspense>;
}
