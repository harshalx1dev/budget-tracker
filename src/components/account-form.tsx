"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { addAccount, type FormState } from "@/app/app/actions";
import { CURRENCIES } from "@/lib/money";

export function AccountForm({ homeCurrency }: { homeCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccount, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">Name</span><input name="name" required maxLength={40} placeholder="Hdfc savings" className="input" /></label>
      <label className="field"><span className="label">Type</span>
        <select name="type" className="input" defaultValue="bank">
          <option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option><option value="wallet">Wallet / upi</option>
        </select>
      </label>
      <label className="field"><span className="label">Currency</span>
        <select name="currency" className="input" defaultValue={homeCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="field"><span className="label">Opening balance</span><input name="opening" inputMode="decimal" placeholder="0" className="input" /></label>
      <label className="field"><span className="label">Quick-add words</span><input name="aliases" maxLength={80} placeholder="Upi, gpay" className="input" /></label>
      <div className="tx-form__end">
        {state.error && <p role="alert" className="error">{state.error}</p>}
        <button className="btn btn--primary" disabled={pending}><Plus size={16} aria-hidden /> Add account</button>
      </div>
    </form>
  );
}
