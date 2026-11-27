"use client";

import { useSyncExternalStore } from "react";
import { formatMinor } from "@/lib/money";
import { formatDay, shiftDays } from "@/lib/dates";

export type Upcoming = { key: string; name: string; dueOn: string; amountMinor: number; income: boolean };

const KEY = "budggyy-upcoming-days";
const CHOICES = [7, 15, 30] as const;
const subscribe = (cb: () => void) => { window.addEventListener(KEY, cb); return () => window.removeEventListener(KEY, cb); };
const read = () => { try { const n = Number(localStorage.getItem(KEY)); return (CHOICES as readonly number[]).includes(n) ? n : 15; } catch { return 15; } };
const choose = (n: number) => { try { localStorage.setItem(KEY, String(n)); } catch { /* private window: not kept */ } window.dispatchEvent(new Event(KEY)); };

/** What is due in and out over the next few days. Anything already late is always shown. */
export function UpcomingList({ items, today, home }: { items: Upcoming[]; today: string; home: string }) {
  const days = useSyncExternalStore(subscribe, read, () => 15);
  const shown = items.filter((i) => i.dueOn <= shiftDays(today, days));
  const out = shown.filter((i) => !i.income).reduce((s, i) => s + i.amountMinor, 0);
  const money = (v: number) => formatMinor(v, home, { whole: true });
  return (
    <>
      <div className="panel__tools">
        <p className="label">{out > 0 ? `${money(out)} to pay` : "Nothing to pay"} in the next {days} days</p>
        <div className="seg" role="group" aria-label="How far ahead">
          {CHOICES.map((n) => <button key={n} type="button" className="seg__opt" data-on={days === n} aria-pressed={days === n} onClick={() => choose(n)}>{n} days</button>)}
        </div>
      </div>
      {shown.length === 0 ? <p className="label">Nothing is due in this window.</p> : (
        <ul className="lines">
          {shown.map((i) => (
            <li key={i.key}>
              <span className="lines__when" data-late={i.dueOn < today || undefined}>{i.dueOn < today ? `Late, ${formatDay(i.dueOn)}` : i.dueOn === today ? "Today" : formatDay(i.dueOn)}</span>
              <span className="lines__what">{i.name}</span>
              <span className="lines__sum amt" data-kind={i.income ? "income" : "expense"}>{i.income ? "+" : ""}{money(i.amountMinor)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
