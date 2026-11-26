import { createHash, randomBytes } from "node:crypto";

/**
 * Personal access tokens for the MCP endpoint. Pure rules, no database: format, hashing, reading a bearer header,
 * scopes and expiry. Only the SHA-256 hash is stored; the token is 256 random bits, so a fast hash is enough.
 */
export type McpScope = "read" | "write";

export const TOKEN_PREFIX = "bgt_";
const TOKEN_RE = /^bgt_[A-Za-z0-9_-]{43}$/;

export const MAX_ACTIVE_TOKENS = 5;
export const RATE_LIMIT_PER_MINUTE = 60;
export const EXPIRY_CHOICES = [30, 90, 365, 0] as const; // days; 0 = never
export const DEFAULT_EXPIRY_DAYS = 90;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function generateToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, prefix: token.slice(0, 8), hash: hashToken(token) };
}

/** The token from `Authorization: Bearer ...`, or null when absent or malformed. */
export function parseBearer(header: string | null | undefined) {
  const m = /^Bearer\s+(\S+)$/i.exec((header ?? "").trim());
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

export const hasScope = (scopes: string[], need: McpScope) => scopes.includes(need);

export function tokenState(row: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()) {
  if (row.revokedAt) return "revoked" as const;
  if (row.expiresAt && row.expiresAt <= now) return "expired" as const;
  return "active" as const;
}

export const expiryDate = (days: number, now = new Date()) => (days > 0 ? new Date(now.getTime() + days * 86_400_000) : null);
