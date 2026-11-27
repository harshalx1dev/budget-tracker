import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { listAccounts } from "@/server/services/ledger";
import { listCards } from "@/server/services/cards";
import { listExpected } from "@/server/services/commitments";
import { listAssets, upcomingMaturities } from "@/server/services/savings";
import { ASSET_TYPES, isAssetType } from "@/lib/savings";
import { budgetAvailable, computeMonthlySafe, beyondBills, computeSafeToSpend, goalHolds, goalProgress, monthEnd, nextMonth, projectForecast, variableSpend, type ForecastMonth } from "@/lib/planner";
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
  if (!c) throw new Error("Pick an expense category");
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
  const assetValue = new Map((await listAssets(workspaceId)).map((a) => [a.id, a.valueMinor]));
  const monthStart = `${today.slice(0, 7)}-01`;
  const thisMonth = await db.select({ goalId: goalContributions.goalId, n: sql<number>`sum(${goalContributions.amountMinor})`.mapWith(Number) })
    .from(goalContributions).where(and(eq(goalContributions.workspaceId, workspaceId), gte(goalContributions.madeOn, monthStart))).groupBy(goalContributions.goalId);
  return rows.map((g) => {
    const saved = g.accountId && assetValue.has(g.accountId) ? assetValue.get(g.accountId)! : (sums.find((s) => s.goalId === g.id)?.saved ?? 0);
    const contributedThisMonth = thisMonth.find((s) => s.goalId === g.id)?.n ?? 0;
    return { ...g, saved, contributedThisMonth, ...goalProgress({ targetMinor: g.targetMinor, savedMinor: saved, targetDate: g.targetDate, today }) };
  });
}

export const setGoalFixed = (workspaceId: string, id: string, fixed: boolean) => db.update(goals).set({ fixed }).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));

export async function addGoal(workspaceId: string, name: string, targetMinor: number, targetDate: string | null, accountId: string | null = null, fixed = false) {
  if (accountId) {
    const [a] = await db.select({ type: schema.accounts.type }).from(schema.accounts).where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.workspaceId, workspaceId)));
    if (!a || !isAssetType(a.type)) throw new Error("Pick a savings or investment account to track this goal");
  }
  await db.insert(goals).values({ workspaceId, name, targetMinor, targetDate, accountId, fixed });
}

export async function updateGoal(workspaceId: string, id: string, v: { name: string; targetMinor: number; targetDate: string | null; accountId: string | null; fixed: boolean }) {
  if (v.accountId) {
    const [a] = await db.select({ type: schema.accounts.type }).from(schema.accounts).where(and(eq(schema.accounts.id, v.accountId), eq(schema.accounts.workspaceId, workspaceId)));
    if (!a || !isAssetType(a.type)) throw new Error("Pick a savings or investment account to track this goal");
  }
  const done = await db.update(goals).set(v).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId))).returning({ id: goals.id });
  if (!done.length) throw new Error("Goal not found");
}

export async function addContribution(workspaceId: string, goalId: string, amountMinor: number, madeOn: string, note: string | null) {
  const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.workspaceId, workspaceId)));
  if (!g) throw new Error("Goal not found");
  await db.insert(goalContributions).values({ workspaceId, goalId, amountMinor, madeOn, note });
}

export const archiveGoal = (workspaceId: string, id: string) => db.update(goals).set({ archivedAt: new Date() }).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));

export async function setBuffer(workspaceId: string, bufferMinor: number) {
  await db.update(workspaces).set({ bufferMinor }).where(eq(workspaces.id, workspaceId));
}

/* ---------- safe to spend ---------- */

export async function safeToSpend(workspaceId: string, homeCurrency: string) {
  const today = todayISO();
  const [accts, expected, goalRows, [ws], cards] = await Promise.all([
    listAccounts(workspaceId),
    listExpected(workspaceId, shiftDays(today, -45), shiftDays(today, 70)),
    listGoals(workspaceId),
    db.select({ buffer: workspaces.bufferMinor }).from(workspaces).where(eq(workspaces.id, workspaceId)),
    listCards(workspaceId),
  ]);
  const balance = accts.filter((a) => a.currency === homeCurrency && !isAssetType(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  // A bill that is late is still owed, so unpaid expenses count however old; income only counts from today.
  const unpaid = expected.filter((e) => e.status !== "paid" && (e.kind === "expense" || e.dueOn >= today));
  const nextIncome = unpaid.filter((e) => e.kind === "income").map((e) => e.dueOn).sort()[0] ?? null;
  // Without a known payday the horizon is the end of this month.
  const horizon = nextIncome ?? shiftDays(monthEnd(today.slice(0, 7)), 1);
  const due = unpaid.filter((e) => e.kind === "expense" && e.dueOn < horizon);
  const dueOutflows = due.reduce((s, e) => s + e.amountMinor, 0);
  // The cycle began on the last payday that actually arrived; without one it is the calendar month.
  const lastPay = expected.filter((e) => e.kind === "income" && e.status === "paid" && e.dueOn <= shiftDays(today, 5)).map((e) => e.dueOn).sort().at(-1) ?? null;
  const cycleStart = lastPay ? await paidOn(workspaceId, expected, lastPay) : `${today.slice(0, 7)}-01`;
  const kept = await db.select({ goalId: goalContributions.goalId, n: sql<number>`sum(${goalContributions.amountMinor})`.mapWith(Number) })
    .from(goalContributions).where(and(eq(goalContributions.workspaceId, workspaceId), gte(goalContributions.madeOn, cycleStart))).groupBy(goalContributions.goalId);
  const movedIn = await db.select({ accountId: transactions.accountId, n: sql<number>`sum(${transactions.amountMinor})`.mapWith(Number) })
    .from(transactions).where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "income"), sql`${transactions.transferId} is not null`, gte(transactions.occurredOn, `${today.slice(0, 7)}-01`))).groupBy(transactions.accountId);
  const holds = goalHolds(goalRows.map((g) => ({
    fixed: g.fixed, byHand: !g.accountId, saved: g.saved, requiredMonthly: g.requiredMonthly,
    keptThisCycle: kept.find((k) => k.goalId === g.id)?.n ?? 0,
    addedThisMonth: g.accountId ? (movedIn.find((m) => m.accountId === g.accountId)?.n ?? 0) : g.contributedThisMonth,
  })));
  const goalSetAside = holds.fromAccounts;
  const calc = computeSafeToSpend({ balance, dueOutflows, goalSetAside, buffer: ws.buffer, days: daysBetween(today, horizon) });
  // Cards with known dates are counted when their bill is paid, as the salary that pays it sees it.
  const billed = cards.filter((c) => c.bill && c.currency === homeCurrency);
  const billedIds = new Set(billed.map((c) => c.id));
  const cardDue = billed.filter((c) => c.bill!.toPay > 0 && c.bill!.dueOn < horizon).map((c) => ({ name: `${c.name} bill`, amountMinor: c.bill!.toPay, dueOn: c.bill!.dueOn }));
  const cardDueTotal = cardDue.reduce((s, c) => s + c.amountMinor, 0);
  // A subscription charged to such a card is paid through the card's bill, not out of this salary directly.
  const billsDue = due.filter((e) => !(e.accountId && billedIds.has(e.accountId)));
  const billsDueTotal = billsDue.reduce((s, e) => s + e.amountMinor, 0);
  const flow = await cycleFlow(workspaceId, homeCurrency, cycleStart, today, billedIds);
  const monthly = {
    cycleStart, fromPayday: lastPay !== null, ...flow, goalSetAside: holds.fromCycle, billsDue: billsDueTotal, cardDue: cardDueTotal,
    onCards: billed.reduce((s, c) => s + c.bill!.unbilled, 0),
    due: [...billsDue.map((e) => ({ name: e.name, amountMinor: e.amountMinor, dueOn: e.dueOn })), ...cardDue],
    ...computeMonthlySafe({ income: flow.income, spent: flow.spent + flow.cardPaid, saved: flow.saved, dueOutflows: billsDueTotal + cardDueTotal, goalSetAside: holds.fromCycle, accountSafe: calc.safe, days: calc.days }),
  };
  return { balance, dueOutflows, due, goalSetAside, buffer: ws.buffer, nextIncome, horizon, incomeKnown: nextIncome !== null, monthly, ...calc };
}

/** The date the money for a paid payday really landed, which can be a day or two off the planned date. */
async function paidOn(workspaceId: string, expected: Awaited<ReturnType<typeof listExpected>>, due: string) {
  const ids = expected.filter((e) => e.kind === "income" && e.dueOn === due && e.transactionId).map((e) => e.transactionId!);
  if (!ids.length) return due;
  const rows = await db.select({ on: transactions.occurredOn }).from(transactions).where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.id, ids)));
  return rows.map((r) => r.on).sort()[0] ?? due;
}

/** Money in, spent, and moved into savings between two dates, in the home currency. */
async function cycleFlow(workspaceId: string, home: string, from: string, to: string, billedCards: Set<string>) {
  const { accounts } = schema;
  const rows = await db.select({ accountId: transactions.accountId, kind: transactions.kind, amount: transactions.amountMinor, transferId: transactions.transferId, type: accounts.type })
    .from(transactions).innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.currency, home), gte(transactions.occurredOn, from), lt(transactions.occurredOn, shiftDays(to, 1))));
  let income = 0, spent = 0, saved = 0, cardPaid = 0;
  for (const r of rows) {
    const asset = (ASSET_TYPES as readonly string[]).includes(r.type);
    if (billedCards.has(r.accountId)) { if (r.transferId && r.kind === "income") cardPaid += r.amount; }
    else if (r.transferId) { if (asset) saved += r.kind === "income" ? r.amount : -r.amount; }
    else if (!asset) { if (r.kind === "income") income += r.amount; else spent += r.amount; }
  }
  return { income, spent, saved, cardPaid };
}

/* ---------- forecast ---------- */

export async function forecast(workspaceId: string, homeCurrency: string, count = 6) {
  const today = todayISO();
  const thisYM = today.slice(0, 7);
  const yms: string[] = [thisYM];
  for (let i = 1; i < count; i++) yms.push(nextMonth(yms[i - 1]));
  const endDate = monthEnd(yms.at(-1)!);

  const [accts, expectedAll, status, maturities] = await Promise.all([listAccounts(workspaceId), listExpected(workspaceId, shiftDays(today, -45), endDate), budgetStatus(workspaceId, thisYM), upcomingMaturities(workspaceId, today, endDate)]);
  const startBalance = accts.filter((a) => a.currency === homeCurrency && !isAssetType(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  // Bills that are late still have to be paid, so they fall in this month.
  const expected = expectedAll.filter((e) => e.status !== "paid" && (e.kind === "expense" || e.dueOn >= today)).map((e) => (e.dueOn < today ? { ...e, dueOn: today } : e));

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
  const average = new Map<string | null, number>(hist.filter((h) => !h.categoryId || !budgetedIds.has(h.categoryId)).map((h) => [h.categoryId, h.total / monthsOfHistory]));
  // Bills by category for each full month ahead.
  const billsByMonth = yms.slice(1).map((ym) => {
    const m = new Map<string | null, number>();
    for (const e of expectedAll) if (e.kind === "expense" && e.dueOn.slice(0, 7) === ym) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + e.amountMinor);
    return m;
  });
  const unbudgetedAvg = beyondBills(average, billsByMonth);

  const dim = new Date(Date.UTC(+thisYM.slice(0, 4), +thisYM.slice(5, 7), 0)).getUTCDate();
  const months: ForecastMonth[] = yms.map((ym, i) => {
    const inMonth = expected.filter((e) => e.dueOn.slice(0, 7) === ym);
    // Fixed deposits paying out this month come back as money you can spend.
    const income = inMonth.filter((e) => e.kind === "income").reduce((s, e) => s + e.amountMinor, 0) + maturities.filter((m) => m.maturityOn.slice(0, 7) === ym).reduce((s, m) => s + m.maturityMinor, 0);
    const committed = inMonth.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amountMinor, 0);
    const committedIn = (cat: string) => inMonth.filter((e) => e.kind === "expense" && e.categoryId === cat).reduce((s, e) => s + e.amountMinor, 0);
    const variable = variableSpend({
      budgeted: status.map((b) => ({ limitAvailable: i === 0 ? b.available : b.limit, committed: committedIn(b.categoryId), spentSoFar: i === 0 ? b.spent : 0 })),
      unbudgetedAvg,
      fractionLeft: i === 0 ? (dim - Number(today.slice(8)) + 1) / dim : 1,
    });
    return { month: ym, income, committed, variable };
  });

  const emiByMonth = yms.map((ym) => expected.filter((e) => e.sourceKind === "loan" && e.dueOn.slice(0, 7) === ym).reduce((t, e) => t + e.amountMinor, 0));

  return {
    startBalance,
    emiByMonth,
    maturities,
    rows: projectForecast(startBalance, months),
    incomeKnown: expected.some((e) => e.kind === "income"),
    hasBudgets: status.length > 0,
    unbudgetedAvg,
  };
}
