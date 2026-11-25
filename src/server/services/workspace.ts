import "server-only";
import { db, schema } from "@/server/db";

const EXPENSE = ["Food & dining", "Groceries", "Transport", "Rent", "Bills & utilities", "EMI", "Shopping", "Health", "Entertainment", "Travel", "Other"];
const INCOME = ["Salary", "Other income"];

/** Runs once when a user is created: a personal workspace, a Cash account and starter categories. */
export async function createPersonalWorkspace(userId: string, name: string) {
  await db.transaction(async (tx) => {
    const [ws] = await tx.insert(schema.workspaces).values({ name: `${name}'s budget` }).returning();
    await tx.insert(schema.workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });
    await tx.insert(schema.accounts).values({ workspaceId: ws.id, name: "Cash", type: "cash" });
    await tx.insert(schema.categories).values([
      ...EXPENSE.map((n) => ({ workspaceId: ws.id, name: n, kind: "expense" as const })),
      ...INCOME.map((n) => ({ workspaceId: ws.id, name: n, kind: "income" as const })),
    ]);
  });
}
