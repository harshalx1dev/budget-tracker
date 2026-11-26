import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";

const { accounts, transactions } = schema;

/** Pair an existing entry with a mirror leg in another account (e.g. an ATM debit becomes cash). */
export async function convertToTransfer(workspaceId: string, id: string, otherAccountId: string) {
  const [tx] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)));
  const [other] = await db.select().from(accounts).where(and(eq(accounts.id, otherAccountId), eq(accounts.workspaceId, workspaceId)));
  if (!tx || !other) throw new Error("Not found");
  if (other.currency !== tx.currency) throw new Error("Accounts use different currencies; add both legs by hand");
  if (other.id === tx.accountId) throw new Error("Pick a different account");
  const transferId = crypto.randomUUID();
  await db.transaction(async (t) => {
    await t.update(transactions).set({ transferId, categoryId: null, status: "confirmed" }).where(eq(transactions.id, id));
    await t.insert(transactions).values({
      workspaceId, accountId: other.id, kind: tx.kind === "expense" ? "income" : "expense", amountMinor: tx.amountMinor, currency: tx.currency,
      payee: "transfer", occurredOn: tx.occurredOn, transferId, source: tx.source, status: "confirmed",
    });
  });
}

export async function createTransfer(workspaceId: string, fromId: string, toId: string, amountMinor: number, date: string) {
  const accts = await db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), inArray(accounts.id, [fromId, toId])));
  const from = accts.find((a) => a.id === fromId);
  const to = accts.find((a) => a.id === toId);
  if (!from || !to || fromId === toId) throw new Error("Pick two different accounts");
  if (from.currency !== to.currency) throw new Error("Accounts use different currencies; add both legs by hand");
  const transferId = crypto.randomUUID();
  const base = { workspaceId, amountMinor, currency: from.currency, occurredOn: date, transferId, payee: "transfer", status: "confirmed" as const };
  await db.insert(transactions).values([{ ...base, accountId: fromId, kind: "expense" }, { ...base, accountId: toId, kind: "income" }]);
}

