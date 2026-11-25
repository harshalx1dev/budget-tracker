import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, schema } from "@/server/db";

export type CurrentUser = { id: string; name: string; email: string };
export type Workspace = { id: string; name: string; homeCurrency: string };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  return s ? { id: s.user.id, name: s.user.name, email: s.user.email } : null;
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** The signed-in user's workspace. Every service takes this id; nothing reads data without it. */
export const requireWorkspace = cache(async (): Promise<{ user: CurrentUser; workspace: Workspace }> => {
  const user = await requireUser();
  const [row] = await db
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, homeCurrency: schema.workspaces.homeCurrency })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, user.id))
    .limit(1);
  if (!row) redirect("/login");
  return { user, workspace: row };
});
