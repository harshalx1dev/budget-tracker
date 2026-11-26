"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { db, schema } from "@/server/db";
import { testKey } from "@/server/ai/gateway";
import { lastFour, seal } from "@/server/ai/crypto";
import { AiError, toAiError } from "@/server/ai/errors";
import { adviseWishlist, summariseMonth } from "@/server/services/ai-features";
import { thisMonth } from "@/lib/dates";

export type AiState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): AiState => ({ error: e instanceof AiError ? e.message : toAiError(e).message });

const keySchema = z.string().trim().min(20, "That does not look like a Gemini API key").max(200).regex(/^\S+$/, "API keys have no spaces");

/** Tests the key with a tiny call, then stores it encrypted. Only the last four characters are ever shown again. */
export async function saveKeyAction(_: AiState, fd: FormData): Promise<AiState> {
  const { user } = await requireWorkspace();
  const p = keySchema.safeParse(fd.get("key"));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Invalid key" };
  try { await testKey(p.data); } catch (e) { return fail(e); }
  let sealed;
  try { sealed = seal(p.data); } catch { return { error: "The server cannot store keys yet: ENCRYPTION_KEY is missing." }; }
  const row = { ...sealed, last4: lastFour(p.data), validatedAt: new Date(), provider: "google" };
  await db.insert(schema.aiCredentials).values({ userId: user.id, ...row }).onConflictDoUpdate({ target: schema.aiCredentials.userId, set: row });
  refresh();
  return { message: "Key saved." };
}

export async function removeKeyAction() {
  const { user } = await requireWorkspace();
  await db.delete(schema.aiCredentials).where(eq(schema.aiCredentials.userId, user.id));
  refresh();
}

export async function adviseWishlistAction(): Promise<AiState> {
  const { user, workspace } = await requireWorkspace();
  try { await adviseWishlist(user.id, workspace.id, workspace.homeCurrency); refresh(); return { message: "done" }; } catch (e) { return fail(e); }
}

export async function summariseMonthAction(): Promise<AiState> {
  const { user, workspace } = await requireWorkspace();
  try { await summariseMonth(user.id, workspace.id, workspace.homeCurrency, thisMonth()); refresh(); return { message: "done" }; } catch (e) { return fail(e); }
}
