"use client";

import { useState, useTransition } from "react";
import { categorizeAction, transferAction } from "@/app/app/capture-actions";
import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";

type Row = { id: string; kind: "income" | "expense"; amountMinor: number; currency: string; payee: string | null; rawNarration: string | null; occurredOn: string; accountId: string; account: string };
type Cat = { id: string; name: string; kind: "income" | "expense" };
type Acct = { id: string; name: string; currency: string };

export function InboxList({ rows, categories, accounts }: { rows: Row[]; categories: Cat[]; accounts: Acct[] }) {
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => { const r = await fn(); setNote(r.error ?? r.message ?? null); });

  return (
    <div className="stack-sm">
      <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> remember my choice for similar entries</label>
      <p className="label" role="status">{note}</p>
      <ul className="inbox" aria-busy={pending}>
        {rows.map((r) => (
          <li key={r.id} className="inbox__row well">
            <div className="inbox__head">
              <div>
                <p>{r.payee || "unnamed"}</p>
                <p className="label">{formatDay(r.occurredOn)} in {r.account}{r.rawNarration ? ` — ${r.rawNarration.slice(0, 70)}` : ""}</p>
              </div>
              <p className="figure figure--s amt" data-kind={r.kind}>{formatMinor(r.kind === "income" ? r.amountMinor : -r.amountMinor, r.currency, { sign: true })}</p>
            </div>
            <div className="pills" role="group" aria-label={`category for ${r.payee ?? "entry"}`}>
              {categories.filter((c) => c.kind === r.kind).map((c) => (
                <button key={c.id} type="button" className="pill pill--outline" disabled={pending} onClick={() => run(() => categorizeAction(r.id, c.id, remember))}>{c.name}</button>
              ))}
              <select className="input input--sm" aria-label="make this a transfer" disabled={pending} value="" onChange={(e) => e.target.value && run(() => transferAction(r.id, e.target.value))}>
                <option value="">transfer with…</option>
                {accounts.filter((a) => a.id !== r.accountId && a.currency === r.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
