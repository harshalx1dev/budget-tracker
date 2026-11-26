import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { and, count, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import { db, schema } from "@/server/db";
import { open } from "./crypto";
import { AiError, toAiError } from "./errors";

const { aiCredentials, aiUsage } = schema;

// Pinned models; override with GEMINI_MODEL / GEMINI_BASIC_MODEL. "basic" does extraction, "smart" writes.
export const MODELS = { smart: process.env.GEMINI_MODEL || "gemini-3.6-flash", basic: process.env.GEMINI_BASIC_MODEL || "gemini-3.5-flash-lite" } as const;

export type AiFeature = "categorize" | "parse_entry" | "advise_wishlist" | "summarize_month" | "test_key";
const BASIC: AiFeature[] = ["categorize", "parse_entry", "test_key"];

const LIMITS = { perHour: 60, perDay: 300 };

/** The user's own key. There is no app-wide key: AI is always bring-your-own. */
async function resolveKey(userId: string) {
  const [cred] = await db.select().from(aiCredentials).where(eq(aiCredentials.userId, userId));
  if (!cred) throw new AiError("KEY_REQUIRED", "Add a Gemini API key in settings to use AI features.");
  try { return open(cred); } catch { throw new AiError("INVALID_KEY", "Your saved key cannot be read. Remove it and add it again."); }
}

export async function hasKey(userId: string) {
  const [c] = await db.select({ last4: aiCredentials.last4 }).from(aiCredentials).where(eq(aiCredentials.userId, userId));
  return c ? { last4: c.last4 } : null;
}

async function checkLimit(userId: string) {
  const since = (ms: number) => db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, new Date(Date.now() - ms))));
  const [[h], [d]] = await Promise.all([since(3_600_000), since(86_400_000)]);
  if (h.n >= LIMITS.perHour) throw new AiError("LIMIT", `You have used ${LIMITS.perHour} AI requests in the last hour. Try again later.`);
  if (d.n >= LIMITS.perDay) throw new AiError("LIMIT", `You have used ${LIMITS.perDay} AI requests in the last day. Try again tomorrow.`);
}

async function log(row: typeof aiUsage.$inferInsert) {
  try { await db.insert(aiUsage).values(row); } catch { /* logging must never break the feature */ }
}

/** The one entry point for AI calls: key, limits, schema-checked output, usage log, safe errors. */
export async function generateStructured<S extends z.ZodType>(o: { userId: string; feature: AiFeature; schema: S; system: string; prompt: string }): Promise<z.infer<S>> {
  const apiKey = await resolveKey(o.userId);
  await checkLimit(o.userId);
  const model = BASIC.includes(o.feature) ? MODELS.basic : MODELS.smart;
  try {
    const r = await generateText({
      model: createGoogleGenerativeAI({ apiKey })(model),
      output: Output.object({ schema: o.schema }),
      system: o.system,
      prompt: o.prompt,
      maxRetries: 2,
    });
    await log({ userId: o.userId, feature: o.feature, model, ok: true, inputTokens: r.usage.inputTokens ?? null, outputTokens: r.usage.outputTokens ?? null });
    return r.output as z.infer<S>;
  } catch (e) {
    const err = toAiError(e);
    await log({ userId: o.userId, feature: o.feature, model, ok: false, error: err.code });
    throw err;
  }
}

/** A tiny call to prove a key works before it is stored. */
export async function testKey(apiKey: string) {
  try {
    await generateText({ model: createGoogleGenerativeAI({ apiKey })(MODELS.basic), prompt: "Reply with the single word OK.", maxOutputTokens: 8, maxRetries: 0 });
  } catch (e) { throw toAiError(e); }
}

export async function usageToday(userId: string) {
  const [r] = await db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, new Date(Date.now() - 86_400_000))));
  return r.n;
}
