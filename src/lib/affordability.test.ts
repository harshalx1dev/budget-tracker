import { test } from "node:test";
import assert from "node:assert/strict";
import { emiTerms, apply, bestPlan, emiFor, emiPlan, outrightPlan, sequence, type State, type Wish } from "./affordability";

// ₹ amounts in paise. Balance grows by ₹20,000 a month from ₹30,000; income ₹60,000; one existing EMI of ₹10,000 until month 3.
const base = (over: Partial<State> = {}): State => ({
  startBalance: 3000000,
  ends: Array.from({ length: 12 }, (_, k) => 3000000 + 2000000 * (k + 1)),
  emiLoad: Array.from({ length: 12 }, (_, k) => (k <= 3 ? 1000000 : 0)),
  incomes: Array(12).fill(6000000),
  upfront: Array(12).fill(0),
  buffer: 1000000,
  maxRatioPct: 40,
  ...over,
});
const wish = (over: Partial<Wish> = {}): Wish => ({ id: "w", title: "tv", priceMinor: 4000000, type: "want", priority: 2, financing: null, ...over });

test("outright: earliest month the price fits above the buffer", () => {
  // needs balance - 40,000 >= 10,000, i.e. >= 50,000. Before month 0 balance 30,000: no. Before month 1: 50,000 yes.
  assert.equal(outrightPlan(wish(), base())!.index, 1);
  assert.equal(outrightPlan(wish({ priceMinor: 1500000 }), base())!.index, 0);
  assert.equal(outrightPlan(wish({ priceMinor: 99999999 }), base()), null);
});

test("outright: a later dip blocks an early purchase", () => {
  const s = base({ ends: [5000000, 5200000, 1200000, 6000000, 7000000, 8000000, 9000000, 9500000, 9900000, 10000000, 10100000, 10200000] });
  const p = outrightPlan(wish({ priceMinor: 1500000 }), s)!;
  assert.ok(p.index >= 3, `bought at ${p.index}, before the dip is over`);
});

test("emi: down payment plus instalments must keep the buffer; ratio limit holds", () => {
  const w = wish({ priceMinor: 6000000, financing: { downMinor: 600000, tenure: 6, ratePct: 0 } });
  assert.equal(emiFor(w), 900000);
  const p = emiPlan(w, base())!;
  assert.equal(p.emiMinor, 900000);
  assert.equal(p.totalInterestMinor, 0);
  // existing EMI 10,000 + new 9,000 = 19,000 of 60,000 = 31.7%, under 40%, so month 0 works (balance 30,000 - 6,000 >= 10,000).
  assert.equal(p.index, 0);
});

test("emi: blocked by the income ratio until the existing EMI ends", () => {
  const w = wish({ priceMinor: 6000000, financing: { downMinor: 0, tenure: 6, ratePct: 0 } }); // 10,000 a month
  const s = base({ emiLoad: Array(12).fill(1500000), maxRatioPct: 40 }); // 15,000 + 10,000 = 41.7%
  assert.equal(emiPlan(w, s), null);
  const freed = base({ emiLoad: Array.from({ length: 12 }, (_, k) => (k <= 3 ? 1500000 : 0)), maxRatioPct: 40 });
  const p = emiPlan(w, freed)!;
  assert.ok(p.index >= 3, "waits for the existing EMI to finish");
});

test("emi: with no income known the ratio is unknown, not failed", () => {
  const w = wish({ priceMinor: 6000000, financing: { downMinor: 0, tenure: 3, ratePct: 12 } });
  const p = emiPlan(w, base({ incomes: Array(12).fill(0) }))!;
  assert.equal(p.ratioUnknown, true);
  assert.ok(p.totalInterestMinor > 0);
});

test("best plan: earlier wins, ties go to outright", () => {
  const w = wish({ priceMinor: 6000000, financing: { downMinor: 0, tenure: 6, ratePct: 0 } });
  assert.equal(bestPlan(w, base())!.method, "emi"); // EMI possible now, outright not until later
  const cheap = wish({ priceMinor: 500000, financing: { downMinor: 0, tenure: 6, ratePct: 0 } });
  assert.equal(bestPlan(cheap, base())!.method, "outright");
});

test("sequence: needs first, and each purchase uses up the room for the next", () => {
  const s = base();
  const items = [
    wish({ id: "a", title: "holiday", type: "desire", priceMinor: 3000000 }),
    wish({ id: "b", title: "laptop", type: "need", priceMinor: 3000000 }),
  ];
  const out = sequence(items, s);
  assert.equal(out[0].wish.id, "b");
  assert.ok(out[1].plan!.index > out[0].plan!.index, "second purchase waits for the money again");
  const alone = bestPlan(items[0], s)!;
  assert.ok(out[1].plan!.index >= alone.index);
});

test("apply: an outright purchase lowers every later balance; EMI adds load", () => {
  const w = wish({ priceMinor: 100000 });
  const s2 = apply({ method: "outright", index: 2 }, w, base());
  assert.equal(s2.ends[1], base().ends[1]);
  assert.equal(s2.ends[2], base().ends[2] - 100000);
  const f = wish({ priceMinor: 600000, financing: { downMinor: 0, tenure: 2, ratePct: 0 } });
  const s3 = apply({ method: "emi", index: 0, downMinor: 0, emiMinor: 300000, tenure: 2, totalInterestMinor: 0, ratioUnknown: false }, f, base());
  assert.equal(s3.emiLoad[1], base().emiLoad[1] + 300000);
  assert.equal(s3.emiLoad[3], base().emiLoad[3]);
});

test("emi terms: an item's own terms win; the standing offer only applies when on and above the amount", () => {
  const auto = { on: true, overMinor: 5_000_000, months: 6, ratePct: 18 };
  const item = { amountMinor: 6_000_000, downMinor: null, tenure: null, ratePct: null };
  assert.deepEqual(emiTerms(item, auto), { downMinor: 0, tenure: 6, ratePct: 18, assumed: true });
  assert.equal(emiTerms(item, { ...auto, on: false }), null);
  assert.equal(emiTerms({ ...item, amountMinor: 5_000_000 }, auto), null);
  assert.deepEqual(emiTerms({ ...item, tenure: 12, ratePct: 0, downMinor: 1000 }, auto), { downMinor: 1000, tenure: 12, ratePct: 0, assumed: false });
});
