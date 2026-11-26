import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDigest, type DueItem } from "./reminders";

const today = "2026-11-26";
const it = (name: string, dueOn: string, status: DueItem["status"], kind: DueItem["kind"] = "expense", amountMinor = 1115600): DueItem => ({ name, dueOn, status, kind, amountMinor });

test("digest: nothing to say means no notification", () => {
  assert.equal(buildDigest([], today, "INR"), null);
  assert.equal(buildDigest([it("Rent", "2026-11-30", "upcoming")], today, "INR"), null); // four days out is too early
  assert.equal(buildDigest([it("Rent", "2026-11-26", "paid")], today, "INR"), null);
  assert.equal(buildDigest([it("Salary", "2026-11-26", "upcoming", "income")], today, "INR"), null);
  assert.equal(buildDigest([it("Old", "2026-11-10", "overdue")], today, "INR"), null); // missed long ago: no nagging
});

test("digest: due today and tomorrow, with amounts", () => {
  const d = buildDigest([it("Phone EMI", "2026-11-27", "upcoming"), it("Gym", "2026-11-26", "upcoming", "expense", 80000)], today, "INR")!;
  assert.equal(d.title, "2 payments due soon");
  assert.equal(d.body, "Gym ₹800.00 today, Phone EMI ₹11,156.00 tomorrow");
  assert.equal(d.url, "/app/plan/commitments");
  assert.equal(d.tag, "digest-2026-11-26");
});

test("digest: recently missed payments change the tone and are named first", () => {
  const d = buildDigest([it("Phone EMI", "2026-11-24", "overdue"), it("Gym", "2026-11-27", "upcoming")], today, "INR")!;
  assert.equal(d.title, "2 payments need attention");
  assert.match(d.body, /^Phone EMI .* 2 days late, Gym/);
});

test("digest: long lists are cut with a count", () => {
  const items = Array.from({ length: 6 }, (_, i) => it(`Bill ${i}`, "2026-11-26", "upcoming"));
  assert.match(buildDigest(items, today, "INR")!.body, /, and 2 more$/);
});
