import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { lastFour, open, seal } from "../server/ai/crypto";
import { plain, ungroundedNumbers } from "./grounding";

const KEY = randomBytes(32);

test("crypto: round-trips, uses a fresh IV, and detects tampering", () => {
  const a = seal("AIzaSyExampleKey1234567890", KEY);
  const b = seal("AIzaSyExampleKey1234567890", KEY);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(open(a, KEY), "AIzaSyExampleKey1234567890");
  assert.throws(() => open({ ...a, ciphertext: Buffer.from("x".repeat(26)).toString("base64") }, KEY));
  assert.throws(() => open(a, randomBytes(32)));
  assert.equal(lastFour(" abc1234 "), "1234");
});

test("crypto: a bad ENCRYPTION_KEY is rejected, not silently weakened", () => {
  assert.throws(() => seal("k", Buffer.alloc(16)));
});

test("grounding: figures quoted from the facts pass, invented ones are caught", () => {
  const facts = "TV ₹60,000.00 in dec 2026, emi ₹10,000.00 for 6 months, buffer ₹10,000.00";
  assert.deepEqual(ungroundedNumbers("Buy the TV for ₹60,000 in dec 2026 with a ₹10,000 buffer.", facts), []);
  assert.deepEqual(ungroundedNumbers("You will save ₹12,500 a month.", facts), [12500]);
  assert.deepEqual(ungroundedNumbers("That is about 6 months and 40% of income.", facts), []);
  assert.deepEqual(ungroundedNumbers("Roughly ₹6L", facts), []);
});

test("grounding: decimals are compared by value", () => {
  assert.deepEqual(ungroundedNumbers("emi of ₹10,000", "emi ₹10,000.00"), []);
  assert.deepEqual(ungroundedNumbers("emi of ₹10,000.50", "emi ₹10,000.00"), [10000.5]);
});

test("plain: markdown decoration is stripped", () => {
  assert.equal(plain("**Buy** the `TV` first\n\n\n\nthen the laptop"), "Buy the TV first\n\nthen the laptop");
});

import { csvCell, toCsv } from "./csv";

test("csv: quotes commas and quotes, neutralises formula-looking cells", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("+91 98765"), "'+91 98765");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell(-5), "-5"); // real negative numbers stay numbers
  assert.equal(csvCell(null), "");
  assert.equal(toCsv(["a", "b"], [["x", 1]]), "a,b\r\nx,1\r\n");
});
