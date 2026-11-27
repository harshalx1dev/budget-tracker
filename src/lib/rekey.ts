import { daysBetween } from "./dates";

/**
 * When a bill's dates are edited, what was already marked paid must follow it to the new date, or every past
 * payment would look unpaid. Each old date moves to the nearest new one within `tolerance` days that no other has
 * taken; null means nothing is close enough and the link should be dropped.
 */
export function rekeyDates(paid: string[], dates: string[], tolerance: number) {
  const free = new Set(dates);
  const out = new Map<string, string | null>();
  // dates that did not move keep their link first
  for (const p of paid) if (free.delete(p)) out.set(p, p);
  for (const p of [...paid].sort()) {
    if (out.has(p)) continue;
    let best: string | null = null;
    for (const d of free) if (Math.abs(daysBetween(p, d)) <= tolerance && (best === null || Math.abs(daysBetween(p, d)) < Math.abs(daysBetween(p, best)))) best = d;
    if (best) free.delete(best);
    out.set(p, best);
  }
  return out;
}
