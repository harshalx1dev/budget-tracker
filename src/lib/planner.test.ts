import { test } from "node:test";
import assert from "node:assert/strict";
import { beyondBills, budgetAvailable, computeMonthlySafe, computeSafeToSpend, goalHolds, goalProgress, monthEnd, monthsBetween, projectForecast, variableSpend } from "./planner";

test("monthly safe to spend: this cycle's money, never more than the accounts hold", () => {
  const base = { income: 78000, spent: 57817, saved: 10000, dueOutflows: 2000, goalSetAside: 0, accountSafe: 74263, days: 4 };
  assert.deepEqual(computeMonthlySafe(base), { safe: 8183, capped: false, perDay: 2045 });
  assert.deepEqual(computeMonthlySafe({ ...base, accountSafe: 5000 }), { safe: 5000, capped: true, perDay: 1250 });
  assert.equal(computeMonthlySafe({ ...base, income: 0 }).perDay, 0);
});

test("forecast: a bill already in the plan is not counted again from history", () => {
  const average = new Map<string | null, number>([["rent", 24000], ["emi", 10000], ["food", 5000], [null, 1200]]);
  const month = new Map<string | null, number>([["rent", 24000], ["emi", 18000]]);
  const withYearly = new Map<string | null, number>([...month, ["food", 99000]]);
  assert.equal(beyondBills(average, [month, withYearly, month]), 6200);
  assert.equal(beyondBills(average, []), 40200);
});

test("goals hold money back only when fixed, or when it has actually been put aside", () => {
  const trip = { fixed: false, byHand: true, saved: 0, keptThisCycle: 0, addedThisMonth: 0, requiredMonthly: 20000 };
  assert.deepEqual(goalHolds([trip]), { fromAccounts: 0, fromCycle: 0 });
  assert.deepEqual(goalHolds([{ ...trip, saved: 12000, keptThisCycle: 5000, addedThisMonth: 5000 }]), { fromAccounts: 12000, fromCycle: 5000 });
  assert.deepEqual(goalHolds([{ ...trip, fixed: true, addedThisMonth: 5000, saved: 5000, keptThisCycle: 5000 }]), { fromAccounts: 20000, fromCycle: 20000 });
  assert.deepEqual(goalHolds([{ ...trip, byHand: false, saved: 90000 }]), { fromAccounts: 0, fromCycle: 0 });
});

test("months: end of month and distance", () => {
  assert.equal(monthEnd("2027-02"), "2027-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(monthsBetween("2026-11", "2027-03"), 4);
});

test("budget: no rollover is just the limit; rollover carries leftovers and overspend, floored at zero", () => {
  const base = { limit: 10000, startMonth: "2026-09", month: "2026-12", spentByMonth: { "2026-09": 4000, "2026-10": 12000, "2026-11": 9000 } };
  assert.equal(budgetAvailable({ ...base, rollover: false }), 10000);
  // carry = 6000 - 2000 + 1000 = 5000
  assert.equal(budgetAvailable({ ...base, rollover: true }), 15000);
  assert.equal(budgetAvailable({ ...base, rollover: true, spentByMonth: { "2026-09": 30000 } }), 10000 + Math.max(0, 10000 - 30000 + 10000 + 10000));
  assert.equal(budgetAvailable({ ...base, rollover: true, spentByMonth: { "2026-09": 90000 } }), 10000);
});

test("forecast: balances roll forward month by month", () => {
  const rows = projectForecast(100000, [
    { month: "2026-12", income: 500000, committed: 200000, variable: 150000 },
    { month: "2027-01", income: 500000, committed: 200000, variable: 150000 },
  ]);
  assert.deepEqual(rows.map((r) => [r.start, r.end]), [[100000, 250000], [250000, 400000]]);
});

test("variable spend: budget headroom for budgeted categories, scaled average for the rest", () => {
  const v = variableSpend({
    budgeted: [{ limitAvailable: 10000, committed: 2000, spentSoFar: 3000 }, { limitAvailable: 5000, committed: 0, spentSoFar: 9000 }],
    unbudgetedAvg: 6000,
    fractionLeft: 0.5,
  });
  assert.equal(v, 5000 + 0 + 3000); // overspent budget contributes nothing, not a negative
});

test("safe to spend: breakdown, per day, and never a negative per-day figure", () => {
  assert.deepEqual(computeSafeToSpend({ balance: 3000000, dueOutflows: 1000000, goalSetAside: 200000, buffer: 500000, days: 10 }), { safe: 1300000, perDay: 130000, days: 10 });
  assert.equal(computeSafeToSpend({ balance: 100000, dueOutflows: 500000, goalSetAside: 0, buffer: 0, days: 5 }).perDay, 0);
  assert.equal(computeSafeToSpend({ balance: 100000, dueOutflows: 0, goalSetAside: 0, buffer: 0, days: 0 }).days, 1);
});

test("goals: required monthly amount, done, open-ended and overdue", () => {
  const today = "2026-11-26";
  assert.deepEqual(goalProgress({ targetMinor: 1200000, savedMinor: 0, targetDate: "2027-05-15", today }), { remaining: 1200000, monthsLeft: 6, requiredMonthly: 200000, status: "on-track" });
  assert.equal(goalProgress({ targetMinor: 100, savedMinor: 100, targetDate: null, today }).status, "done");
  assert.equal(goalProgress({ targetMinor: 100, savedMinor: 0, targetDate: null, today }).requiredMonthly, null);
  assert.equal(goalProgress({ targetMinor: 100, savedMinor: 0, targetDate: "2026-11-01", today }).status, "overdue");
  assert.equal(goalProgress({ targetMinor: 100, savedMinor: 0, targetDate: "2026-11-30", today }).monthsLeft, 1);
});
