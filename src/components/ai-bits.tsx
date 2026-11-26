"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { removeKeyAction, saveKeyAction, type AiState } from "@/app/app/ai-actions";

export function AiKeyForm({ connected, usedToday }: { connected: { last4: string } | null; usedToday: number }) {
  const [s, action, pending] = useActionState<AiState, FormData>(saveKeyAction, {});
  const [removing, startRemove] = useTransition();
  return (
    <div className="stack-sm">
      {connected ? (
        <p>Connected to Gemini, key ending in {connected.last4}. <span className="label">{usedToday} AI requests in the last day.</span></p>
      ) : (
        <p className="label">No key yet. AI features stay off until you add one; everything else works without it. Get a free key at <a className="link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</p>
      )}
      <form action={action} className="inline-form" aria-busy={pending}>
        <label className="visually-hidden" htmlFor="gkey">Gemini API key</label>
        <input id="gkey" name="key" type="password" autoComplete="off" spellCheck={false} placeholder={connected ? "replace the key" : "paste your Gemini API key"} className="input input--sm" />
        <button className="btn btn--primary" disabled={pending}>{pending ? "checking" : connected ? "replace key" : "save key"}</button>
        {connected && <button type="button" className="btn btn--secondary" disabled={removing} onClick={() => startRemove(() => removeKeyAction())}>remove</button>}
        <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>
      </form>
      <p className="label">The key is encrypted before it is stored and is only used for your own requests.</p>
    </div>
  );
}

/** A button that runs one AI action and shows its error; the saved text re-renders from the server. */
export function AiButton({ label, run, enabled }: { label: string; run: () => Promise<AiState>; enabled: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!enabled) return <p className="label"><Link href="/app/settings" className="link">Add a Gemini key in settings</Link> to use this.</p>;
  return (
    <span className="match-now">
      <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => start(async () => { const r = await run(); setNote(r.error ?? null); })}>
        <Sparkles size={16} aria-hidden /> {pending ? "thinking" : label}
      </button>
      <span className="label error" role="status">{note}</span>
    </span>
  );
}
