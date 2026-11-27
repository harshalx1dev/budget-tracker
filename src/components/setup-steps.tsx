"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";

const KEY = "budggyy-setup-skipped";
const subscribe = (cb: () => void) => { window.addEventListener(KEY, cb); return () => window.removeEventListener(KEY, cb); };
const read = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const skip = (title: string) => { try { localStorage.setItem(KEY, `${read()}|${title}`); } catch { /* private window: it comes back next visit */ } window.dispatchEvent(new Event(KEY)); };

/** First run: the few things free-to-spend needs before it means anything. A step that can be empty can be waved off. */
export function SetupSteps({ steps }: { steps: { done: boolean; title: string; why: string; href: string; none?: string }[] }) {
  const skipped = useSyncExternalStore(subscribe, read, () => "");
  const settled = (s: (typeof steps)[number]) => s.done || skipped.includes(s.title);
  if (steps.every(settled)) return null;
  return (
    <section className="well setup" aria-labelledby="setup-h">
      <h2 id="setup-h">Set up in a few minutes</h2>
      <ol className="rows">
        {steps.map((s, i) => (
          <li key={s.title} className="row setup__row" data-done={settled(s) || undefined}>
            <span className="stat__icon" aria-hidden>{settled(s) ? <Check size={17} /> : i + 1}</span>
            <div><p className="row__title">{s.title}</p><p className="label">{s.why}</p></div>
            {settled(s) ? <span className="label">Done</span> : (
              <span className="head-actions">
                {s.none && <button type="button" className="pill" onClick={() => skip(s.title)}>{s.none}</button>}
                <Link href={s.href} className="btn btn--secondary">Start</Link>
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
