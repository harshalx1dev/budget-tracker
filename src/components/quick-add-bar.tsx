"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { quickAddAction } from "@/app/app/capture-actions";
import { dequeue, enqueue, isNetworkError, loadQueue, type Queued } from "@/lib/offline-queue";

const localDay = () => new Date().toLocaleDateString("en-CA");
const store = () => (typeof window === "undefined" ? null : window.localStorage);

function send(item: Queued) {
  const fd = new FormData();
  fd.set("q", item.text); fd.set("ref", item.ref); fd.set("asOf", item.asOf);
  return quickAddAction({}, fd);
}

export function QuickAddBar() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [pending, start] = useTransition();
  const flushing = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  // Send whatever is waiting, oldest first. Stops at the first network failure and tries again when back online.
  const flush = useCallback(async () => {
    const s = store();
    if (!s || flushing.current) return;
    flushing.current = true;
    try {
      for (const item of loadQueue(s)) {
        try {
          const r = await send(item);
          // The server answered (added, already added, or refused for a real reason): either way it is done with.
          setWaiting(dequeue(s, item.ref).length);
          if (r.error) setMsg({ text: `could not add "${item.text}": ${r.error}`, error: true });
          else setMsg({ text: `synced "${item.text}"` });
        } catch (e) {
          if (isNetworkError(e)) break;
          setWaiting(dequeue(s, item.ref).length);
        }
      }
    } finally { flushing.current = false; }
  }, []);

  useEffect(() => {
    // After mount (not during render) so server and client markup agree; then again whenever the connection returns.
    const t = setTimeout(() => { const s = store(); if (s) setWaiting(loadQueue(s).length); void flush(); }, 0);
    window.addEventListener("online", flush);
    return () => { clearTimeout(t); window.removeEventListener("online", flush); };
  }, [flush]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    if (!text) return setMsg({ text: "type something like: chai 20 cash", error: true });
    const item: Queued = { ref: crypto.randomUUID(), text, asOf: localDay(), at: Date.now() };
    const queue = () => { const s = store(); if (s) setWaiting(enqueue(s, item).length); setMsg({ text: "saved on this device, it will sync when you are back online" }); form.current?.reset(); };
    if (!navigator.onLine) return queue();
    start(async () => {
      try {
        const r = await send(item);
        if (r.error) return setMsg({ text: r.error, error: true });
        setMsg({ text: r.message ?? "added" });
        form.current?.reset();
        void flush();
      } catch (err) {
        if (isNetworkError(err)) queue(); else setMsg({ text: "something went wrong, try again", error: true });
      }
    });
  }

  return (
    <form ref={form} onSubmit={submit} className="quick" aria-busy={pending}>
      <label className="visually-hidden" htmlFor="q">quick add</label>
      <input id="q" name="q" className="input" autoComplete="off" placeholder="swiggy 450 upi yesterday" />
      <button className="btn btn--primary" disabled={pending}><Zap size={16} aria-hidden /> add</button>
      <p className="quick__msg label" role="status">
        {msg ? (msg.error ? <span className="error">{msg.text}</span> : msg.text) : "amount, a word for the account, and a day. start with + for income."}
        {waiting > 0 ? ` ${waiting} waiting to sync.` : ""}
      </p>
    </form>
  );
}
