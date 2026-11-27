"use client";

import { useActionState } from "react";
import { renameCategoryAction, updateAccountAction, updateTransactionAction, type EditState } from "@/app/app/edit-actions";
import { Field } from "./field";
import { useCloseWhenSaved } from "./edit-dialog";

function Foot({ s, pending }: { s: EditState; pending: boolean }) {
  return (
    <div className="tx-form__end">
      <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>
      <button className="btn btn--primary" disabled={pending}>Save changes</button>
    </div>
  );
}

export function AccountEditForm({ account }: { account: { id: string; name: string; type: string; aliases: string; balance: string; saving: boolean } }) {
  const [s, action, pending] = useActionState<EditState, FormData>(updateAccountAction, {});
  useCloseWhenSaved(s);
  const card = account.type === "card";
  return (
    <form action={action} className="tx-form" aria-busy={pending}>
      <input type="hidden" name="id" value={account.id} />
      <Field label="Name"><input name="name" required maxLength={40} defaultValue={account.name} className="input" /></Field>
      <Field label={card ? "Amount you owe now" : account.saving ? "Money put in so far" : "Balance now"} hint={card ? "What you owe on the card today. The figure is corrected without adding any transaction." : "Set this to what the account really holds. The figure is corrected without adding any transaction."}>
        <input name="balance" inputMode="decimal" defaultValue={account.balance} className="input" />
      </Field>
      {!account.saving && <Field label="Quick-add words" hint="Words that send a quick-add entry to this account, such as upi or gpay."><input name="aliases" maxLength={120} defaultValue={account.aliases} className="input" /></Field>}
      <Foot s={s} pending={pending} />
    </form>
  );
}

type Opt = { id: string; name: string };

export function TransactionEditForm({ tx, accounts, categories }: {
  tx: { id: string; kind: "income" | "expense"; amount: string; currency: string; accountId: string; categoryId: string | null; payee: string; note: string; occurredOn: string; transfer: boolean };
  accounts: (Opt & { currency?: string })[]; categories: (Opt & { kind: "income" | "expense" })[];
}) {
  const [s, action, pending] = useActionState<EditState, FormData>(updateTransactionAction, {});
  useCloseWhenSaved(s);
  return (
    <form action={action} className="tx-form" aria-busy={pending}>
      <input type="hidden" name="id" value={tx.id} />
      <input type="hidden" name="currency" value={tx.currency} />
      <input type="hidden" name="kind" value={tx.kind} />
      <Field label="Amount"><input name="amount" inputMode="decimal" required defaultValue={tx.amount} className="input" /></Field>
      <Field label="Date"><input name="occurredOn" type="date" required defaultValue={tx.occurredOn} className="input" /></Field>
      {tx.transfer ? <p className="label tx-form__wide">This is a transfer between two of your accounts, so the amount and date change on both sides.</p> : (
        <>
          <Field label="Account"><select name="accountId" className="input" defaultValue={tx.accountId}>{accounts.filter((a) => !a.currency || a.currency === tx.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Category"><select name="categoryId" className="input" defaultValue={tx.categoryId ?? ""}><option value="">None</option>{categories.filter((c) => c.kind === tx.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label={tx.kind === "income" ? "From" : "Paid to"}><input name="payee" maxLength={80} defaultValue={tx.payee} className="input" /></Field>
          <Field label="Note"><input name="note" maxLength={200} defaultValue={tx.note} className="input" /></Field>
        </>
      )}
      <Foot s={s} pending={pending} />
    </form>
  );
}

export function CategoryRenameForm({ id, name }: { id: string; name: string }) {
  const [s, action, pending] = useActionState<EditState, FormData>(renameCategoryAction, {});
  useCloseWhenSaved(s);
  return (
    <form action={action} className="tx-form" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <Field label="Name"><input name="name" required maxLength={40} defaultValue={name} className="input" /></Field>
      <Foot s={s} pending={pending} />
    </form>
  );
}
