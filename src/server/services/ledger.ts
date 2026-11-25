import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";

const { accounts, categories, transactions } = schema;

export type NewAccount = { name: string; type: (typeof accounts.$inferInsert)["type"]; currency: string; openingBalanceMinor: number };
export type NewTransaction = {
  accountId: string;
  categoryId: string | null;
  kind: "income" | "expense";
  amountMinor: number;
  fxRateToHome: string | null;
  payee: string | null;
  note: string | null;
  occurredOn: string; // YYYY-MM-DD
};

export async function listAccounts(workspaceId: string) {
  // Balance = opening + income - expense, in the account's own currency.
  const bal = sql<number>`${accounts.openingBalanceMinor} + coalesce(sum(case when ${transactions.kind} = 'income' then ${transactions.amountMinor} else -${transactions.amountMinor} end), 0)`.mapWith(Number);
  return db
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, currency: accounts.currency, balanceMinor: bal })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(eq(accounts.workspaceId, workspaceId))
    .groupBy(accounts.id)
    .orderBy(accounts.createdAt);
}

export async function createAccount(workspaceId: string, a: NewAccount) {
  await db.insert(accounts).values({ workspaceId, ...a });
}

export function listCategories(workspaceId: string) {
  return db.select().from(categories).where(eq(categories.workspaceId, workspaceId)).orderBy(categories.name);
}

export async function listTransactions(workspaceId: string, limit = 100) {
  return db
    .select({
      id: transactions.id,
      kind: transactions.kind,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      payee: transactions.payee,
      note: transactions.note,
      occurredOn: transactions.occurredOn,
      account: accounts.name,
      category: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.workspaceId, workspaceId))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(limit);
}

/** Month totals in the workspace home currency (rows in other currencies use their stored rate). */
export async function monthSummary(workspaceId: string, homeCurrency: string, month: string /* YYYY-MM */) {
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const rows = await db
    .select({ kind: transactions.kind, amountMinor: transactions.amountMinor, currency: transactions.currency, fx: transactions.fxRateToHome })
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), gte(transactions.occurredOn, start), lt(transactions.occurredOn, end)));
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    const home = r.currency === homeCurrency ? r.amountMinor : r.fx ? Math.round(r.amountMinor * Number(r.fx)) : 0;
    if (r.kind === "income") income += home;
    else expense += home;
  }
  return { income, expense };
}

export async function createTransaction(workspaceId: string, t: NewTransaction, homeCurrency: string) {
  // The account (and category) must belong to this workspace; the currency follows the account.
  const [acct] = await db.select().from(accounts).where(and(eq(accounts.id, t.accountId), eq(accounts.workspaceId, workspaceId)));
  if (!acct) throw new Error("account not found");
  if (t.categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, t.categoryId), eq(categories.workspaceId, workspaceId)));
    if (!c) throw new Error("category not found");
  }
  if (acct.currency !== homeCurrency && !t.fxRateToHome) throw new Error("exchange rate required");
  await db.insert(transactions).values({
    workspaceId,
    ...t,
    currency: acct.currency,
    fxRateToHome: acct.currency === homeCurrency ? null : t.fxRateToHome,
  });
}

export async function deleteTransaction(workspaceId: string, id: string) {
  await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)));
}
