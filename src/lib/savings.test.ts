import { test } from "node:test";
import assert from "node:assert/strict";
import { emergencyStatus, fdMaturityEstimate, fdValue, isAssetType, netWorth, savingsRate } from "./savings";

test("asset types: savings and investments, not spendable accounts", () => {
  assert.equal(isAssetType("fd"), true);
  assert.equal(isAssetType("mutual_fund"), true);
  assert.equal(isAssetType("bank"), false);
  assert.equal(isAssetType("cash"), false);
});

test("fd: quarterly compounding, grows with time and stops at maturity", () => {
  // ₹1,00,000 at 7% for one year, compounded quarterly: 1,07,186 (about)
  const m = fdMaturityEstimate(10000000, 7, "2026-01-01", "2027-01-01");
  assert.ok(Math.abs(m - 10718590) < 20000, `maturity ${m}`);
  assert.equal(fdValue(10000000, 7, "2026-01-01", "2025-12-01", "2027-01-01"), 10000000); // before it starts
  const half = fdValue(10000000, 7, "2026-01-01", "2026-07-02", "2027-01-01");
  assert.ok(half > 10000000 && half < m);
  assert.equal(fdValue(10000000, 7, "2026-01-01", "2030-01-01", "2027-01-01"), m); // capped at maturity
});

test("emergency fund: target, months covered, shortfall, and unknown spending", () => {
  const s = emergencyStatus({ essentialMonthlyMinor: 3000000, months: 6, currentMinor: 9000000 });
  assert.deepEqual([s.targetMinor, s.coveredMonths, s.shortfallMinor, s.pct, s.known], [18000000, 3, 9000000, 50, true]);
  const over = emergencyStatus({ essentialMonthlyMinor: 3000000, months: 6, currentMinor: 99000000 });
  assert.deepEqual([over.shortfallMinor, over.pct], [0, 100]);
  const none = emergencyStatus({ essentialMonthlyMinor: 0, months: 6, currentMinor: 100 });
  assert.deepEqual([none.known, none.coveredMonths, none.pct], [false, null, 0]);
});

test("savings rate and net worth", () => {
  assert.equal(savingsRate(1500000, 6000000), 25);
  assert.equal(savingsRate(0, 6000000), 0);
  assert.equal(savingsRate(100, 0), null);
  assert.equal(netWorth({ liquidMinor: 3000000, assetsMinor: 12000000, liabilitiesMinor: 5000000 }), 10000000);
});
