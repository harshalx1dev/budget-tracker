import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, pmt } from "./schedule";
import { occurrences } from "./recurrence";
import { matchExpected } from "./match-expected";
import { findHeaderRow, guessMapping, toStatementRows } from "./statement";

test("pmt: 1,00,000 at 12% over 12 months is 8,884.88", () => {
  assert.equal(pmt(10000000, 12, 12), 888488);
});

test("schedule: amortises to exactly zero, principal parts sum to principal", () => {
  const s = buildSchedule({ firstDueOn: "2026-12-04", instalments: 12, emiMinor: 888488, principalMinor: 10000000, annualRatePct: 12, revisions: [] });
  assert.equal(s.rows.at(-1)!.balanceAfterMinor, 0);
  assert.equal(s.rows.reduce((a, r) => a + r.principalMinor!, 0), 10000000);
  assert.equal(s.rows.length, 12);
  assert.equal(s.stalled, false);
});

test("schedule: zero rate puts the rounding remainder in the last instalment", () => {
  const s = buildSchedule({ firstDueOn: "2026-12-04", instalments: 3, emiMinor: 33333, principalMinor: 100000, annualRatePct: 0, revisions: [] });
  assert.deepEqual(s.rows.map((r) => r.amountMinor), [33333, 33333, 33333, 1]);
});

test("schedule: no principal means a flat run for the remaining instalments", () => {
  const s = buildSchedule({ firstDueOn: "2026-12-04", instalments: 6, emiMinor: 1115600, principalMinor: null, annualRatePct: null, revisions: [] });
  assert.equal(s.rows.length, 6);
  assert.equal(s.rows[5].dueOn, "2027-05-04");
  assert.equal(s.rows[0].balanceAfterMinor, null);
});

test("schedule: EMI revision applies from its date, flat loan", () => {
  const s = buildSchedule({ firstDueOn: "2026-12-04", instalments: 4, emiMinor: 1000, principalMinor: null, annualRatePct: null, revisions: [{ effectiveOn: "2027-02-01", kind: "emi", emiMinor: 1200 }] });
  assert.deepEqual(s.rows.map((r) => r.amountMinor), [1000, 1000, 1200, 1200]);
});

test("schedule: a rate revision changes interest from the next due date", () => {
  const base = { firstDueOn: "2026-12-04", instalments: 12, emiMinor: 888488, principalMinor: 10000000, annualRatePct: 12 as number | null };
  const a = buildSchedule({ ...base, revisions: [] });
  const b = buildSchedule({ ...base, revisions: [{ effectiveOn: "2027-03-01", kind: "rate", ratePct: 6 }] });
  assert.equal(a.rows[2].interestMinor, b.rows[2].interestMinor);
  assert.ok(b.rows[3].interestMinor! < a.rows[3].interestMinor!);
  const total = (x: typeof a) => x.rows.reduce((t, r) => t + r.amountMinor, 0);
  assert.ok(total(b) < total(a));
});

test("schedule: a prepayment with unchanged EMI shortens the tenure", () => {
  const base = { firstDueOn: "2026-12-04", instalments: 12, emiMinor: 888488, principalMinor: 10000000, annualRatePct: 12 };
  const a = buildSchedule({ ...base, revisions: [] });
  const b = buildSchedule({ ...base, revisions: [{ effectiveOn: "2027-04-01", kind: "prepayment", amountMinor: 3000000 }] });
  assert.ok(b.rows.length < a.rows.length);
  assert.equal(b.rows.at(-1)!.balanceAfterMinor, 0);
});

test("schedule: an EMI below the interest stops with a flag", () => {
  const s = buildSchedule({ firstDueOn: "2026-12-04", instalments: 12, emiMinor: 100, principalMinor: 10000000, annualRatePct: 12, revisions: [] });
  assert.equal(s.stalled, true);
});

test("recurrence: monthly anchored on the 31st clamps per month from the start date", () => {
  const r = { frequency: "monthly" as const, intervalCount: 1, startOn: "2027-01-31", endOn: null, maxCount: null };
  assert.deepEqual(occurrences(r, "2027-01-01", "2027-04-30"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
});

test("recurrence: end date and count, whichever comes first", () => {
  const r = { frequency: "monthly" as const, intervalCount: 1, startOn: "2026-12-05", endOn: "2027-03-01", maxCount: 10 };
  assert.deepEqual(occurrences(r, "2026-01-01", "2030-01-01"), ["2026-12-05", "2027-01-05", "2027-02-05"]);
  assert.equal(occurrences({ ...r, endOn: null, maxCount: 2 }, "2026-01-01", "2030-01-01").length, 2);
});

test("recurrence: weekly and yearly", () => {
  assert.deepEqual(occurrences({ frequency: "weekly", intervalCount: 2, startOn: "2026-11-02", endOn: null, maxCount: 3 }, "2026-01-01", "2027-01-01"), ["2026-11-02", "2026-11-16", "2026-11-30"]);
  assert.deepEqual(occurrences({ frequency: "yearly", intervalCount: 1, startOn: "2024-02-29", endOn: null, maxCount: null }, "2025-01-01", "2026-12-31"), ["2025-02-28", "2026-02-28"]);
});

test("matching: three SIPs on one day pair one-to-one by mandate code", () => {
  const exp = ["0000fbeavr534365", "0000uht6nr9yqkgm", "0000vmnupsgix8nz"].map((p, i) => ({ key: `r${i}`, kind: "expense" as const, dueOn: "2026-10-01", amountMinor: 100000, accountId: null, pattern: p }));
  const cand = ["0000VMNUPSGIX8NZ", "0000FBEAVR534365", "0000UHT6NR9YQKGM"].map((m, i) => ({ id: `t${i}`, kind: "expense" as const, occurredOn: "2026-10-01", amountMinor: 100000, accountId: "a", text: `NACH-MUT-DR-INDIAN CLEARING CORP-${m}` }));
  const m = matchExpected(exp, cand);
  assert.equal(m.get("r0"), "t1");
  assert.equal(m.get("r1"), "t2");
  assert.equal(m.get("r2"), "t0");
});

test("matching: pattern allows about 10% drift, no pattern needs the exact amount, window is 4 days", () => {
  const c = [{ id: "t", kind: "expense" as const, occurredOn: "2026-11-05", amountMinor: 1150000, accountId: "a", text: "NACH-10-DR-HDBFINANCIALSERLTD" }];
  const base = { key: "e", kind: "expense" as const, dueOn: "2026-11-04", amountMinor: 1115600, accountId: null };
  assert.equal(matchExpected([{ ...base, pattern: "hdbfinancial" }], c).get("e"), "t");
  assert.equal(matchExpected([{ ...base, pattern: null }], c).size, 0);
  assert.equal(matchExpected([{ ...base, dueOn: "2026-10-20", pattern: "hdbfinancial" }], c).size, 0);
});

test("matching: neighbouring months cannot steal each other's payment", () => {
  const exp = [
    { key: "oct", kind: "expense" as const, dueOn: "2026-10-04", amountMinor: 1000, accountId: null, pattern: "emi" },
    { key: "nov", kind: "expense" as const, dueOn: "2026-11-04", amountMinor: 1000, accountId: null, pattern: "emi" },
  ];
  const cand = [{ id: "n", kind: "expense" as const, occurredOn: "2026-11-04", amountMinor: 1000, accountId: "a", text: "emi" }];
  const m = matchExpected(exp, cand);
  assert.equal(m.get("nov"), "n");
  assert.equal(m.has("oct"), false);
});

test("statement: Kotak-style CSV with a single Amount column and spaced Dr / Cr headers", () => {
  const rows = [
    ["Account Statement"], ["Customer", "Test Person"], [],
    ["Sl. No.", "Transaction Date", "Value Date", "Description", "Chq /Ref No.", "Amount", "Dr / Cr", "Balance", "Dr / Cr"],
    ["1", "01 Oct 2026", "01 Oct 2026", "UPI/TEST SHOP/YESB/123456789012/Paid via Sup", "UPI-123456789012", "20.00", "DR", "980.00", "CR"],
    ["2", "31 Oct 2026", "31 Oct 2026", "NEFT EMPLOYER SALARY", "NEFTINW-1", "54,897.00", "CR", "55,877.00", "CR"],
  ];
  const h = findHeaderRow(rows);
  const m = guessMapping(rows[h])!;
  assert.equal(m.drCr, 6);
  const out = toStatementRows(rows, h, m);
  assert.deepEqual(out.map((r) => [r.kind, r.amount, r.date]), [["expense", 20, "2026-10-01"], ["income", 54897, "2026-10-31"]]);
});
