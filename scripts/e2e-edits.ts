// Editing bills, loans, accounts, entries, goals and deposits against the real database, with invented data only.
// Run: npm run check:edits. It deletes data, so it only touches the dedicated test account's workspace.
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createAccount, createTransaction, listAccounts, listCategories, listTransactions, renameCategory, updateAccount, updateTransaction } from "@/server/services/ledger";
import { createRule, listExpected, markPaid, updateLoan, updateRule, createLoan, listLoans, type NewRule } from "@/server/services/commitments";
import { addGoal, listGoals, updateGoal } from "@/server/services/planner";
import { createDeposit, listDeposits, updateDeposit } from "@/server/services/savings";
import { createTransfer } from "@/server/services/transfers";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const R = (n: number) => n * 100;
const throws = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

async function main() {
  const [m] = await db.select({ ws: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, "tester@budget.test"));
  if (!m) { console.error("no tester@budget.test account; sign up that test user first. Refusing to run."); process.exit(1); }
  const ws = m.ws, today = todayISO();
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets, schema.goals, schema.fixedDeposits]) await db.delete(t).where(eq(t.workspaceId, ws));
  // the cash account every workspace starts with stays, as the other checks expect it
  await db.delete(schema.accounts).where(and(eq(schema.accounts.workspaceId, ws), ne(schema.accounts.type, "cash")));
  await createAccount(ws, { name: "Bank", type: "bank", currency: "INR", openingBalanceMinor: R(50000), aliases: [] });
  await createAccount(ws, { name: "Card", type: "card", currency: "INR", openingBalanceMinor: -R(1000), aliases: [] });
  const accts = await listAccounts(ws), bank = accts.find((a) => a.name === "Bank")!, card = accts.find((a) => a.name === "Card")!;

  // a bill that was paid keeps its payment when its day changes
  const due = shiftDays(today, -6);
  const rule: NewRule = { name: "Rent", kind: "expense", amountMinor: R(7000), frequency: "monthly", intervalCount: 1, startOn: due, endOn: null, maxCount: null, matchPattern: "nomatch", accountId: bank.id, categoryId: null, anchor: "start_day", weekendShift: "none", transferToAccountId: null };
  await createRule(ws, rule);
  const r = (await listExpected(ws, shiftDays(today, -20), today)).find((e) => e.name === "Rent")!;
  await markPaid(ws, "rule", r.sourceId, r.dueOn);
  await updateRule(ws, r.sourceId, { ...rule, name: "House rent", amountMinor: R(7500), startOn: shiftDays(due, -3) });
  const after = (await listExpected(ws, shiftDays(today, -20), shiftDays(today, 40))).filter((e) => e.name === "House rent");
  ok(after[0].status === "paid" && after[0].dueOn === shiftDays(due, -3), "a paid bill stays paid after its day moves");
  ok(after[1].amountMinor === R(7500) && after[1].status === "upcoming", "the next one shows the new amount");

  await createLoan(ws, { name: "Phone", lender: null, emiMinor: R(1000), firstDueOn: shiftDays(today, 5), instalments: 6, principalMinor: null, annualRatePct: null, matchPattern: null, accountId: null });
  const loan = (await listLoans(ws))[0];
  await updateLoan(ws, loan.id, { name: "Phone EMI", lender: "Bank", emiMinor: R(1200), firstDueOn: shiftDays(today, 8), instalments: 4, principalMinor: null, annualRatePct: null, matchPattern: null, accountId: bank.id });
  const l = (await listLoans(ws))[0];
  ok(l.name === "Phone EMI" && l.emiMinor === R(1200) && l.instalments === 4, "a loan can be edited");

  await updateAccount(ws, bank.id, { name: "Savings bank", aliases: ["sb"], balanceMinor: R(60000) });
  await updateAccount(ws, card.id, { name: "Card", aliases: [], balanceMinor: R(2500) });
  const now = await listAccounts(ws);
  ok(now.find((a) => a.id === bank.id)!.balanceMinor === R(60000) && now.find((a) => a.id === bank.id)!.name === "Savings bank", "an account's balance and name can be corrected");
  ok(now.find((a) => a.id === card.id)!.balanceMinor === -R(2500), "a card's figure is what is owed");

  const cats = await listCategories(ws), food = cats.find((c) => c.name === "Food & dining")!, salary = cats.find((c) => c.name === "Salary")!;
  await createTransaction(ws, { accountId: bank.id, categoryId: null, kind: "expense", amountMinor: R(100), fxRateToHome: null, payee: "x", note: null, occurredOn: today }, "INR");
  const t = (await listTransactions(ws, 50)).find((x) => x.payee === "x")!;
  await updateTransaction(ws, t.id, { amountMinor: R(150), occurredOn: shiftDays(today, -1), kind: "expense", accountId: card.id, categoryId: food.id, payee: "Cafe", note: "n" });
  const t2 = (await listTransactions(ws, 50)).find((x) => x.id === t.id)!;
  ok(t2.amountMinor === R(150) && t2.payee === "Cafe" && t2.accountId === card.id && t2.categoryId === food.id && t2.status === "confirmed", "an entry can be edited");
  ok(await throws(() => updateTransaction(ws, t.id, { amountMinor: R(150), occurredOn: today, kind: "expense", accountId: bank.id, categoryId: salary.id, payee: null, note: null })), "an income category cannot go on an expense");
  await createTransfer(ws, bank.id, card.id, R(500), today);
  const leg = (await listTransactions(ws, 50)).find((x) => x.transferId)!;
  await updateTransaction(ws, leg.id, { amountMinor: R(700), occurredOn: today, kind: leg.kind, accountId: null, categoryId: null, payee: null, note: null });
  ok((await listTransactions(ws, 50)).filter((x) => x.transferId).every((x) => x.amountMinor === R(700)), "editing a transfer changes both sides");

  await renameCategory(ws, food.id, "Eating out");
  ok((await listCategories(ws)).some((c) => c.id === food.id && c.name === "Eating out"), "a category can be renamed");
  await renameCategory(ws, food.id, "Food & dining");

  await addGoal(ws, "Trip", R(10000), null);
  const g = (await listGoals(ws))[0];
  await updateGoal(ws, g.id, { name: "Goa", targetMinor: R(20000), targetDate: shiftDays(today, 90), accountId: null, fixed: true });
  const g2 = (await listGoals(ws))[0];
  ok(g2.name === "Goa" && g2.targetMinor === R(20000) && g2.fixed, "a goal can be edited");

  const dep = { name: "FD", principalMinor: R(10000), annualRatePct: 7, startOn: shiftDays(today, -30), maturityOn: shiftDays(today, 100), maturityMinor: null, payoutAccountId: bank.id };
  await createDeposit(ws, "INR", dep);
  const d = (await listDeposits(ws))[0];
  await updateDeposit(ws, "INR", d.id, { ...dep, name: "FD two", principalMinor: R(12000) });
  const d2 = (await listDeposits(ws))[0];
  ok(d2.name === "FD two" && d2.principalMinor === R(12000) && (await listAccounts(ws)).find((a) => a.id === d2.accountId)!.balanceMinor === R(12000), "a deposit and its account change together");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
