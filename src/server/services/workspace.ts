import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";

const EXPENSE = ["Food & dining", "Groceries", "Transport", "Rent", "Bills & utilities", "EMI", "Shopping", "Health", "Entertainment", "Travel", "Investments", "Other"];
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

export type WorkspaceRef = { id: string; name: string; homeCurrency: string };

/** The workspace a user belongs to, created on the spot if sign-up's hook failed. Shared by pages and the MCP endpoint. */
export async function workspaceForUser(userId: string, displayName: string): Promise<WorkspaceRef> {
  const find = () =>
    db.select({ id: schema.workspaces.id, name: schema.workspaces.name, homeCurrency: schema.workspaces.homeCurrency })
      .from(schema.workspaceMembers)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
      .where(eq(schema.workspaceMembers.userId, userId))
      .limit(1);
  let [row] = await find();
  if (!row) {
    await createPersonalWorkspace(userId, displayName.split(" ")[0] || "My");
    [row] = await find();
  }
  return row;
}
