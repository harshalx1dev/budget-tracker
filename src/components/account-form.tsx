"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addAccount, type FormState } from "@/app/app/actions";
import { CURRENCIES } from "@/lib/money";

export function AccountForm({ homeCurrency }: { homeCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAccount, {});
  const ref = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("bank");
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  const card = type === "card";
  return (
    <form ref={ref} action={action} onReset={() => setType("bank")} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">Name</span><input name="name" required maxLength={40} placeholder="Hdfc savings" className="input" /></label>
      <label className="field"><span className="label">Type</span>
        <select name="type" className="input" defaultValue="bank" onChange={(e) => setType(e.target.value)}>
          <option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Credit card</option><option value="wallet">Wallet or UPI</option><option value="savings">Savings account (not for daily spending)</option>
        </select>
      </label>
      <label className="field"><span className="label">Currency</span>
        <select name="currency" className="input" defaultValue={homeCurrency}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="field"><span className="label">{card ? "Amount you owe now" : "Opening balance"}</span><input name="opening" inputMode="decimal" placeholder="0" className="input" /></label>
      {card && (
        <>
          <label className="field"><span className="label">Bill made on day</span><input name="statementDay" inputMode="numeric" placeholder="15" className="input" /></label>
          <label className="field"><span className="label">Pay by day</span><input name="dueDay" inputMode="numeric" placeholder="5" className="input" /></label>
        </>
      )}
      <label className="field"><span className="label">Quick-add words</span><input name="aliases" maxLength={80} placeholder="Upi, gpay" className="input" /></label>
      <div className="tx-form__end">
        {state.error && <p role="alert" className="error">{state.error}</p>}
        <button className="btn btn--primary" disabled={pending}><Plus size={16} aria-hidden /> Add account</button>
      </div>
    </form>
  );
}
