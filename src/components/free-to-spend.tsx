import Link from "next/link";
import { SafeSwitch } from "./safe-switch";
import { BufferForm } from "./plan-forms";
import { formatMinor } from "@/lib/money";
import { formatDay, todayISO } from "@/lib/dates";
import type { safeToSpend } from "@/server/services/planner";

type Sts = Awaited<ReturnType<typeof safeToSpend>>;

/** What is free to spend, as a plain sentence. Never shows a negative number: it says what is missing instead. */
export function FreeToSpend({ sts, home }: { sts: Sts; home: string }) {
  const whole = (v: number) => formatMinor(v, home, { whole: true });
  const until = sts.incomeKnown && sts.nextIncome ? `payday on ${formatDay(sts.nextIncome)}` : "the month ends";
  const view = (safe: number, perDay: number, of: number, basis: string) => (
    <div>
      <p className="figure">{whole(Math.max(0, safe))}</p>
      <div className="meter" aria-hidden><div className="meter__fill" style={{ transform: `scaleX(${of > 0 ? Math.max(0, Math.min(1, safe / of)) : 0})` }} /></div>
      <p className="hero__line">
        {safe > 0 ? `Free to spend until ${until}, about ${whole(perDay)} a day.`
          : safe < 0 ? `Nothing free: your bills and set-aside money need ${whole(-safe)} more than you have.`
          : `Nothing free until ${until}.`}
      </p>
      <p className="label">{basis}</p>
    </div>
  );
  const m = sts.monthly;
  return (
    <SafeSwitch
      monthLabel={m.fromPayday ? "Since payday" : "This month"}
      month={view(m.safe, m.perDay, m.income, m.income === 0 ? `No money received since ${formatDay(m.cycleStart)}.` : m.capped ? "Limited by what your accounts hold." : `From the ${whole(m.income)} received since ${formatDay(m.cycleStart)}.`)}
      accounts={view(sts.safe, sts.perDay, sts.balance, `From the ${whole(sts.balance)} in your accounts.`)}
    />
  );
}

export function FreeToSpendWorking({ sts, home }: { sts: Sts; home: string }) {
  const table = (title: string, rows: [string, number][]) => (
    <table className="ledger">
      <thead><tr><th>{title}</th><th className="num">Amount</th></tr></thead>
      <tbody>{rows.map(([label, v]) => <tr key={label}><td>{label}</td><td className="num">{formatMinor(v, home)}</td></tr>)}</tbody>
    </table>
  );
  const m = sts.monthly;
  return (
    <details className="more">
      <summary className="btn btn--secondary">How is this worked out?</summary>
      <div className="stack-sm">
        <div className="well table-wrap">{table(m.fromPayday ? "Since payday" : "This month", [["Money received", m.income], ["Already spent", -m.spent], ["Card bills paid", -m.cardPaid], ["Moved to savings", -m.saved], ["Bills and EMIs still to pay", -m.billsDue], ["Card bills to pay", -m.cardDue], ["Saving for goals", -m.goalSetAside]])}</div>
        <div className="well table-wrap">{table("All my money", [["In your accounts", sts.balance], ["Bills and EMIs still to pay", -sts.dueOutflows], ["Saving for goals", -sts.goalSetAside], ["Kept aside", -sts.buffer]])}</div>
        {m.due.length > 0 && <p className="label">Still to pay: {m.due.map((d) => `${d.name} ${formatMinor(d.amountMinor, home)} ${d.dueOn < todayISO() ? "overdue since" : "on"} ${formatDay(d.dueOn)}`).join(", ")}.</p>}
        {m.onCards > 0 && <p className="label">{formatMinor(m.onCards, home)} spent on cards is not billed yet, so a later salary pays it.</p>}
        <p className="label">Goals marked Flexible only count once you actually put money aside. {<Link href="/app/plan/goals" className="link">Change goals</Link>}</p>
        <p className="label">Keep aside: money you never want counted as free.</p>
        <BufferForm current={String(sts.buffer / 100)} />
      </div>
    </details>
  );
}
