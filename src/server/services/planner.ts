import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { listAccounts } from "@/server/services/ledger";
import { listExpected } from "@/server/services/commitments";
import { budgetAvailable, computeSafeToSpend, goalProgress, monthEnd, nextMonth, projectForecast, variableSpend, type ForecastMonth } from "@/lib/planner";
import { addMonths, daysBetween, shiftDays, todayISO } from "@/lib/dates";

const { budgets, categories, expectedMatches, goalContributions, goals, transactions, workspaces } = schema;

/* ---------- budgets ---------- */

/** Spend per category per month from `fromMonth` through `toMonth` (inclusive), transfers excluded. */
async function spentByCategoryMonth(workspaceId: string, fromMonth: string, toMonth: string, categoryIds?: string[]) {
  const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const rows = await db
    .select({ categoryId: transactions.categoryId, month, total: sql<number>`sum(${transactions.amountMinor})`.mapWith(Number) })
    .from(transactions)
    .where(and(
      eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "expense"), isNull(transactions.transferId),
      gte(transactions.occurredOn, `${fromMonth}-01`), lt(transactions.occurredOn, `${nextMonth(toMonth)}-01`),
      categoryIds ? inArray(transactions.categoryId, categoryIds) : undefined,
    ))
    .groupBy(transactions.categoryId, month);
  const out = new Map<string | null, Record<string, number>>();
  for (const r of rows) out.set(r.categoryId, { ...(out.get(r.categoryId) ?? {}), [r.month]: r.total });
  return out;
}

export async function budgetStatus(workspaceId: string, month: string) {
  const list = await db
    .select({ id: budgets.id, categoryId: budgets.categoryId, category: categories.name, limit: budgets.amountMinor, rollover: budgets.rollover, startMonth: budgets.startMonth })
    .from(budgets).innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.workspaceId, workspaceId)).orderBy(asc(categories.name));
  if (!list.length) return [];
  const from = list.reduce((m, b) => (b.startMonth < m ? b.startMonth : m), month);
  const spent = await spentByCategoryMonth(workspaceId, from, month, list.map((b) => b.categoryId));
  return list.map((b) => {
    const byMonth = spent.get(b.categoryId) ?? {};
    const available = budgetAvailable({ limit: b.limit, rollover: b.rollover, startMonth: b.startMonth, month, spentByMonth: byMonth });
    const spentNow = byMonth[month] ?? 0;
    return { ...b, available, spent: spentNow, left: available - spentNow };
  });
}

export async function setBudget(workspaceId: string, categoryId: string, amountMinor: number, rollover: boolean, month: string) {
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.workspaceId, workspaceId), eq(categories.kind, "expense")));
  if (!c) throw new Error("pick an expense category");
  await db.insert(budgets).values({ workspaceId, categoryId, amountMinor, rollover, startMonth: month })
    .onConflictDoUpdate({ target: [budgets.workspaceId, budgets.categoryId], set: { amountMinor, rollover } });
}

export const deleteBudget = (workspaceId: string, id: string) => db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)));

/* ---------- goals ---------- */

export async function listGoals(workspaceId: string) {
  const rows = await db.select().from(goals).where(and(eq(goals.workspaceId, workspaceId), isNull(goals.archivedAt))).orderBy(asc(goals.createdAt));
  const sums = await db.select({ goalId: goalContributions.goalId, saved: sql<number>`sum(${goalContributions.amountMinor})`.mapWith(Number) })
    .from(goalContributions).where(eq(goalContributions.workspaceId, workspaceId)).groupBy(goalContributions.goalId);
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const thisMonth = await db.select({ goalId: goalContributions.goalId, n: sql<number>`sum(${goalContributions.amountMinor})`.mapWith(Number) })
    .from(goalContributions).where(and(eq(goalContributions.workspaceId, workspaceId), gte(goalContributions.madeOn, monthStart))).groupBy(goalContributions.goalId);
  return rows.map((g) => {
    const saved = sums.find((s) => s.goalId === g.id)?.saved ?? 0;
    const contributedThisMonth = thisMonth.find((s) => s.goalId === g.id)?.n ?? 0;
    return { ...g, saved, contributedThisMonth, ...goalProgress({ targetMinor: g.targetMinor, savedMinor: saved, targetDate: g.targetDate, today }) };
  });
}

export async function addGoal(workspaceId: string, name: string, targetMinor: number, targetDate: string | null) {
  await db.insert(goals).values({ workspaceId, name, targetMinor, targetDate });
}

export async function addContribution(workspaceId: string, goalId: string, amountMinor: number, madeOn: string, note: string | null) {
  const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.workspaceId, workspaceId)));
  if (!g) throw new Error("goal not found");
  await db.insert(goalContributions).values({ workspaceId, goalId, amountMinor, madeOn, note });
}

export const archiveGoal = (workspaceId: string, id: string) => db.update(goals).set({ archivedAt: new Date() }).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));

export async function setBuffer(workspaceId: string, bufferMinor: number) {
  await db.update(workspaces).set({ bufferMinor }).where(eq(workspaces.id, workspaceId));
}

/* ---------- safe to spend ---------- */

export async function safeToSpend(workspaceId: string, homeCurrency: string) {
  const today = todayISO();
  const [accts, expected, goalRows, [ws]] = await Promise.all([
    listAccounts(workspaceId),
    listExpected(workspaceId, today, shiftDays(today, 70)),
    listGoals(workspaceId),
    db.select({ buffer: workspaces.bufferMinor }).from(workspaces).where(eq(workspaces.id, workspaceId)),
  ]);
  const balance = accts.filter((a) => a.currency === homeCurrency).reduce((s, a) => s + a.balanceMinor, 0);
  const unpaid = expected.filter((e) => e.status !== "paid");
  const nextIncome = unpaid.filter((e) => e.kind === "income").map((e) => e.dueOn).sort()[0] ?? null;
  // Without a known payday the horizon is the end of this month.
  const horizon = nextIncome ?? shiftDays(monthEnd(today.slice(0, 7)), 1);
  const due = unpaid.filter((e) => e.kind === "expense" && e.dueOn < horizon);
  const dueOutflows = due.reduce((s, e) => s + e.amountMinor, 0);
  const goalSetAside = goalRows.reduce((s, g) => s + (g.requiredMonthly ? Math.max(0, g.requiredMonthly - g.contributedThisMonth) : 0), 0);
  const calc = computeSafeToSpend({ balance, dueOutflows, goalSetAside, buffer: ws.buffer, days: daysBetween(today, horizon) });
  return { balance, dueOutflows, due, goalSetAside, buffer: ws.buffer, nextIncome, horizon, incomeKnown: nextIncome !== null, ...calc };
}

/* ---------- forecast ---------- */

export async function forecast(workspaceId: string, homeCurrency: string, count = 6) {
  const today = todayISO();
  const thisYM = today.slice(0, 7);
  const yms: string[] = [thisYM];
  for (let i = 1; i < count; i++) yms.push(nextMonth(yms[i - 1]));
  const endDate = monthEnd(yms.at(-1)!);

  const [accts, expectedAll, status] = await Promise.all([listAccounts(workspaceId), listExpected(workspaceId, today, endDate), budgetStatus(workspaceId, thisYM)]);
  const startBalance = accts.filter((a) => a.currency === homeCurrency).reduce((s, a) => s + a.balanceMinor, 0);
  const expected = expectedAll.filter((e) => e.status !== "paid");

  // Recent uncommitted spend (not matched to a loan or rule) as the baseline for categories without a budget.
  const histFrom = addMonths(`${thisYM}-01`, -3).slice(0, 7);
  const prevEnd = shiftDays(`${thisYM}-01`, -1);
  const hist = await db
    .select({ categoryId: transactions.categoryId, total: sql<number>`sum(${transactions.amountMinor})`.mapWith(Number), first: sql<string>`min(${transactions.occurredOn})` })
    .from(transactions)
    .where(and(
      eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "expense"), isNull(transactions.transferId),
      gte(transactions.occurredOn, `${histFrom}-01`), lt(transactions.occurredOn, `${thisYM}-01`),
      notExists(db.select({ x: sql`1` }).from(expectedMatches).where(eq(expectedMatches.transactionId, transactions.id))),
    ))
    .groupBy(transactions.categoryId);
  const [firstTx] = await db.select({ d: sql<string | null>`min(${transactions.occurredOn})` }).from(transactions).where(eq(transactions.workspaceId, workspaceId));
  const monthsOfHistory = firstTx?.d ? Math.min(3, Math.max(1, Math.round(daysBetween(firstTx.d > `${histFrom}-01` ? firstTx.d : `${histFrom}-01`, prevEnd) / 30))) : 1;
  const budgetedIds = new Set(status.map((b) => b.categoryId));
  const unbudgetedAvg = Math.round(hist.filter((h) => !h.categoryId || !budgetedIds.has(h.categoryId)).reduce((s, h) => s + h.total, 0) / monthsOfHistory);

  const dim = new Date(Date.UTC(+thisYM.slice(0, 4), +thisYM.slice(5, 7), 0)).getUTCDate();
  const months: ForecastMonth[] = yms.map((ym, i) => {
    const inMonth = expected.filter((e) => e.dueOn.slice(0, 7) === ym);
    const income = inMonth.filter((e) => e.kind === "income").reduce((s, e) => s + e.amountMinor, 0);
    const committed = inMonth.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amountMinor, 0);
    const committedIn = (cat: string) => inMonth.filter((e) => e.kind === "expense" && e.categoryId === cat).reduce((s, e) => s + e.amountMinor, 0);
    const variable = variableSpend({
      budgeted: status.map((b) => ({ limitAvailable: i === 0 ? b.available : b.limit, committed: committedIn(b.categoryId), spentSoFar: i === 0 ? b.spent : 0 })),
      unbudgetedAvg,
      fractionLeft: i === 0 ? (dim - Number(today.slice(8)) + 1) / dim : 1,
    });
    return { month: ym, income, committed, variable };
  });

  return {
    startBalance,
    rows: projectForecast(startBalance, months),
    incomeKnown: expected.some((e) => e.kind === "income"),
    hasBudgets: status.length > 0,
    unbudgetedAvg,
  };
}
