import { test } from "node:test";
import assert from "node:assert/strict";
import { readView, viewWishes } from "./wish-view";

const items = [
  { title: "Lights", priceMinor: 700, month: "2026-12", type: "need", priority: 1 },
  { title: "Bike", priceMinor: 35000, month: null, type: "want", priority: 2 },
  { title: "Router", priceMinor: 500, month: "2026-11", type: "need", priority: 2 },
  { title: "Watch", priceMinor: 2200, month: null, type: "desire", priority: 1 },
];
const names = (q: Record<string, string>) => viewWishes(items, readView(q), "2026-11").map((i) => i.title);

test("want to buy: sorting", () => {
  assert.deepEqual(names({}), ["Router", "Lights", "Bike", "Watch"]);
  assert.deepEqual(names({ sort: "afford" }), ["Router", "Lights", "Watch", "Bike"]);
  assert.deepEqual(names({ sort: "price-down" }), ["Bike", "Watch", "Lights", "Router"]);
  assert.deepEqual(names({ sort: "priority" }), ["Lights", "Watch", "Router", "Bike"]);
  assert.deepEqual(names({ sort: "nonsense" }), names({}));
});

test("want to buy: filters combine, and the original list is left alone", () => {
  assert.deepEqual(names({ kind: "need" }), ["Router", "Lights"]);
  assert.deepEqual(names({ when: "now" }), ["Router"]);
  assert.deepEqual(names({ when: "later" }), ["Lights"]);
  assert.deepEqual(names({ when: "none", priority: "1" }), ["Watch"]);
  assert.equal(items[0].title, "Lights");
});
