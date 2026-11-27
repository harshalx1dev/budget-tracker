import { test } from "node:test";
import assert from "node:assert/strict";
import { cardBill, cardDates } from "./card";

test("card dates: the bill made on the 15th is due on the 5th of the next month", () => {
  assert.deepEqual(cardDates(15, 5, "2026-11-27"), { statementOn: "2026-11-15", dueOn: "2026-12-05", nextStatementOn: "2026-12-15" });
  assert.deepEqual(cardDates(15, 5, "2026-11-03"), { statementOn: "2026-10-15", dueOn: "2026-11-05", nextStatementOn: "2026-11-15" });
  assert.equal(cardDates(1, 20, "2026-11-27").dueOn, "2026-11-20");
  assert.equal(cardDates(31, 18, "2027-03-05").statementOn, "2027-02-28");
});

test("card bill: spend before the bill date is due, spend after it waits, payments clear it", () => {
  const rows = [
    { on: "2026-11-10", kind: "expense" as const, amountMinor: 8000 },
    { on: "2026-11-20", kind: "expense" as const, amountMinor: 3000 },
  ];
  const base = { statementDay: 15, dueDay: 5, today: "2026-11-27", openingBalanceMinor: 0, rows };
  assert.deepEqual([cardBill(base).toPay, cardBill(base).unbilled, cardBill(base).overdue], [8000, 3000, false]);
  const paid = { ...base, rows: [...rows, { on: "2026-11-25", kind: "income" as const, amountMinor: 8000 }] };
  assert.deepEqual([cardBill(paid).toPay, cardBill(paid).unbilled], [0, 3000]);
  assert.equal(cardBill({ ...base, today: "2026-12-08" }).overdue, true);
  assert.equal(cardBill({ ...base, openingBalanceMinor: -2000 }).toPay, 10000);
});
