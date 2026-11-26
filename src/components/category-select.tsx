"use client";

import { useState, useTransition } from "react";
import { categorizeAction } from "@/app/app/capture-actions";

/** The category cell of the ledger: pick to set or change it. An entry waiting for one is marked, and picking confirms it. */
export function CategorySelect({ id, value, needsReview, label, options }: { id: string; value: string | null; needsReview: boolean; label: string; options: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        key={value ?? "none"}
        className="input input--sm cat-select"
        data-review={needsReview || undefined}
        aria-label={label}
        aria-busy={pending}
        disabled={pending}
        defaultValue={value ?? ""}
        onChange={(e) => { const next = e.target.value; start(async () => { const r = await categorizeAction(id, next, false); setError(r.error ?? null); }); }}
      >
        {!value && <option value="" disabled>{needsReview ? "Pick a category" : "No category"}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
