"use client";

import { useTransition } from "react";
import { setGoalFixedAction } from "@/app/app/plan-actions";

/** Fixed goals are held back from free-to-spend like a bill; flexible ones only when money is put aside. */
export function GoalFirmness({ id, fixed, name }: { id: string; fixed: boolean; name: string }) {
  const [pending, start] = useTransition();
  return (
    <select className="input input--sm" aria-label={`How firm is ${name}`} aria-busy={pending} disabled={pending} key={String(fixed)} defaultValue={fixed ? "yes" : "no"}
      onChange={(e) => { const next = e.target.value === "yes"; start(() => setGoalFixedAction(id, next)); }}>
      <option value="no">Flexible: only what I put aside</option>
      <option value="yes">Fixed: hold it back every month</option>
    </select>
  );
}
