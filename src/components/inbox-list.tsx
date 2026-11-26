"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { categorizeAction, suggestCategoriesAction, transferAction } from "@/app/app/capture-actions";
import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";

type Row = { id: string; kind: "income" | "expense"; amountMinor: number; currency: string; payee: string | null; rawNarration: string | null; occurredOn: string; accountId: string; account: string };
type Cat = { id: string; name: string; kind: "income" | "expense" };
type Acct = { id: string; name: string; currency: string };

export function InboxList({ rows, categories, accounts, aiEnabled }: { rows: Row[]; categories: Cat[]; accounts: Acct[]; aiEnabled: boolean }) {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => { const r = await fn(); setNote(r.error ?? r.message ?? null); });

  return (
    <div className="stack-sm">
      <p className="lead">Entries with no category yet, from quick add and imported statements. Pick one and the entry leaves this list.</p>
      <div className="head-row">
        <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my choice for similar entries</label>
        {aiEnabled && (
          <button type="button" className="btn btn--secondary" disabled={pending}
            onClick={() => start(async () => { const r = await suggestCategoriesAction(); if (r.error) setNote(r.error); else { setSuggestions(r.suggestions ?? {}); setNote(`${Object.keys(r.suggestions ?? {}).length} suggestions. Tap one to accept it.`); } })}>
            <Sparkles size={16} aria-hidden /> Suggest categories with AI
          </button>
        )}
      </div>
      <p className="label" role="status">{note}</p>
      <ul className="well rows" aria-busy={pending}>
        {rows.map((r) => {
          const own = categories.filter((c) => c.kind === r.kind);
          const suggested = own.find((c) => c.id === suggestions[r.id]);
          return (
            <li key={r.id} className="row inbox-row">
              <div>
                <p className="row__title">{r.payee || "Unnamed"}</p>
                <p className="label">{formatDay(r.occurredOn)}, {r.account}{r.rawNarration ? `, ${r.rawNarration.slice(0, 70)}` : ""}</p>
              </div>
              <p className="row__value amt" data-kind={r.kind}>{formatMinor(r.kind === "income" ? r.amountMinor : -r.amountMinor, r.currency, { sign: true })}</p>
              <div className="inbox-row__act" role="group" aria-label={`Category for ${r.payee ?? "entry"}`}>
                {suggested && <button type="button" className="pill pill--outline" data-suggested title="Suggested by AI" disabled={pending} onClick={() => run(() => categorizeAction(r.id, suggested.id, remember))}><Sparkles size={14} aria-hidden />{suggested.name}</button>}
                <select className="input input--sm" aria-label="Category" disabled={pending} value="" onChange={(e) => e.target.value && run(() => categorizeAction(r.id, e.target.value, remember))}>
                  <option value="">Choose a category</option>
                  {own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="input input--sm" aria-label="Make this a transfer" disabled={pending} value="" onChange={(e) => e.target.value && run(() => transferAction(r.id, e.target.value))}>
                  <option value="">Or a transfer with…</option>
                  {accounts.filter((a) => a.id !== r.accountId && a.currency === r.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
