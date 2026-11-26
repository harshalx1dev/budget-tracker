import "server-only";
import { and, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { workspaceForUser, type WorkspaceRef } from "@/server/services/workspace";
import { MAX_ACTIVE_TOKENS, RATE_LIMIT_PER_MINUTE, expiryDate, generateToken, hashToken, parseBearer, tokenState } from "@/lib/mcp-token";

const { mcpCalls, mcpTokens, user } = schema;

export type McpAuth = { tokenId: string; scopes: string[]; userId: string; workspace: WorkspaceRef };
export type McpAuthResult = { ok: true; auth: McpAuth } | { ok: false; reason: "missing" | "unknown" | "revoked" | "expired" };

/** Resolves `Authorization: Bearer bgt_...` to the token's owner and workspace. Callers answer every failure the same way. */
export async function authenticateBearer(header: string | null): Promise<McpAuthResult> {
  const token = parseBearer(header);
  if (!token) return { ok: false, reason: "missing" };
  const [row] = await db
    .select({ id: mcpTokens.id, scopes: mcpTokens.scopes, expiresAt: mcpTokens.expiresAt, revokedAt: mcpTokens.revokedAt, lastUsedAt: mcpTokens.lastUsedAt, userId: user.id, name: user.name })
    .from(mcpTokens).innerJoin(user, eq(user.id, mcpTokens.userId))
    .where(eq(mcpTokens.tokenHash, hashToken(token))).limit(1);
  if (!row) return { ok: false, reason: "unknown" };
  const state = tokenState(row);
  if (state !== "active") return { ok: false, reason: state };
  const now = new Date();
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) await db.update(mcpTokens).set({ lastUsedAt: now }).where(eq(mcpTokens.id, row.id));
  return { ok: true, auth: { tokenId: row.id, scopes: row.scopes, userId: row.userId, workspace: await workspaceForUser(row.userId, row.name) } };
}

/** Calls in the last minute, counted from the log so the limit holds across serverless instances. */
export async function isRateLimited(tokenId: string) {
  const [{ n }] = await db.select({ n: count() }).from(mcpCalls).where(and(eq(mcpCalls.tokenId, tokenId), gte(mcpCalls.createdAt, new Date(Date.now() - 60_000))));
  return n >= RATE_LIMIT_PER_MINUTE;
}

export async function logCall(tokenId: string, tool: string, ok: boolean) {
  try {
    await db.insert(mcpCalls).values({ tokenId, tool, ok });
    if (Math.random() < 0.02) await db.delete(mcpCalls).where(lt(mcpCalls.createdAt, new Date(Date.now() - 30 * 86_400_000)));
  } catch { /* logging must never break a tool call */ }
}

export type PublicToken = { id: string; name: string; prefix: string; scopes: string[]; expiresAt: Date | null; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date };

export const listTokens = (userId: string): Promise<PublicToken[]> =>
  db.select({ id: mcpTokens.id, name: mcpTokens.name, prefix: mcpTokens.prefix, scopes: mcpTokens.scopes, expiresAt: mcpTokens.expiresAt, lastUsedAt: mcpTokens.lastUsedAt, revokedAt: mcpTokens.revokedAt, createdAt: mcpTokens.createdAt })
    .from(mcpTokens).where(eq(mcpTokens.userId, userId)).orderBy(desc(mcpTokens.createdAt));

/** The plaintext token is returned once, here, and never stored. */
export async function createToken(userId: string, name: string, write: boolean, expiresInDays: number) {
  const active = (await listTokens(userId)).filter((t) => tokenState(t) === "active").length;
  if (active >= MAX_ACTIVE_TOKENS) throw new Error(`You can have ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`);
  const { token, prefix, hash } = generateToken();
  await db.insert(mcpTokens).values({ userId, name, prefix, tokenHash: hash, scopes: write ? ["read", "write"] : ["read"], expiresAt: expiryDate(expiresInDays) });
  return token;
}

export const revokeToken = (userId: string, id: string) =>
  db.update(mcpTokens).set({ revokedAt: new Date() }).where(and(eq(mcpTokens.id, id), eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));
