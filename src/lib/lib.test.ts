import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "./quick-add";
import { readNarration } from "./narration";
import { matchRule } from "./categorize";
import { findHeaderRow, guessMapping, parseAmount, parseDate, toStatementRows } from "./statement";

const accts = [
  { id: "cash", name: "Cash", aliases: [] },
  { id: "hdfc", name: "HDFC Savings", aliases: ["upi", "gpay"] },
];
const TODAY = "2026-11-26";

test("quick-add: amount, alias account, yesterday", () => {
  const r = parseQuickAdd("swiggy 450 upi yesterday", accts, TODAY);
  assert.deepEqual([r.amount, r.accountId, r.date, r.text, r.kind], [450, "hdfc", "2026-11-25", "swiggy", "expense"]);
});
test("quick-add: 4.5k, rupee sign, plus is income, n days ago", () => {
  assert.equal(parseQuickAdd("rent 4.5k", accts, TODAY).amount, 4500);
  assert.equal(parseQuickAdd("chai ₹20 cash", accts, TODAY).accountId, "cash");
  const r = parseQuickAdd("+25000 salary 3 days ago", accts, TODAY);
  assert.deepEqual([r.kind, r.amount, r.date], ["income", 25000, "2026-11-23"]);
});
test("quick-add: dd/mm and day-month dates, no amount", () => {
  assert.equal(parseQuickAdd("movie 600 12/11", accts, TODAY).date, "2026-11-12");
  assert.equal(parseQuickAdd("movie 600 5 nov", accts, TODAY).date, "2026-11-05");
  assert.equal(parseQuickAdd("just words", accts, TODAY).amount, null);
});

test("narration: pulls ref, vpa and a readable payee", () => {
  const n = readNarration("UPI/412345678901/Swiggy Order/swiggy@icici/ICIC0001");
  assert.equal(n.ref, "412345678901");
  assert.equal(n.vpa, "swiggy@icici");
  assert.equal(n.payee, "Swiggy Order");
  assert.equal(n.isUpi, true);
});
test("narration: falls back to the VPA handle", () => {
  assert.equal(readNarration("UPI-412345678901-9876543210@ybl").payee, "9876543210");
});

test("rules: longest pattern wins", () => {
  const rules = [{ pattern: "swiggy", categoryId: "food" }, { pattern: "swiggy instamart", categoryId: "groceries" }];
  assert.equal(matchRule(rules, "SWIGGY Instamart order"), "groceries");
  assert.equal(matchRule(rules, "Uber ride"), null);
});

test("statement: dates are day-first", () => {
  assert.equal(parseDate("05/11/2026"), "2026-11-05");
  assert.equal(parseDate("05-11-26"), "2026-11-05");
  assert.equal(parseDate("5 Nov 2026"), "2026-11-05");
  assert.equal(parseDate("31/02/2026"), null);
});
test("statement: amounts", () => {
  assert.equal(parseAmount("₹ 1,234.50 Dr"), 1234.5);
  assert.equal(parseAmount(""), null);
});
test("statement: header after preamble, debit/credit columns", () => {
  const rows = [
    ["Account Statement"], ["Customer", "X"], [],
    ["Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ["05/11/26", "UPI-SWIGGY-swiggy@icici-412345678901", "412345678901", "450.00", "", "9,550.00"],
    ["06/11/26", "NEFT CR SALARY", "N123", "", "25,000.00", "34,550.00"],
    ["", "Total", "", "450", "25000", ""],
  ];
  const h = findHeaderRow(rows);
  assert.equal(h, 3);
  const m = guessMapping(rows[h])!;
  const out = toStatementRows(rows, h, m);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].kind, out[0].amount, out[0].date, out[0].ref], ["expense", 450, "2026-11-05", "412345678901"]);
  assert.equal(out[1].kind, "income");
});
