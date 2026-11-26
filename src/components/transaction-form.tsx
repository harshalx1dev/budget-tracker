"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addTransaction, type FormState } from "@/app/app/actions";

type Acct = { id: string; name: string; currency: string };
type Cat = { id: string; name: string; kind: "income" | "expense" };

const localToday = () => new Date().toLocaleDateString("en-CA");

export function TransactionForm({ accounts, categories, homeCurrency }: { accounts: Acct[]; categories: Cat[]; homeCurrency: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addTransaction, {});
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const ref = useRef<HTMLFormElement>(null);
  const foreign = accounts.find((a) => a.id === accountId)?.currency !== homeCurrency;

  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);

  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <div className="seg" role="radiogroup" aria-label="Kind">
        {(["expense", "income"] as const).map((k) => (
          <label key={k} className="seg__opt" data-on={kind === k}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="visually-hidden" />
            {k}
          </label>
        ))}
      </div>
      <label className="field"><span className="label">Amount</span><input name="amount" inputMode="decimal" required placeholder="0" className="input" /></label>
      <label className="field"><span className="label">Account</span>
        <select name="accountId" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
        </select>
      </label>
      <label className="field"><span className="label">Category</span>
        <select key={kind} name="categoryId" className="input" defaultValue="">
          <option value="">None</option>
          {categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field"><span className="label">Date</span><input name="occurredOn" type="date" required defaultValue={localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">Payee</span><input name="payee" maxLength={80} placeholder="Who or where" className="input" /></label>
      <label className="field"><span className="label">Note</span><input name="note" maxLength={200} className="input" /></label>
      {foreign ? (
        <label className="field"><span className="label">Rate to {homeCurrency}</span><input name="fx" inputMode="decimal" required className="input" /></label>
      ) : <input type="hidden" name="fx" value="" />}
      <div className="tx-form__end">
        {state.error && <p role="alert" className="error">{state.error}</p>}
        <button className="btn btn--primary" disabled={pending || !accounts.length}><Plus size={16} aria-hidden /> Add entry</button>
      </div>
    </form>
  );
}
