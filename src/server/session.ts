import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db, schema } from "@/server/db";
import { createPersonalWorkspace } from "@/server/services/workspace";

export type CurrentUser = { id: string; name: string; email: string; role: "user" | "admin" };
export type Workspace = { id: string; name: string; homeCurrency: string };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const role = (s.user as { role?: string }).role === "admin" ? "admin" : "user";
  return { id: s.user.id, name: s.user.name, email: s.user.email, role };
});

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/app");
  return u;
}

const findWorkspace = (userId: string) =>
  db
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, homeCurrency: schema.workspaces.homeCurrency })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, userId))
    .limit(1);

/** The signed-in user's workspace. Every service takes this id; nothing reads data without it. */
export const requireWorkspace = cache(async (): Promise<{ user: CurrentUser; workspace: Workspace }> => {
  const user = await requireUser();
  let [row] = await findWorkspace(user.id);
  if (!row) {
    // The sign-up hook can fail after the user row is written; heal instead of looping to /login.
    await createPersonalWorkspace(user.id, user.name.split(" ")[0] || "My");
    [row] = await findWorkspace(user.id);
  }
  return { user, workspace: row };
});
