"use client";

import { useActionState, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { purchaseAction, type WishState } from "@/app/app/wishlist-actions";
import { EditDialog, useCloseWhenSaved } from "./edit-dialog";
import { Field } from "./field";
import { formatMinor } from "@/lib/money";

export type Buyable = { id: string; title: string; priceMinor: number; left: number; categoryId: string | null };
type Opt = { id: string; name: string };
type Props = { item: Buyable; accounts: Opt[]; categories: Opt[]; currency: string };

const localToday = () => new Date().toLocaleDateString("en-CA");

function BuyForm({ item, accounts, categories, currency }: Props) {
  const [s, action, pending] = useActionState<WishState, FormData>(purchaseAction, {});
  useCloseWhenSaved(s);
  const [count, setCount] = useState(String(item.left));
  // the planned price follows the number bought until something else is typed
  const [paid, setPaid] = useState<string | null>(null);
  const [record, setRecord] = useState(true);
  const planned = item.priceMinor * (Number(count) || 0);
  return (
    <form action={action} className="tx-form" aria-busy={pending}>
      <input type="hidden" name="id" value={item.id} />
      <p className="label tx-form__wide">{item.title}. Planned at {formatMinor(item.priceMinor, currency)}{item.left > 1 ? ` each, ${item.left} still to buy` : ""}.</p>
      {item.left > 1
        ? <Field label="How many did you buy"><input name="count" inputMode="numeric" required value={count} onChange={(e) => setCount(e.target.value)} className="input" /></Field>
        : <input type="hidden" name="count" value="1" />}
      <Field label="Total you paid" hint="Change this if the price was different from what you planned."><input name="paid" inputMode="decimal" required={record} value={paid ?? String(planned / 100)} onChange={(e) => setPaid(e.target.value)} className="input" /></Field>
      <label className="switch tx-form__wide"><input type="checkbox" role="switch" name="record" checked={record} onChange={(e) => setRecord(e.target.checked)} /><span>Add it to my transactions</span></label>
      {record && (
        <>
          <Field label="Paid from" hint="Choose the credit card if you used it, and the amount joins that card's bill."><select name="accountId" className="input">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Date"><input name="date" type="date" required max={localToday()} defaultValue={localToday()} suppressHydrationWarning className="input" /></Field>
          <Field label="Category"><select name="categoryId" className="input" defaultValue={item.categoryId ?? categories.find((c) => c.name === "Shopping")?.id ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </>
      )}
      <div className="tx-form__end">
        <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : null}</p>
        <button className="btn btn--primary" disabled={pending}>Mark bought</button>
      </div>
    </form>
  );
}

/** "I bought this": asks what was really paid, and records it. */
export function BuyButton(props: Props) {
  return (
    <EditDialog label={`Bought: ${props.item.title}`} trigger={<><ShoppingBag size={14} aria-hidden /> Bought</>}>
      <BuyForm {...props} />
    </EditDialog>
  );
}
