"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { addLinkAction, addWishAction, buyUnitsAction, chooseLinkAction, removeLinkAction, removeWishAction, setRatioAction, setStatusAction, updateWishAction, type WishState } from "@/app/app/wishlist-actions";

type Cat = { id: string; name: string };
type Status = "wanted" | "planned" | "bought" | "dropped";

function Msg({ s }: { s: WishState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}
function useReset(s: WishState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return ref;
}

export type EditableWish = {
  id: string; title: string; price: string; quantity: number; type: string; priority: number; targetDate: string | null; categoryId: string | null; notes: string | null;
  down: string; tenure: number | null; rate: string;
};

/** Adds an item, or edits one when `item` is given. */
export function WishForm({ categories, item }: { categories: Cat[]; item?: EditableWish }) {
  const [s, action, pending] = useActionState<WishState, FormData>(item ? updateWishAction : addWishAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message && !item) ref.current?.reset(); }, [s, item]);
  return (
    <form ref={ref} action={action} className={item ? "tx-form wish__edit" : "well tx-form"} aria-busy={pending}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="field"><span className="label">What</span><input name="title" required maxLength={80} placeholder="55 inch TV" defaultValue={item?.title} className="input" /></label>
      <label className="field"><span className="label">Price of one</span><input name="price" inputMode="decimal" required defaultValue={item?.price} className="input" /></label>
      <label className="field"><span className="label">How many</span><input name="quantity" inputMode="numeric" required defaultValue={item?.quantity ?? 1} className="input" /></label>
      <label className="field"><span className="label">Kind</span>
        <select name="type" className="input" defaultValue={item?.type ?? "want"}><option value="need">Must have</option><option value="want">Nice to have</option><option value="desire">Someday</option></select>
      </label>
      <label className="field"><span className="label">Priority</span>
        <select name="priority" className="input" defaultValue={String(item?.priority ?? 2)}><option value="1">High</option><option value="2">Medium</option><option value="3">Low</option></select>
      </label>
      {!item && <label className="field"><span className="label">Link (optional)</span><input name="url" maxLength={500} placeholder="https://" className="input" /></label>}
      <label className="field"><span className="label">Want it by (optional)</span><input name="targetDate" type="date" defaultValue={item?.targetDate ?? ""} className="input" /></label>
      <label className="field"><span className="label">Category (optional)</span>
        <select name="categoryId" className="input" defaultValue={item?.categoryId ?? ""}><option value="">None</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label className="field"><span className="label">Note (optional)</span><input name="notes" maxLength={300} defaultValue={item?.notes ?? ""} className="input" /></label>
      <fieldset className="tx-form__wide fieldset">
        <legend className="label">If you would buy it on EMI (optional)</legend>
        <div className="tx-form fieldset__grid">
          <label className="field"><span className="label">Down payment</span><input name="down" inputMode="decimal" defaultValue={item?.down} className="input" /></label>
          <label className="field"><span className="label">Months</span><input name="tenure" inputMode="numeric" defaultValue={item?.tenure ?? ""} className="input" /></label>
          <label className="field"><span className="label">Interest % (0 for no-cost)</span><input name="rate" inputMode="decimal" defaultValue={item?.rate} className="input" /></label>
        </div>
      </fieldset>
      <div className="tx-form__end"><Msg s={s} /><button className="btn btn--primary" disabled={pending}>{item ? "Save changes" : "Add to wishlist"}</button></div>
    </form>
  );
}

export function BuyUnitsForm({ id, left }: { id: string; left: number }) {
  const [s, action, pending] = useActionState<WishState, FormData>(buyUnitsAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <label className="check"><span>Bought</span><input key={left} name="count" inputMode="numeric" defaultValue={left} className="input input--sm" style={{ width: 72 }} /></label>
      <button className="btn btn--secondary" disabled={pending}>Save</button>
      {s.error && <span className="error" role="alert">{s.error}</span>}
    </form>
  );
}

export function UseOptionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="pill pill--outline" disabled={pending} onClick={() => start(() => chooseLinkAction(id))}>Use this price</button>;
}

export function LinkForm({ itemId }: { itemId: string }) {
  const [s, action, pending] = useActionState<WishState, FormData>(addLinkAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="itemId" value={itemId} />
      <label className="visually-hidden" htmlFor={`u-${itemId}`}>Link</label>
      <input id={`u-${itemId}`} name="url" required placeholder="Paste a link" maxLength={500} className="input input--sm" />
      <label className="visually-hidden" htmlFor={`n-${itemId}`}>Name of this option</label>
      <input id={`n-${itemId}`} name="label" placeholder="Name of this option" maxLength={60} className="input input--sm" />
      <label className="visually-hidden" htmlFor={`p-${itemId}`}>Price there</label>
      <input id={`p-${itemId}`} name="price" inputMode="decimal" placeholder="Price there" className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>Add option</button>
      <Msg s={s} />
    </form>
  );
}

export function BoughtButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(() => setStatusAction(id, "bought"))}>Mark bought</button>;
}

export function StatusSelect({ id, status }: { id: string; status: Status }) {
  const [pending, start] = useTransition();
  return (
    <select className="input input--sm" aria-label="Status" value={status} disabled={pending} onChange={(e) => start(() => setStatusAction(id, e.target.value as Status))}>
      <option value="wanted">Wanted</option><option value="planned">Planned</option><option value="bought">Bought</option><option value="dropped">Dropped</option>
    </select>
  );
}

export function RemoveIcon({ kind, id, label }: { kind: "wish" | "link"; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="icon-btn" aria-label={label} disabled={pending} onClick={() => start(async () => { if (kind === "wish") await removeWishAction(id); else await removeLinkAction(id); })}>
      <Trash2 size={16} aria-hidden />
    </button>
  );
}

export function LinkChip({ id, url, label, price }: { id: string; url: string; label: string; price: string | null }) {
  return (
    <span className="chip">
      <a href={url} target="_blank" rel="noopener noreferrer" className="link"><ExternalLink size={14} aria-hidden /> {label}{price ? ` ${price}` : ""}</a>
      <RemoveIcon kind="link" id={id} label={`Remove link ${label}`} />
    </span>
  );
}

export function RatioForm({ current }: { current: number }) {
  const [s, action, pending] = useActionState<WishState, FormData>(setRatioAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <label className="visually-hidden" htmlFor="ratio">Largest share of income for EMIs, percent</label>
      <input id="ratio" name="ratio" inputMode="numeric" defaultValue={current} className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>Save</button>
      <Msg s={s} />
    </form>
  );
}
