"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { addLinkAction, addWishAction, removeLinkAction, removeWishAction, setRatioAction, setStatusAction, type WishState } from "@/app/app/wishlist-actions";

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

export function WishForm({ categories }: { categories: Cat[] }) {
  const [s, action, pending] = useActionState<WishState, FormData>(addWishAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">what</span><input name="title" required maxLength={80} placeholder="55 inch tv" className="input" /></label>
      <label className="field"><span className="label">price</span><input name="price" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">kind</span>
        <select name="type" className="input" defaultValue="want"><option value="need">need</option><option value="want">want</option><option value="desire">desire</option></select>
      </label>
      <label className="field"><span className="label">priority</span>
        <select name="priority" className="input" defaultValue="2"><option value="1">high</option><option value="2">medium</option><option value="3">low</option></select>
      </label>
      <label className="field"><span className="label">link (optional)</span><input name="url" maxLength={500} placeholder="https://" className="input" /></label>
      <label className="field"><span className="label">want it by (optional)</span><input name="targetDate" type="date" className="input" /></label>
      <label className="field"><span className="label">category (optional)</span>
        <select name="categoryId" className="input" defaultValue=""><option value="">none</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label className="field"><span className="label">note (optional)</span><input name="notes" maxLength={300} className="input" /></label>
      <fieldset className="tx-form__wide fieldset">
        <legend className="label">if you would buy it on emi (optional)</legend>
        <div className="tx-form fieldset__grid">
          <label className="field"><span className="label">down payment</span><input name="down" inputMode="decimal" className="input" /></label>
          <label className="field"><span className="label">months</span><input name="tenure" inputMode="numeric" className="input" /></label>
          <label className="field"><span className="label">interest % (0 for no-cost)</span><input name="rate" inputMode="decimal" className="input" /></label>
        </div>
      </fieldset>
      <div className="tx-form__end"><Msg s={s} /><button className="btn btn--primary" disabled={pending}>add to wishlist</button></div>
    </form>
  );
}

export function LinkForm({ itemId }: { itemId: string }) {
  const [s, action, pending] = useActionState<WishState, FormData>(addLinkAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="itemId" value={itemId} />
      <label className="visually-hidden" htmlFor={`u-${itemId}`}>link</label>
      <input id={`u-${itemId}`} name="url" required placeholder="paste a link" maxLength={500} className="input input--sm" />
      <label className="visually-hidden" htmlFor={`p-${itemId}`}>price there</label>
      <input id={`p-${itemId}`} name="price" inputMode="decimal" placeholder="price there" className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>add link</button>
      <Msg s={s} />
    </form>
  );
}

export function StatusSelect({ id, status }: { id: string; status: Status }) {
  const [pending, start] = useTransition();
  return (
    <select className="input input--sm" aria-label="status" value={status} disabled={pending} onChange={(e) => start(() => setStatusAction(id, e.target.value as Status))}>
      <option value="wanted">wanted</option><option value="planned">planned</option><option value="bought">bought</option><option value="dropped">dropped</option>
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
      <RemoveIcon kind="link" id={id} label={`remove link ${label}`} />
    </span>
  );
}

export function RatioForm({ current }: { current: number }) {
  const [s, action, pending] = useActionState<WishState, FormData>(setRatioAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <label className="visually-hidden" htmlFor="ratio">largest share of income for emis, percent</label>
      <input id="ratio" name="ratio" inputMode="numeric" defaultValue={current} className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>save</button>
      <Msg s={s} />
    </form>
  );
}
