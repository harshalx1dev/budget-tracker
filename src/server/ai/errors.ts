import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

export type AiErrorCode = "KEY_REQUIRED" | "LIMIT" | "INVALID_KEY" | "PROVIDER_LIMIT" | "BAD_OUTPUT" | "UNGROUNDED" | "FAILED";

/** An AI failure with a message that is safe to show. Never carries the key or the prompt. */
export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
  }
}

export function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  const inner = RetryError.isInstance(err) ? err.lastError : err;
  if (NoObjectGeneratedError.isInstance(inner)) return new AiError("BAD_OUTPUT", "The AI's answer was not in the expected format. Try again.");
  if (APICallError.isInstance(inner)) {
    const status = inner.statusCode ?? 0;
    const body = `${inner.message} ${inner.responseBody ?? ""}`.toLowerCase();
    if (status === 401 || status === 403 || (status === 400 && /api[_ ]?key/.test(body))) return new AiError("INVALID_KEY", "Gemini rejected this API key. Check it in settings.");
    if (status === 429 || /quota|rate/.test(body)) return new AiError("PROVIDER_LIMIT", "Your Gemini key has hit its limit for now. Try again later.");
    return new AiError("FAILED", "Gemini could not complete that request. Try again.");
  }
  return new AiError("FAILED", "The AI request failed. Try again.");
}
