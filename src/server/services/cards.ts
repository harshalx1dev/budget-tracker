import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { cardBill } from "@/lib/card";
import { todayISO } from "@/lib/dates";

const { accounts, transactions } = schema;

/** Every card account, with its bill when the bill and due days are known. */
export async function listCards(workspaceId: string) {
  const cards = await db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.type, "card"), isNull(accounts.archivedAt)));
  if (!cards.length) return [];
  const rows = await db.select({ accountId: transactions.accountId, on: transactions.occurredOn, kind: transactions.kind, amountMinor: transactions.amountMinor })
    .from(transactions).where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.accountId, cards.map((c) => c.id))));
  const today = todayISO();
  return cards.map((c) => ({
    id: c.id, name: c.name, currency: c.currency, statementDay: c.statementDay, dueDay: c.dueDay,
    bill: c.statementDay && c.dueDay ? cardBill({ statementDay: c.statementDay, dueDay: c.dueDay, today, openingBalanceMinor: c.openingBalanceMinor, rows: rows.filter((r) => r.accountId === c.id) }) : null,
  }));
}

export async function setCardCycle(workspaceId: string, accountId: string, statementDay: number | null, dueDay: number | null) {
  const ok = (d: number | null) => d === null || (Number.isInteger(d) && d >= 1 && d <= 31);
  if (!ok(statementDay) || !ok(dueDay) || (statementDay === null) !== (dueDay === null)) throw new Error("Give both days, each between 1 and 31");
  const done = await db.update(accounts).set({ statementDay, dueDay })
    .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId), eq(accounts.type, "card"))).returning({ id: accounts.id });
  if (!done.length) throw new Error("Card not found");
}
