import { test } from "node:test";
import assert from "node:assert/strict";
import { rekeyDates } from "./rekey";

test("editing a bill's day keeps what was paid linked to it", () => {
  const moved = rekeyDates(["2026-10-02", "2026-11-02"], ["2026-10-10", "2026-11-10", "2026-12-10"], 15);
  assert.deepEqual([...moved], [["2026-10-02", "2026-10-10"], ["2026-11-02", "2026-11-10"]]);
});

test("unmoved dates stay put, and a date with nothing nearby is dropped", () => {
  const moved = rekeyDates(["2026-09-05", "2026-11-05"], ["2026-11-05", "2026-12-05"], 15);
  assert.equal(moved.get("2026-11-05"), "2026-11-05");
  assert.equal(moved.get("2026-09-05"), null);
});

test("two payments never share one date", () => {
  const moved = rekeyDates(["2026-11-01", "2026-11-08"], ["2026-11-05"], 15);
  assert.deepEqual([...moved.values()], ["2026-11-05", null]);
});
