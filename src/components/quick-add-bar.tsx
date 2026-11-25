"use client";

import { useActionState, useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { quickAddAction, type CaptureState } from "@/app/app/capture-actions";

export function QuickAddBar() {
  const [state, action, pending] = useActionState<CaptureState, FormData>(quickAddAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.message) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="quick" aria-busy={pending}>
      <label className="visually-hidden" htmlFor="q">quick add</label>
      <input id="q" name="q" className="input" autoComplete="off" placeholder="swiggy 450 upi yesterday" />
      <button className="btn btn--primary" disabled={pending}><Zap size={16} aria-hidden /> add</button>
      <p className="quick__msg label" role="status">{state.error ? <span className="error">{state.error}</span> : state.message ?? "amount, a word for the account, and a day. start with + for income."}</p>
    </form>
  );
}
