"use client";

import { useActionState, useState } from "react";
import { setAutoEmiAction, type WishState } from "@/app/app/wishlist-actions";

/** Settings: give big wishlist items an EMI option on standing terms. Off until switched on. */
export function AutoEmiForm({ on, over, months, rate }: { on: boolean; over: string; months: number; rate: string }) {
  const [s, action, pending] = useActionState<WishState, FormData>(setAutoEmiAction, {});
  const [checked, setChecked] = useState(on);
  return (
    <form action={action} className="stack-sm" aria-busy={pending}>
      <label className="switch">
        <input type="checkbox" role="switch" name="on" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>Offer an EMI option on big purchases</span>
      </label>
      <div className="inline-form">
        <label className="check"><span>Above</span><input name="over" inputMode="decimal" defaultValue={over} className="input input--sm" style={{ width: 120 }} /></label>
        <label className="check"><span>Months</span><input name="months" inputMode="numeric" defaultValue={months} className="input input--sm" style={{ width: 72 }} /></label>
        <label className="check"><span>Yearly interest %</span><input name="rate" inputMode="decimal" defaultValue={rate} className="input input--sm" style={{ width: 80 }} /></label>
        <button className="btn btn--secondary" disabled={pending}>Save</button>
      </div>
      <p className="label">The rate is an estimate to plan with. Card EMIs in India run roughly 10% to 25% a year depending on the bank and your credit score; no-cost EMI offers are 0%. An item with its own EMI terms keeps them.</p>
      <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>
    </form>
  );
}
