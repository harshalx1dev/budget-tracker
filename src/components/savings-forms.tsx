"use client";

import { useCloseWhenSaved } from "./edit-dialog";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addAssetAction, addDepositAction, addValuationAction, archiveDepositAction, recordMaturityAction, setEmergencyAction, type SavingsState } from "@/app/app/savings-actions";
import { ASSET_TYPES, TYPE_LABELS } from "@/lib/savings";

type Acct = { id: string; name: string };

const localToday = () => new Date().toLocaleDateString("en-CA");

function Msg({ s }: { s: SavingsState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}
function useReset(s: SavingsState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return ref;
}

export function AssetForm() {
  const [s, action, pending] = useActionState<SavingsState, FormData>(addAssetAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">Name</span><input name="name" required maxLength={60} placeholder="Nifty index fund" className="input" /></label>
      <label className="field"><span className="label">Type</span>
        <select name="type" className="input" defaultValue="mutual_fund">{ASSET_TYPES.filter((t) => t !== "fd").map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select>
      </label>
      <label className="field"><span className="label">Invested so far</span><input name="invested" inputMode="decimal" placeholder="0" className="input" /></label>
      <label className="field"><span className="label">Worth today (optional)</span><input name="value" inputMode="decimal" className="input" /></label>
      <div className="tx-form__end"><Msg s={s} /><button className="btn btn--primary" disabled={pending}>Add account</button></div>
    </form>
  );
}

export function ValuationForm({ accountId }: { accountId: string }) {
  const [s, action, pending] = useActionState<SavingsState, FormData>(addValuationAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="accountId" value={accountId} />
      <label className="visually-hidden" htmlFor={`v-${accountId}`}>Worth today</label>
      <input id={`v-${accountId}`} name="value" inputMode="decimal" required placeholder="Worth today" className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>Update value</button>
      <Msg s={s} />
    </form>
  );
}

export type EditableDeposit = { id: string; name: string; principal: string; rate: string; payoutAccountId: string; startOn: string; maturityOn: string; maturity: string };

export function DepositForm({ payoutAccounts, item }: { payoutAccounts: Acct[]; item?: EditableDeposit }) {
  const [s, action, pending] = useActionState<SavingsState, FormData>(addDepositAction, {});
  const ref = useReset(s);
  useCloseWhenSaved(s);
  return (
    <form ref={ref} action={action} className={item ? "tx-form" : "well tx-form"} aria-busy={pending}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="field"><span className="label">Name</span><input name="name" required maxLength={60} placeholder="HDFC FD" defaultValue={item?.name} className="input" /></label>
      <label className="field"><span className="label">Amount deposited</span><input name="principal" inputMode="decimal" required defaultValue={item?.principal} className="input" /></label>
      <label className="field"><span className="label">Interest rate %</span><input name="rate" inputMode="decimal" required defaultValue={item?.rate} className="input" /></label>
      <label className="field"><span className="label">Pays out to</span>
        <select name="payoutAccountId" className="input" defaultValue={item?.payoutAccountId ?? ""}><option value="">First bank account</option>{payoutAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label className="field"><span className="label">Started on</span><input name="startOn" type="date" required defaultValue={item?.startOn ?? localToday()} suppressHydrationWarning className="input" /></label>
      <label className="field"><span className="label">Matures on</span><input name="maturityOn" type="date" required defaultValue={item?.maturityOn} className="input" /></label>
      <label className="field"><span className="label">Maturity amount (if the bank states it)</span><input name="maturityAmount" inputMode="decimal" defaultValue={item?.maturity} className="input" /></label>
      <div className="tx-form__end"><Msg s={s} /><button className="btn btn--primary" disabled={pending}>{item ? "Save changes" : "Add deposit"}</button></div>
    </form>
  );
}

export function MaturityButtons({ id, matured }: { id: string; matured: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="head-actions">
      {matured && <button type="button" className="btn btn--primary" disabled={pending} onClick={() => start(async () => { await recordMaturityAction(id); })}>Record payout</button>}
      <button type="button" className="icon-btn" aria-label="Remove this deposit" disabled={pending} onClick={() => start(async () => { await archiveDepositAction(id); })}><Trash2 size={16} aria-hidden /></button>
    </span>
  );
}

export function EmergencyForm({ months, accountId, assets }: { months: number; accountId: string | null; assets: Acct[] }) {
  const [s, action, pending] = useActionState<SavingsState, FormData>(setEmergencyAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <label className="check"><span>Months of essentials</span><input name="months" inputMode="numeric" defaultValue={months} className="input input--sm" style={{ width: 80 }} /></label>
      <label className="check"><span>Held in</span>
        <select name="accountId" className="input input--sm" defaultValue={accountId ?? ""}><option value="">Choose an account</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <button className="btn btn--secondary" disabled={pending}>Save</button>
      <Msg s={s} />
    </form>
  );
}
