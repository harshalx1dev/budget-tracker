"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import {
  addLoanAction, addRecurringAction, addRevisionAction, archiveLoanAction, archiveRecurringAction, markPaidAction, matchNowAction, removeRevisionAction,
  type CommitState,
} from "@/app/app/commit-actions";
import { Field } from "./field";
import { useCloseWhenSaved } from "./edit-dialog";

type Acct = { id: string; name: string };
type Cat = { id: string; name: string; kind: "income" | "expense" };

const localToday = () => new Date().toLocaleDateString("en-CA");

function Status({ s }: { s: CommitState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}

function useResetOnSuccess(s: CommitState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return ref;
}

export type EditableLoan = { id: string; name: string; emi: string; firstDueOn: string; instalments: number; pattern: string; accountId: string; lender: string; principal: string; rate: string };

export function LoanForm({ accounts, item }: { accounts: Acct[]; item?: EditableLoan }) {
  const [s, action, pending] = useActionState<CommitState, FormData>(addLoanAction, {});
  const ref = useResetOnSuccess(s);
  useCloseWhenSaved(s);
  return (
    <form ref={ref} action={action} className={item ? "tx-form" : "well tx-form"} aria-busy={pending}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Name"><input name="name" required maxLength={60} placeholder="Phone EMI" defaultValue={item?.name} className="input" /></Field>
      <Field label="Monthly payment (EMI)" hint="Leave empty if you know the amount still owed and the interest rate: the payment is worked out from those."><input name="emi" inputMode="decimal" defaultValue={item?.emi} className="input" /></Field>
      <Field label={item ? "First payment date" : "Next payment date"}><input name="firstDueOn" type="date" required defaultValue={item?.firstDueOn ?? localToday()} suppressHydrationWarning className="input" /></Field>
      <Field label={item ? "Payments in all" : "Payments left"} hint={item ? "The total number of monthly payments counted from the first payment date." : "How many monthly payments are still to be made, counting the next one."}><input name="instalments" inputMode="numeric" required defaultValue={item?.instalments} className="input" /></Field>
      <Field label="Statement text (optional)" hint="A few words your bank prints on this payment, for example HDBFINANCIAL. When you import a statement, a matching line marks the payment as paid."><input name="pattern" maxLength={60} placeholder="HDBFINANCIAL" defaultValue={item?.pattern} className="input" /></Field>
      <Field label="Paid from">
        <select name="accountId" className="input" defaultValue={item?.accountId ?? ""}><option value="">Any account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label="Lender (optional)"><input name="lender" maxLength={60} defaultValue={item?.lender} className="input" /></Field>
      <Field label={item ? "Owed at the first payment (optional)" : "Amount still owed (optional)"} hint={item ? "The loan balance just before the first payment date above, not today's. The app subtracts the payments made since." : "The loan balance today. It lets the app show interest left and count the loan in your net worth."}><input name="principal" inputMode="decimal" defaultValue={item?.principal} className="input" /></Field>
      <Field label="Yearly interest % (optional)"><input name="rate" inputMode="decimal" defaultValue={item?.rate} className="input" /></Field>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>{item ? "Save changes" : "Add loan"}</button></div>
    </form>
  );
}

export function RevisionForm({ loanId, hasBalance }: { loanId: string; hasBalance: boolean }) {
  const [s, action, pending] = useActionState<CommitState, FormData>(addRevisionAction, {});
  const ref = useResetOnSuccess(s);
  const [kind, setKind] = useState("emi");
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <input type="hidden" name="loanId" value={loanId} />
      <label className="field"><span className="label">What changed</span>
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="emi">EMI amount</option>
          <option value="rate" disabled={!hasBalance}>Interest rate</option>
          <option value="prepayment" disabled={!hasBalance}>Part-prepayment</option>
        </select>
      </label>
      <label className="field"><span className="label">{kind === "rate" ? "New rate %" : kind === "prepayment" ? "Amount prepaid" : "New EMI"}</span><input name="value" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">From</span><input name="effectiveOn" type="date" required defaultValue={localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">Note</span><input name="note" maxLength={120} className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>Record change</button></div>
    </form>
  );
}

const UNIT = { weekly: "week", monthly: "month", yearly: "year" } as const;

export type EditableRule = {
  id: string; name: string; kind: "income" | "expense"; amount: string; frequency: keyof typeof UNIT; every: number; anchor: string; weekendShift: string;
  startOn: string; endOn: string; count: number | null; pattern: string; accountId: string; categoryId: string; intoAccountId: string;
};

/** One form for bills (under Plan) and income (under Accounts); `only` says which it is. */
export function RecurringForm({ accounts, categories, savingsAccounts = [], item, only }: { accounts: (Acct & { type?: string })[]; categories: Cat[]; savingsAccounts?: Acct[]; item?: EditableRule; only: "income" | "expense" }) {
  const [s, action, pending] = useActionState<CommitState, FormData>(addRecurringAction, {});
  const ref = useResetOnSuccess(s);
  const kind = only;
  const [frequency, setFrequency] = useState<keyof typeof UNIT>(item?.frequency ?? "monthly");
  useCloseWhenSaved(s);
  // the stored choices apply while the kind is unchanged
  const kept = item && item.kind === kind ? item : undefined;
  const income = kind === "income";
  // Money does not arrive on a credit card.
  const places = income ? accounts.filter((a) => a.type !== "card") : accounts;
  return (
    <form ref={ref} action={action} onReset={() => setFrequency(item?.frequency ?? "monthly")} className={item ? "tx-form" : "well tx-form"} aria-busy={pending}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <Field label="Name"><input name="name" required maxLength={60} placeholder={income ? "Salary" : "Rent"} defaultValue={item?.name} className="input" /></Field>
      <input type="hidden" name="kind" value={kind} />
      <Field label="Amount"><input name="amount" inputMode="decimal" required defaultValue={item?.amount} className="input" /></Field>
      <Field label="How often">
        <select name="frequency" className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as keyof typeof UNIT)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
      </Field>
      <Field label={`Every how many ${UNIT[frequency]}s`} hint={`Leave it at 1 for every ${UNIT[frequency]}. Enter 3 for once every three ${UNIT[frequency]}s.`}><input name="every" inputMode="numeric" defaultValue={item?.every ?? 1} className="input" /></Field>
      {frequency === "monthly" && (
        <Field label="Day of the month" hint="Same date repeats the day of the first date below. Last day follows the end of each month, whether it has 28, 30 or 31 days.">
          <select name="anchor" className="input" defaultValue={item?.anchor ?? "start_day"}><option value="start_day">Same date each month</option><option value="month_end">Last day of the month</option></select>
        </Field>
      )}
      <Field label="If that day is a weekend" hint="Banks often move a payment that falls on a weekend. Choose what happens to yours.">
        <select name="weekendShift" className="input" defaultValue={item?.weekendShift ?? "none"}><option value="none">Keep that day</option><option value="sunday_back">Sunday moves to Saturday</option><option value="weekend_back">Saturday or Sunday moves to Friday</option></select>
      </Field>
      <Field label="First date" hint={`The first time this ${income ? "arrives" : "is paid"}. Pick the next one if you only want to plan ahead.`}><input name="startOn" type="date" required defaultValue={item?.startOn ?? localToday()} suppressHydrationWarning className="input" /></Field>
      <Field label="Last date (optional)" hint="Leave empty if it carries on with no end."><input name="endOn" type="date" defaultValue={item?.endOn} className="input" /></Field>
      <Field label="Or stop after (optional)" hint="The total number of times it happens, for example 12 for a one-year plan."><input name="count" inputMode="numeric" placeholder="Number of times" defaultValue={item?.count ?? ""} className="input" /></Field>
      <Field label="Statement text (optional)" hint={`A few words your bank prints on this ${income ? "credit" : "payment"}. When you import a statement, a matching line marks it as ${income ? "received" : "paid"}.`}><input name="pattern" maxLength={60} placeholder={income ? "Employer name" : "NETFLIX"} defaultValue={item?.pattern} className="input" /></Field>
      <Field label={income ? "Received in" : "Paid from"}>
        <select key={kind} name="accountId" className="input" defaultValue={item?.accountId ?? ""}><option value="">Any account</option>{places.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label="Category (optional)">
        <select key={kind} name="categoryId" className="input" defaultValue={kept ? kept.categoryId : income ? (categories.find((c) => c.kind === "income" && c.name === "Salary")?.id ?? "") : ""}><option value="">None</option>{categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      {!income && savingsAccounts.length > 0 && (
        <Field label="Moves into savings (optional)" hint="For a SIP or recurring deposit: the money goes into this savings account and is not counted as spending.">
          <select name="intoAccountId" className="input" defaultValue={item?.intoAccountId ?? ""}><option value="">No, it is spent</option>{savingsAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
      )}
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>{item ? "Save changes" : income ? "Add income" : "Add bill"}</button></div>
    </form>
  );
}

export function MarkPaidButton({ sourceKind, sourceId, dueOn, label = "Mark paid" }: { sourceKind: "loan" | "rule"; sourceId: string; dueOn: string; label?: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="pill pill--outline" disabled={pending} onClick={() => start(async () => { await markPaidAction(sourceKind, sourceId, dueOn); })}><Check size={14} aria-hidden /> {label}</button>;
}

export function MatchNowButton() {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="match-now">
      <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(async () => setNote((await matchNowAction()).message ?? null))}>{pending ? "Checking" : "Find paid bills"}</button>
      <span className="label" role="status">{note}</span>
    </span>
  );
}

export function ArchiveButton({ kind, id, label }: { kind: "loan" | "rule" | "revision"; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="icon-btn" aria-label={label} disabled={pending}
      onClick={() => start(async () => { if (kind === "loan") await archiveLoanAction(id); else if (kind === "rule") await archiveRecurringAction(id); else await removeRevisionAction(id); })}>
      <Trash2 size={16} aria-hidden />
    </button>
  );
}
