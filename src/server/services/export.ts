import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { toCsv } from "@/lib/csv";
import { exponent } from "@/lib/money";

const { accounts, budgets, categories, goalContributions, goals, loanRevisions, loans, recurringRules, transactions, wishlistItems, wishlistLinks } = schema;

const major = (minor: number, cur: string) => minor / 10 ** exponent(cur);

export async function transactionsCsv(workspaceId: string, range: { from?: string; to?: string }) {
  const conds = [eq(transactions.workspaceId, workspaceId)];
  if (range.from) conds.push(gte(transactions.occurredOn, range.from));
  if (range.to) conds.push(lte(transactions.occurredOn, range.to));
  const rows = await db
    .select({ date: transactions.occurredOn, kind: transactions.kind, amountMinor: transactions.amountMinor, currency: transactions.currency, account: accounts.name, category: categories.name, payee: transactions.payee, note: transactions.note, narration: transactions.rawNarration, status: transactions.status, transfer: transactions.transferId, source: transactions.source })
    .from(transactions).innerJoin(accounts, eq(accounts.id, transactions.accountId)).leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...conds)).orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
  return toCsv(
    ["date", "type", "amount", "currency", "account", "category", "payee", "note", "bank description", "needs category", "added by"],
    rows.map((r) => [r.date, r.transfer ? "transfer" : r.kind, major(r.amountMinor, r.currency), r.currency, r.account, r.category, r.payee, r.note, r.narration, r.status === "pending" ? "yes" : "no", r.source]),
  );
}

/** Everything in the workspace as one JSON document. Amounts stay in minor units with their currency. */
export async function fullBackup(workspaceId: string) {
  const w = (t: { workspaceId: unknown }) => eq(t.workspaceId as never, workspaceId);
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  const [accs, cats, txs, ls, lrs, rules, bs, gs, gcs, wis, wls] = await Promise.all([
    db.select().from(accounts).where(w(accounts)).orderBy(asc(accounts.createdAt)),
    db.select().from(categories).where(w(categories)),
    db.select().from(transactions).where(w(transactions)).orderBy(asc(transactions.occurredOn)),
    db.select().from(loans).where(w(loans)),
    db.select().from(loanRevisions).where(w(loanRevisions)),
    db.select().from(recurringRules).where(w(recurringRules)),
    db.select().from(budgets).where(w(budgets)),
    db.select().from(goals).where(w(goals)),
    db.select().from(goalContributions).where(w(goalContributions)),
    db.select().from(wishlistItems).where(w(wishlistItems)),
    db.select().from(wishlistLinks).where(w(wishlistLinks)),
  ]);
  return {
    app: "budget-tracker", exportedAt: new Date().toISOString(), format: 1,
    note: "Amounts are integer minor units (paise, cents) with a currency code. No passwords, API keys or tokens are included.",
    workspace: { name: ws.name, homeCurrency: ws.homeCurrency, bufferMinor: ws.bufferMinor, maxEmiRatioPct: ws.maxEmiRatioPct },
    accounts: accs, categories: cats, transactions: txs, loans: ls, loanRevisions: lrs, recurringRules: rules, budgets: bs, goals: gs, goalContributions: gcs, wishlistItems: wis, wishlistLinks: wls,
  };
}
