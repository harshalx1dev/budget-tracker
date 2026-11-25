"use client";

import { useActionState, useEffect, useRef } from "react";
import { newTransferAction, reconcileAction, type CaptureState } from "@/app/app/capture-actions";

type Acct = { id: string; name: string; currency: string; type: string };

function Status({ s }: { s: CaptureState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}

export function TransferForm({ accounts }: { accounts: Acct[] }) {
  const [s, action, pending] = useActionState<CaptureState, FormData>(newTransferAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">from</span><select name="from" className="input">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="field"><span className="label">to</span><select name="to" className="input" defaultValue={accounts[1]?.id}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="field"><span className="label">amount</span><input name="amount" inputMode="decimal" required className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--secondary" disabled={pending || accounts.length < 2}>record transfer</button></div>
    </form>
  );
}

export function ReconcileForm({ accounts }: { accounts: Acct[] }) {
  const [s, action, pending] = useActionState<CaptureState, FormData>(reconcileAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  const cash = accounts.filter((a) => a.type === "cash" || a.type === "wallet");
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">account</span><select name="account" className="input">{cash.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label className="field"><span className="label">how much do you actually have</span><input name="actual" inputMode="decimal" required className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--secondary" disabled={pending || !cash.length}>reconcile</button></div>
    </form>
  );
}
