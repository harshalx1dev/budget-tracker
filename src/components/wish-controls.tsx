"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { KINDS, PRIORITIES, SORTS, WHENS, type View } from "@/lib/wish-view";

export function WishControls({ view }: { view: View }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();

  const go = (next: View) => {
    const q = new URLSearchParams(Object.entries(next).filter(([k, v]) => v && !(k === "sort" && v === "plan")));
    start(() => router.replace(q.size ? `${path}?${q}` : path, { scroll: false }));
  };
  const field = (key: keyof View, label: string, options: readonly (readonly [string, string])[], all?: string) => (
    <label className="field"><span className="label">{label}</span>
      <select className="input input--sm" value={view[key]} onChange={(e) => go({ ...view, [key]: e.target.value })}>
        {all && <option value="">{all}</option>}
        {options.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="wish__controls" role="group" aria-label="Sort and filter" aria-busy={pending}>
      {field("sort", "Sort by", SORTS)}
      {field("kind", "Kind", KINDS, "All kinds")}
      {field("priority", "Priority", PRIORITIES, "Any priority")}
      {field("when", "When", WHENS, "Any time")}
      {(view.kind || view.priority || view.when) && <button type="button" className="pill" onClick={() => go({ ...view, kind: "", priority: "", when: "" })}>Clear filters</button>}
    </div>
  );
}
