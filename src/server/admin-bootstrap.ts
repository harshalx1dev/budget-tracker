import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import * as schema from "@/server/db/schema";

type DB = PostgresJsDatabase<typeof schema>;

export function adminEmails(raw = process.env.ADMIN_EMAILS) {
  return (raw ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export const isAdminEmail = (email: string, raw = process.env.ADMIN_EMAILS) => adminEmails(raw).includes(email.trim().toLowerCase());

export type BootstrapResult = { promoted: number; admin: "created" | "password-updated" | "unchanged" | "skipped"; reason?: string };

/**
 * Keeps admin accounts in line with the environment (runs on every server start):
 *  1. every address in ADMIN_EMAILS has role=admin, including accounts that signed up first;
 *  2. if ADMIN_PASSWORD is set, the FIRST address in ADMIN_EMAILS exists with that password: created if missing,
 *     and its password reset whenever ADMIN_PASSWORD changes (which also signs it out everywhere).
 * Nothing here reads or changes anyone's budget data. A personal workspace is created on the admin's first visit.
 * No "server-only" import, so scripts and tests can call it with their own db.
 */
export async function ensureAdmins(db: DB, env: Record<string, string | undefined> = process.env): Promise<BootstrapResult> {
  const emails = adminEmails(env.ADMIN_EMAILS);
  if (emails.length === 0) return { promoted: 0, admin: "skipped", reason: "ADMIN_EMAILS is empty" };

  const promoted = await db.update(schema.user).set({ role: "admin" }).where(and(inArray(schema.user.email, emails), ne(schema.user.role, "admin"))).returning({ id: schema.user.id });

  const password = env.ADMIN_PASSWORD ?? "";
  if (!password) return { promoted: promoted.length, admin: "skipped", reason: "ADMIN_PASSWORD is not set" };
  if (password.length < 8) return { promoted: promoted.length, admin: "skipped", reason: "ADMIN_PASSWORD must be at least 8 characters" };

  const email = emails[0];
  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email));

  if (!existing) {
    const id = randomUUID();
    await db.insert(schema.user).values({ id, name: "Admin", email, emailVerified: true, role: "admin" });
    await db.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) });
    return { promoted: promoted.length, admin: "created" };
  }

  const [cred] = await db.select().from(schema.account).where(and(eq(schema.account.userId, existing.id), eq(schema.account.providerId, "credential")));
  if (cred?.password && (await verifyPassword({ hash: cred.password, password }))) return { promoted: promoted.length, admin: "unchanged" };

  const hash = await hashPassword(password);
  if (cred) await db.update(schema.account).set({ password: hash }).where(eq(schema.account.id, cred.id));
  else await db.insert(schema.account).values({ id: randomUUID(), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash }); // admin first signed in with Google
  await db.delete(schema.session).where(eq(schema.session.userId, existing.id)); // a changed password signs the admin out everywhere
  return { promoted: promoted.length, admin: "password-updated" };
}
