"use client";

import { useActionState } from "react";
import { payCardAction, setCardCycleAction, type CardState } from "@/app/app/card-actions";
import { Field } from "./field";

function Msg({ s }: { s: CardState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}

export function CardCycleForm({ id, statementDay, dueDay }: { id: string; statementDay: number | null; dueDay: number | null }) {
  const [s, action, pending] = useActionState<CardState, FormData>(setCardCycleAction, {});
  return (
    <form action={action} className="card-form" aria-busy={pending}>
      <input type="hidden" name="accountId" value={id} />
      <Field label="Bill date" hint="The day of the month your bank makes the card statement. Enter just the number, for example 15.">
        <input name="statementDay" inputMode="numeric" placeholder="15" defaultValue={statementDay ?? ""} className="input" />
      </Field>
      <Field label="Due date" hint="The day of the month the bill must be paid by, for example 5. It counts against the salary that arrives before it.">
        <input name="dueDay" inputMode="numeric" placeholder="5" defaultValue={dueDay ?? ""} className="input" />
      </Field>
      <button className="btn btn--secondary" disabled={pending}>Save dates</button>
      <Msg s={s} />
    </form>
  );
}

export function PayCardForm({ id, amount, from }: { id: string; amount: string; from: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<CardState, FormData>(payCardAction, {});
  return (
    <form action={action} className="card-form" aria-busy={pending}>
      <input type="hidden" name="accountId" value={id} />
      <Field label="Amount paid"><input name="amount" inputMode="decimal" defaultValue={amount} className="input" /></Field>
      <Field label="Paid from"><select name="fromId" className="input">{from.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <button className="btn btn--primary" disabled={pending || !from.length}>I paid this</button>
      <Msg s={s} />
    </form>
  );
}
