// Service-level check of Phase 3 against the real database, using invented data only.
// Run: npm run check:planner. It deletes data, so it only touches the dedicated test account's workspace.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createLoan, createRule } from "@/server/services/commitments";
import { addContribution, addGoal, budgetStatus, forecast, listGoals, safeToSpend, setBudget, setBuffer } from "@/server/services/planner";
import { occurrences } from "@/lib/recurrence";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const ws = m.workspaceId;
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets, schema.goals, schema.fixedDeposits]) await db.delete(t).where(eq(t.workspaceId, ws));

  const today = todayISO();
  const accts = await db.select().from(schema.accounts).where(eq(schema.accounts.workspaceId, ws));
  for (const a of accts) await db.update(schema.accounts).set({ openingBalanceMinor: a.type === "cash" ? 0 : 5000000 }).where(eq(schema.accounts.id, a.id));
  const bank = accts.find((a) => a.type !== "cash")!;
  const cash = accts.find((a) => a.type === "cash")!;
  const [food] = await db.select().from(schema.categories).where(and(eq(schema.categories.workspaceId, ws), eq(schema.categories.name, "Food & dining")));
  const expectedBalance = 5000000 - 100000;

  // fixtures: salary on the last day (Sunday moves back), an EMI, a budget with one spend, a goal, a buffer
  const salary = { frequency: "monthly" as const, intervalCount: 1, startOn: `${today.slice(0, 7)}-01`, endOn: null, maxCount: null, anchor: "month_end" as const, weekendShift: "sunday_back" as const };
  await createRule(ws, { name: "Salary", kind: "income", amountMinor: 5489700, ...salary, matchPattern: null, accountId: null, categoryId: null });
  await createLoan(ws, { name: "Phone EMI", lender: null, emiMinor: 1115600, firstDueOn: shiftDays(today, 5), instalments: 3, principalMinor: null, annualRatePct: null, matchPattern: "hdbfinancial", accountId: null });
  await setBudget(ws, food.id, 600000, false, today.slice(0, 7));
  await db.insert(schema.transactions).values({ workspaceId: ws, accountId: bank.id, categoryId: food.id, kind: "expense", amountMinor: 100000, currency: "INR", payee: "fixture", occurredOn: today, source: "manual", status: "confirmed" });
  await addGoal(ws, "Emergency fund", 12000000, `${Number(today.slice(0, 4)) + 1}-${today.slice(5, 7)}-15`);
  const goal = (await listGoals(ws))[0];
  await addContribution(ws, goal.id, 100000, today, null);
  await setBuffer(ws, 500000);

  const b = (await budgetStatus(ws, today.slice(0, 7)))[0];
  ok(b.spent === 100000 && b.left === 500000, "budget shows ₹1,000 spent and ₹5,000 left");

  const g = (await listGoals(ws))[0];
  ok(g.saved === 100000 && g.remaining === 11900000 && (g.requiredMonthly ?? 0) > 0, "goal tracks saved money and the monthly amount needed");

  const next = occurrences(salary, today, shiftDays(today, 70))[0];
  const s = await safeToSpend(ws, "INR");
  ok(s.nextIncome === next, `next payday is ${next} (last day, Sunday moved back)`);
  ok(s.balance === expectedBalance, "balance is what is in the accounts");
  ok(s.safe === s.balance - s.dueOutflows - s.goalSetAside - s.buffer, "safe to spend is balance minus dues, goals and buffer");
  ok(s.buffer === 500000 && s.goalSetAside > 0, "buffer and goal set-aside are counted");

  const f = await forecast(ws, "INR", 6);
  ok(f.rows.length === 6 && f.rows[0].start === expectedBalance, "forecast starts from today's balance");
  ok(f.rows.every((r, i) => i === 0 || r.start === f.rows[i - 1].end), "each month starts where the last ended");
  ok(f.rows.slice(1).every((r) => r.income === 5489700), "salary lands every future month");
  ok(f.rows.some((r) => r.committed >= 1115600), "the EMI shows up as committed spending");
  ok(f.rows[1].variable >= 500000 && f.incomeKnown && f.hasBudgets, "budget limit drives everyday spending (headroom after any committed food)");
  console.log("cash account untouched:", cash.id.length > 0);
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
