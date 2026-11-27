"use client";

import { useActionState } from "react";
import { payCardAction, setCardCycleAction, type CardState } from "@/app/app/card-actions";

function Msg({ s }: { s: CardState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}

export function CardCycleForm({ id, statementDay, dueDay }: { id: string; statementDay: number | null; dueDay: number | null }) {
  const [s, action, pending] = useActionState<CardState, FormData>(setCardCycleAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="accountId" value={id} />
      <label className="check"><span>Bill made on day</span><input name="statementDay" inputMode="numeric" defaultValue={statementDay ?? ""} className="input input--sm" style={{ width: 72 }} /></label>
      <label className="check"><span>Pay by day</span><input name="dueDay" inputMode="numeric" defaultValue={dueDay ?? ""} className="input input--sm" style={{ width: 72 }} /></label>
      <button className="btn btn--secondary" disabled={pending}>Save dates</button>
      <Msg s={s} />
    </form>
  );
}

export function PayCardForm({ id, amount, from }: { id: string; amount: string; from: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<CardState, FormData>(payCardAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="accountId" value={id} />
      <label className="visually-hidden" htmlFor={`pay-${id}`}>Amount paid</label>
      <input id={`pay-${id}`} name="amount" inputMode="decimal" defaultValue={amount} className="input input--sm" style={{ width: 130 }} />
      <select name="fromId" className="input input--sm" aria-label="Paid from">{from.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      <button className="btn btn--primary" disabled={pending || !from.length}>I paid this</button>
      <Msg s={s} />
    </form>
  );
}
