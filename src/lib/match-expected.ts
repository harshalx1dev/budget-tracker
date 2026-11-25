import { daysBetween } from "./dates";
import { normalizePayee } from "./narration";

export type Expected = { key: string; kind: "income" | "expense"; dueOn: string; amountMinor: number; accountId: string | null; pattern: string | null };
export type Candidate = { id: string; kind: "income" | "expense"; occurredOn: string; amountMinor: number; accountId: string; text: string };

const DAYS = 4;
const DRIFT = 0.1;

/**
 * Pairs each expected payment with at most one transaction. With a pattern, the text must contain it and the
 * amount may drift 10% (a revised EMI still matches); without one, the amount must be exact.
 * Closest dates are paired first so neighbouring months cannot steal each other's payment.
 */
export function matchExpected(expected: Expected[], candidates: Candidate[]): Map<string, string> {
  const pairs: { key: string; id: string; gap: number }[] = [];
  for (const e of expected) {
    const pat = e.pattern ? normalizePayee(e.pattern) : null;
    for (const c of candidates) {
      if (c.kind !== e.kind) continue;
      if (e.accountId && c.accountId !== e.accountId) continue;
      const gap = Math.abs(daysBetween(e.dueOn, c.occurredOn));
      if (gap > DAYS) continue;
      if (pat) {
        if (!normalizePayee(c.text).includes(pat)) continue;
        if (Math.abs(c.amountMinor - e.amountMinor) > e.amountMinor * DRIFT) continue;
      } else if (c.amountMinor !== e.amountMinor) continue;
      pairs.push({ key: e.key, id: c.id, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap);
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.key) || used.has(p.id)) continue;
    out.set(p.key, p.id);
    used.add(p.id);
  }
  return out;
}
