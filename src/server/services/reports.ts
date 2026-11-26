import "server-only";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { addMonths } from "@/lib/dates";
import { nextMonth } from "@/lib/planner";
import { ASSET_TYPES } from "@/lib/savings";

const { accounts, categories, transactions } = schema;

/** Home-currency amounts only; foreign-currency rows use their stored rate. Transfers never count. */
const homeAmount = (home: string) => sql<number>`sum(case when ${transactions.currency} = ${home} then ${transactions.amountMinor} else round(${transactions.amountMinor} * coalesce(${transactions.fxRateToHome}, 0)) end)`.mapWith(Number);

export async function monthlyTotals(workspaceId: string, home: string, endMonth: string, count = 6) {
  const first = addMonths(`${endMonth}-01`, -(count - 1)).slice(0, 7);
  const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
  const rows = await db.select({ month, kind: transactions.kind, total: homeAmount(home) }).from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), isNull(transactions.transferId), gte(transactions.occurredOn, `${first}-01`), lt(transactions.occurredOn, `${nextMonth(endMonth)}-01`)))
    .groupBy(month, transactions.kind);
  // Money moved into savings and investments (transfers into those accounts, less what came back out).
  const saved = await db.select({ month, total: sql<number>`sum(case when ${transactions.kind} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end)`.mapWith(Number) })
    .from(transactions).innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.workspaceId, workspaceId), sql`${transactions.transferId} is not null`, sql`${accounts.type} in (${sql.join(ASSET_TYPES.map((t) => sql`${t}`), sql`, `)})`, gte(transactions.occurredOn, `${first}-01`), lt(transactions.occurredOn, `${nextMonth(endMonth)}-01`)))
    .groupBy(month);
  const out: { month: string; income: number; expense: number; saved: number }[] = [];
  for (let m = first, i = 0; i < count; m = nextMonth(m), i++) {
    out.push({ month: m, income: rows.find((r) => r.month === m && r.kind === "income")?.total ?? 0, expense: rows.find((r) => r.month === m && r.kind === "expense")?.total ?? 0, saved: saved.find((r) => r.month === m)?.total ?? 0 });
  }
  return out;
}

export async function spendingByCategory(workspaceId: string, home: string, month: string) {
  const name = sql<string>`coalesce(${categories.name}, 'Uncategorised')`;
  return db.select({ name, total: homeAmount(home) }).from(transactions).leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "expense"), isNull(transactions.transferId), gte(transactions.occurredOn, `${month}-01`), lt(transactions.occurredOn, `${nextMonth(month)}-01`)))
    .groupBy(name).orderBy(sql`2 desc`);
}

export async function topPayees(workspaceId: string, home: string, month: string, limit = 8) {
  const payee = sql<string>`coalesce(nullif(${transactions.payee}, ''), 'No name')`;
  return db.select({ name: payee, total: homeAmount(home), n: sql<number>`count(*)`.mapWith(Number) }).from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "expense"), isNull(transactions.transferId), gte(transactions.occurredOn, `${month}-01`), lt(transactions.occurredOn, `${nextMonth(month)}-01`)))
    .groupBy(payee).orderBy(sql`2 desc`).limit(limit);
}
