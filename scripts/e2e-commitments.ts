// Service-level check of Phase 2 against the real database, using invented data only.
// Run: npm run check:commitments. It deletes data, so it only touches the dedicated test account's workspace.
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { importStatement, quickAdd } from "@/server/services/capture";
import { addRevision, createLoan, createRule, listExpected, markPaid } from "@/server/services/commitments";
import { listAccounts } from "@/server/services/ledger";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const ws = m.workspaceId;
  for (const t of [schema.transactions, schema.importBatches, schema.categoryRules, schema.loans, schema.recurringRules]) await db.delete(t).where(eq(t.workspaceId, ws));

  const today = todayISO();
  let accts = await listAccounts(ws);
  let bank = accts.find((a) => a.type === "bank");
  if (!bank) { await db.insert(schema.accounts).values({ workspaceId: ws, name: "Test Bank", type: "bank", aliases: ["upi"] }); accts = await listAccounts(ws); bank = accts.find((a) => a.type === "bank")!; }
  const aliasCheck = bank.aliases.includes("upi");
  if (!aliasCheck) await db.update(schema.accounts).set({ aliases: ["upi"] }).where(eq(schema.accounts.id, bank.id));

  // 1) quick-add then import the same spend: one row, not two
  const d = shiftDays(today, -2);
  await quickAdd(ws, "INR", "swiggy 450 upi 2 days ago");
  const r1 = await importStatement(ws, "INR", bank.id, "fixture.csv", [
    { date: d, kind: "expense", amount: 450, narration: "UPI/SWIGGY/YESB/100000000001/Paid via Sup", ref: "UPI-100000000001" },
    { date: d, kind: "expense", amount: 70, narration: "UPI/CHAI POINT/YESB/100000000002/tea", ref: "UPI-100000000002" },
  ]);
  const swiggyRows = (await db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, ws))).filter((t) => t.amountMinor === 45000);
  ok(r1.merged === 1 && r1.added === 1, `import merged ${r1.merged} quick-add and added ${r1.added} new`);
  ok(swiggyRows.length === 1 && swiggyRows[0].importHash !== null && swiggyRows[0].rawNarration !== null, "swiggy exists once, now carrying the bank narration");
  const r1b = await importStatement(ws, "INR", bank.id, "fixture.csv", [
    { date: d, kind: "expense", amount: 450, narration: "UPI/SWIGGY/YESB/100000000001/Paid via Sup", ref: "UPI-100000000001" },
  ]);
  ok(r1b.added === 0 && r1b.merged === 0 && r1b.duplicates === 1, "re-import after a merge is skipped by hash");

  // 2) an EMI with no principal or rate, matched from a statement line a day late
  const emiDue = shiftDays(today, -10);
  await createLoan(ws, { name: "Phone EMI", lender: null, emiMinor: 1115600, firstDueOn: emiDue, instalments: 6, principalMinor: null, annualRatePct: null, matchPattern: "hdbfinancial", accountId: null });
  await importStatement(ws, "INR", bank.id, "emi.csv", [{ date: shiftDays(emiDue, 1), kind: "expense", amount: 11156, narration: "NACH-10-DR-HDBFINANCIALSERLTD-FIXTURE", ref: "NACHDB1" }]);
  const exp = await listExpected(ws, shiftDays(today, -75), shiftDays(today, 200));
  const emiNow = exp.find((e) => e.name === "Phone EMI" && e.dueOn === emiDue)!;
  ok(emiNow.status === "paid" && emiNow.actualMinor === 1115600, "EMI matched its statement line");
  const emiTx = (await db.select().from(schema.transactions).where(eq(schema.transactions.id, emiNow.transactionId!)))[0];
  ok(emiTx.status === "confirmed" && emiTx.categoryId !== null, "matched EMI row is categorised and out of the inbox");
  ok(exp.filter((e) => e.name === "Phone EMI").length === 6 && exp.at(-1) !== undefined, "six EMI instalments planned");
  let rejected = false;
  try { await addRevision(ws, (await db.select().from(schema.loans).where(eq(schema.loans.workspaceId, ws)))[0].id, { kind: "rate", effectiveOn: today, emiMinor: null, ratePct: 9, amountMinor: null, note: null }); } catch { rejected = true; }
  ok(rejected, "a rate change is refused while the loan has no balance");

  // EMI revised upward by 3%: still matches, shows drift
  const loan = (await db.select().from(schema.loans).where(eq(schema.loans.workspaceId, ws)))[0];
  await addRevision(ws, loan.id, { kind: "emi", effectiveOn: shiftDays(today, 25), emiMinor: 1200000, ratePct: null, amountMinor: null, note: "revised" });
  const after = await listExpected(ws, shiftDays(today, 20), shiftDays(today, 200));
  const emis = after.filter((e) => e.name === "Phone EMI");
  const rev = shiftDays(today, 25);
  ok(emis.filter((e) => e.dueOn >= rev).every((e) => e.amountMinor === 1200000) && emis.filter((e) => e.dueOn < rev).every((e) => e.amountMinor === 1115600), "revised EMI applies from its date onward only");

  // 3) three SIPs on one day, told apart by mandate code
  const sipDue = shiftDays(today, -20);
  const codes = ["0000AAAA1111BBBB", "0000CCCC2222DDDD", "0000EEEE3333FFFF"];
  for (const [i, c] of codes.entries()) await createRule(ws, { name: `SIP ${i + 1}`, kind: "expense", amountMinor: 100000, frequency: "monthly", intervalCount: 1, startOn: sipDue, endOn: null, maxCount: 12, matchPattern: c, accountId: null, categoryId: null });
  await importStatement(ws, "INR", bank.id, "sip.csv", [...codes].reverse().map((c, i) => ({ date: sipDue, kind: "expense" as const, amount: 1000, narration: `NACH-MUT-DR-INDIAN CLEARING CORP-${c}`, ref: `NACH${i}` })));
  const sips = (await listExpected(ws, sipDue, sipDue)).filter((e) => e.name.startsWith("SIP"));
  ok(sips.length === 3 && sips.every((s) => s.status === "paid"), "three SIPs each matched one row");
  ok(new Set(sips.map((s) => s.transactionId)).size === 3, "no row was used twice");

  // 4) an unpaid recurring item is overdue; mark paid records it once
  await createRule(ws, { name: "Gym", kind: "expense", amountMinor: 80000, frequency: "monthly", intervalCount: 1, startOn: shiftDays(today, -5), endOn: shiftDays(today, 100), maxCount: null, matchPattern: null, accountId: null, categoryId: null });
  const gym = (await listExpected(ws, shiftDays(today, -5), shiftDays(today, -5))).find((e) => e.name === "Gym")!;
  ok(gym.status === "overdue", "unpaid past item is overdue");
  await markPaid(ws, "rule", gym.sourceId, gym.dueOn);
  const gym2 = (await listExpected(ws, shiftDays(today, -5), shiftDays(today, -5))).find((e) => e.name === "Gym")!;
  ok(gym2.status === "paid", "mark paid links a new transaction");
  let twice = false;
  try { await markPaid(ws, "rule", gym.sourceId, gym.dueOn); } catch { twice = true; }
  ok(twice, "marking the same payment paid twice is refused");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
