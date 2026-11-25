"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import {
  addLoanAction, addRecurringAction, addRevisionAction, archiveLoanAction, archiveRecurringAction, markPaidAction, matchNowAction, removeRevisionAction,
  type CommitState,
} from "@/app/app/commit-actions";

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

export function LoanForm({ accounts }: { accounts: Acct[] }) {
  const [s, action, pending] = useActionState<CommitState, FormData>(addLoanAction, {});
  const ref = useResetOnSuccess(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">name</span><input name="name" required maxLength={60} placeholder="phone emi" className="input" /></label>
      <label className="field"><span className="label">emi amount</span><input name="emi" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">next due date</span><input name="firstDueOn" type="date" required defaultValue={localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">instalments left</span><input name="instalments" inputMode="numeric" required className="input" /></label>
      <label className="field"><span className="label">text in your statement</span><input name="pattern" maxLength={60} placeholder="hdbfinancial" className="input" /></label>
      <label className="field"><span className="label">paid from</span>
        <select name="accountId" className="input" defaultValue=""><option value="">any account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label className="field"><span className="label">lender (optional)</span><input name="lender" maxLength={60} className="input" /></label>
      <span />
      <label className="field"><span className="label">balance left (optional)</span><input name="principal" inputMode="decimal" className="input" /></label>
      <label className="field"><span className="label">interest rate % (optional)</span><input name="rate" inputMode="decimal" className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>add loan</button></div>
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
      <label className="field"><span className="label">what changed</span>
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="emi">emi amount</option>
          <option value="rate" disabled={!hasBalance}>interest rate</option>
          <option value="prepayment" disabled={!hasBalance}>part-prepayment</option>
        </select>
      </label>
      <label className="field"><span className="label">{kind === "rate" ? "new rate %" : kind === "prepayment" ? "amount prepaid" : "new emi"}</span><input name="value" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">from</span><input name="effectiveOn" type="date" required defaultValue={localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">note</span><input name="note" maxLength={120} className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>record change</button></div>
    </form>
  );
}

export function RecurringForm({ accounts, categories }: { accounts: Acct[]; categories: Cat[] }) {
  const [s, action, pending] = useActionState<CommitState, FormData>(addRecurringAction, {});
  const ref = useResetOnSuccess(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">name</span><input name="name" required maxLength={60} placeholder="rent" className="input" /></label>
      <label className="field"><span className="label">kind</span><select name="kind" className="input"><option value="expense">expense</option><option value="income">income</option></select></label>
      <label className="field"><span className="label">amount</span><input name="amount" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">repeats</span><select name="frequency" className="input" defaultValue="monthly"><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly">yearly</option></select></label>
      <label className="field"><span className="label">every</span><input name="every" inputMode="numeric" defaultValue="1" className="input" /></label>
      <label className="field"><span className="label">starts</span><input name="startOn" type="date" required defaultValue={localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">ends on (optional)</span><input name="endOn" type="date" className="input" /></label>
      <label className="field"><span className="label">or after this many times</span><input name="count" inputMode="numeric" className="input" /></label>
      <label className="field"><span className="label">text in your statement</span><input name="pattern" maxLength={60} placeholder="netflix" className="input" /></label>
      <label className="field"><span className="label">paid from</span>
        <select name="accountId" className="input" defaultValue=""><option value="">any account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label className="field"><span className="label">category</span>
        <select name="categoryId" className="input" defaultValue=""><option value="">none</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}</select>
      </label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>add recurring item</button></div>
    </form>
  );
}

export function MarkPaidButton({ sourceKind, sourceId, dueOn }: { sourceKind: "loan" | "rule"; sourceId: string; dueOn: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="pill pill--outline" disabled={pending} onClick={() => start(async () => { await markPaidAction(sourceKind, sourceId, dueOn); })}><Check size={14} aria-hidden /> mark paid</button>;
}

export function MatchNowButton() {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="match-now">
      <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(async () => setNote((await matchNowAction()).message ?? null))}>{pending ? "checking" : "match payments"}</button>
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
