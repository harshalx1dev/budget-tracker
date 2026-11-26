"use client";

import { useSyncExternalStore } from "react";

const KEY = "budggyy-safe-view";
const subscribe = (cb: () => void) => { window.addEventListener(KEY, cb); return () => window.removeEventListener(KEY, cb); };
const read = () => { try { return localStorage.getItem(KEY) === "accounts" ? "accounts" : "month"; } catch { return "month"; } };
const choose = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* private window: the choice just isn't kept */ } window.dispatchEvent(new Event(KEY)); };

/** Safe to spend, seen two ways: this pay cycle's money (the default), or everything the accounts can spare. */
export function SafeSwitch({ month, accounts }: { month: React.ReactNode; accounts: React.ReactNode }) {
  const view = useSyncExternalStore(subscribe, read, () => "month");
  return (
    <>
      <div className="safe-switch" role="group" aria-label="How to work out safe to spend">
        {[["month", "Monthly"], ["accounts", "From accounts"]].map(([v, label]) => (
          <button key={v} type="button" className="safe-switch__opt" aria-pressed={view === v} onClick={() => choose(v)}>{label}</button>
        ))}
      </div>
      {view === "month" ? month : accounts}
    </>
  );
}
