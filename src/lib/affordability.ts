import { pmt } from "./schedule";

/**
 * Deterministic "can I afford this, and when". Everything is minor units and month indexes into a projection:
 * ends[k] is the projected balance at the end of month k, emiLoad[k] the EMIs already due in month k,
 * incomes[k] the income expected in month k. AI may explain these results; it never produces them.
 */
export type State = {
  startBalance: number;
  ends: number[];
  emiLoad: number[];
  incomes: number[];
  /** money already committed at the start of month k by purchases planned earlier in the sequence */
  upfront: number[];
  buffer: number;
  maxRatioPct: number;
};

export type Wish = {
  id: string;
  title: string;
  priceMinor: number;
  type: "need" | "want" | "desire";
  priority: number; // 1 high .. 3 low
  financing: { downMinor: number; tenure: number; ratePct: number } | null;
};

export type OutrightPlan = { method: "outright"; index: number };
export type EmiPlan = { method: "emi"; index: number; downMinor: number; emiMinor: number; tenure: number; totalInterestMinor: number; ratioUnknown: boolean };
export type Plan = OutrightPlan | EmiPlan;

const balanceBefore = (s: State, m: number) => (m === 0 ? s.startBalance : s.ends[m - 1]) - s.upfront[m];

/** Earliest month the whole price can be paid in one go without dipping under the buffer afterwards. */
export function outrightPlan(w: Wish, s: State): OutrightPlan | null {
  for (let m = 0; m < s.ends.length; m++) {
    const floor = Math.min(balanceBefore(s, m), Math.min(...s.ends.slice(m)));
    if (floor - w.priceMinor >= s.buffer) return { method: "outright", index: m };
  }
  return null;
}

export const emiFor = (w: Wish) => (w.financing ? pmt(Math.max(0, w.priceMinor - w.financing.downMinor), w.financing.ratePct, w.financing.tenure) : 0);

/**
 * Earliest month the down payment can be made and the monthly EMIs (from the following month) keep the balance
 * above the buffer and total EMIs within the allowed share of income.
 */
export function emiPlan(w: Wish, s: State): EmiPlan | null {
  const f = w.financing;
  if (!f) return null;
  const emi = emiFor(w);
  const H = s.ends.length;
  for (let m = 0; m < H; m++) {
    if (balanceBefore(s, m) - f.downMinor < s.buffer) continue;
    let ok = true;
    let ratioUnknown = false;
    // Instalments may run past the projection; carry the last known load, income and balance forward, never optimistically.
    const last = H - 1;
    for (let k = m; k <= m + f.tenure && ok; k++) {
      const paid = Math.max(0, Math.min(f.tenure, k - m));
      if (k <= last && s.ends[k] - f.downMinor - emi * paid < s.buffer) ok = false;
      if (k > last && s.ends[last] - f.downMinor - emi * paid < s.buffer) ok = false;
      if (k > m) {
        const inc = s.incomes[Math.min(k, last)];
        const load = s.emiLoad[Math.min(k, last)];
        if (inc > 0) { if (((load + emi) / inc) * 100 > s.maxRatioPct) ok = false; } else ratioUnknown = true;
      }
    }
    if (ok) return { method: "emi", index: m, downMinor: f.downMinor, emiMinor: emi, tenure: f.tenure, totalInterestMinor: Math.max(0, emi * f.tenure - (w.priceMinor - f.downMinor)), ratioUnknown };
  }
  return null;
}

/** Earlier plan wins; at the same month, paying outright wins because it costs no interest. */
export function bestPlan(w: Wish, s: State): Plan | null {
  const o = outrightPlan(w, s);
  const e = emiPlan(w, s);
  if (o && e) return e.index < o.index ? e : o;
  return o ?? e;
}

export function apply(plan: Plan, w: Wish, s: State): State {
  const ends = [...s.ends];
  const emiLoad = [...s.emiLoad];
  const upfront = [...s.upfront];
  upfront[plan.index] += plan.method === "outright" ? w.priceMinor : plan.downMinor;
  for (let k = plan.index; k < ends.length; k++) {
    if (plan.method === "outright") ends[k] -= w.priceMinor;
    else {
      ends[k] -= plan.downMinor + plan.emiMinor * Math.max(0, Math.min(plan.tenure, k - plan.index));
      if (k > plan.index && k <= plan.index + plan.tenure) emiLoad[k] += plan.emiMinor;
    }
  }
  return { ...s, ends, emiLoad, upfront };
}

const TYPE_RANK = { need: 0, want: 1, desire: 2 } as const;

/** Buying order: needs first, then priority, then cheaper first. Each purchase uses up room for the next. */
export function sequence(wishes: Wish[], s: State) {
  const order = [...wishes].sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.priority - b.priority || a.priceMinor - b.priceMinor || a.title.localeCompare(b.title));
  let state = s;
  return order.map((w) => {
    const plan = bestPlan(w, state);
    if (plan) state = apply(plan, w, state);
    return { wish: w, plan };
  });
}
