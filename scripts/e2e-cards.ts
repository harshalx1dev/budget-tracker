// Card cycles, late bills and goal money against the real database, using invented data only.
// Run: npm run check:cards. It deletes data, so it only touches the dedicated test account's workspace.
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createAccount, createTransaction, listAccounts, listCategories } from "@/server/services/ledger";
import { createRule } from "@/server/services/commitments";
import { addContribution, addGoal, forecast, listGoals, safeToSpend } from "@/server/services/planner";
import { listCards, setCardCycle } from "@/server/services/cards";
import { createTransfer } from "@/server/services/transfers";
import { addWish, affordability } from "@/server/services/wishlist";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const R = (n: number) => n * 100;

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ ws: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const ws = m.ws, today = todayISO(), dom = (iso: string) => Number(iso.slice(8));
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets, schema.goals, schema.fixedDeposits, schema.wishlistItems, schema.accounts]) await db.delete(t).where(eq(t.workspaceId, ws));
  await db.update(schema.workspaces).set({ bufferMinor: 0, emergencyAccountId: null }).where(eq(schema.workspaces.id, ws));
  await createAccount(ws, { name: "Bank", type: "bank", currency: "INR", openingBalanceMinor: R(100000), aliases: [] });
  await createAccount(ws, { name: "Card", type: "card", currency: "INR", openingBalanceMinor: 0, aliases: [] });
  const accts = await listAccounts(ws), bank = accts.find((a) => a.name === "Bank")!, card = accts.find((a) => a.name === "Card")!;
  const food = (await listCategories(ws)).find((c) => c.name === "Food & dining")!.id;
  const spend = (accountId: string, amt: number, on: string) => createTransaction(ws, { accountId, categoryId: food, kind: "expense", amountMinor: R(amt), fxRateToHome: null, payee: "fixture", note: null, occurredOn: on }, "INR");

  const base = await safeToSpend(ws, "INR");
  await createRule(ws, { name: "Late rent", kind: "expense", amountMinor: R(7000), frequency: "yearly", intervalCount: 1, startOn: shiftDays(today, -10), endOn: null, maxCount: null, matchPattern: "nomatch", accountId: null, categoryId: null, anchor: "start_day", weekendShift: "none" });
  const late = await safeToSpend(ws, "INR");
  ok(base.safe - late.safe === R(7000) && late.monthly.billsDue === R(7000), "an overdue bill reduces free to spend");
  ok((await forecast(ws, "INR", 3)).rows[0].committed === R(7000), "the forecast expects the late bill this month");

  // billed yesterday, due in two days (inside this month on all but its last days)
  await setCardCycle(ws, card.id, dom(shiftDays(today, -1)), dom(shiftDays(today, 2)));
  await spend(card.id, 4000, shiftDays(today, -3));
  await spend(card.id, 900, today);
  const c = (await listCards(ws))[0];
  ok(c.bill!.toPay === R(4000) && c.bill!.unbilled === R(900), "the bill holds spend before the bill date, later spend waits");
  const withCard = await safeToSpend(ws, "INR");
  const dueNow = c.bill!.dueOn < withCard.horizon;
  ok(withCard.monthly.cardDue === (dueNow ? R(4000) : 0) && withCard.monthly.onCards === R(900) && withCard.monthly.spent === 0, "this cycle counts the card bill when due, not the swipes");
  await createTransfer(ws, bank.id, card.id, R(4000), today);
  const paid = await safeToSpend(ws, "INR");
  ok(paid.monthly.cardDue === 0 && paid.monthly.cardPaid === R(4000) && (await listCards(ws))[0].bill!.toPay === 0, "paying the card clears the bill");

  await addWish(ws, { title: "Thing", priceMinor: R(60000), type: "want", priority: 2, targetDate: null, notes: null, categoryId: null, downPaymentMinor: null, emiTenureMonths: null, emiRatePct: null });
  const before = (await affordability(ws, "INR")).order[0].month;
  await addGoal(ws, "Kept", R(80000), null);
  await addContribution(ws, (await listGoals(ws))[0].id, R(70000), today, null);
  const after = (await affordability(ws, "INR")).order[0].month;
  ok(before === today.slice(0, 7) && after === null, "money set aside for a goal is not offered to a purchase");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
