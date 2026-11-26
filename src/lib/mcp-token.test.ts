import { test } from "node:test";
import assert from "node:assert/strict";
import { expiryDate, generateToken, hasScope, hashToken, parseBearer, tokenState } from "./mcp-token";

test("tokens: random, prefixed, and only the hash is derivable", () => {
  const a = generateToken(), b = generateToken();
  assert.match(a.token, /^bgt_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.ok(!a.hash.includes(a.token.slice(4, 20)));
  assert.equal(a.prefix, a.token.slice(0, 8));
});

test("bearer: accepts a well-formed token only", () => {
  const { token } = generateToken();
  assert.equal(parseBearer(`Bearer ${token}`), token);
  assert.equal(parseBearer(`bearer ${token}`), token);
  assert.equal(parseBearer(token), null);
  assert.equal(parseBearer("Bearer short"), null);
  assert.equal(parseBearer(`Bearer ${token}x`), null);
  assert.equal(parseBearer(null), null);
  assert.equal(parseBearer(`Basic ${token}`), null);
});

test("scopes and state: read is not write; revoked and expired are not active", () => {
  assert.equal(hasScope(["read"], "write"), false);
  assert.equal(hasScope(["read", "write"], "write"), true);
  const now = new Date("2026-12-01T00:00:00Z");
  assert.equal(tokenState({ revokedAt: null, expiresAt: null }, now), "active");
  assert.equal(tokenState({ revokedAt: now, expiresAt: null }, now), "revoked");
  assert.equal(tokenState({ revokedAt: null, expiresAt: new Date("2026-11-30T00:00:00Z") }, now), "expired");
  assert.equal(expiryDate(0, now), null);
  assert.equal(expiryDate(30, now)!.toISOString(), "2026-12-31T00:00:00.000Z");
});

import { adminEmails, isAdminEmail } from "../server/admin-bootstrap";

test("admin emails: trimmed, lower-cased, blanks dropped", () => {
  assert.deepEqual(adminEmails(" A@x.com , ,b@Y.com "), ["a@x.com", "b@y.com"]);
  assert.deepEqual(adminEmails(undefined), []);
  assert.equal(isAdminEmail("B@y.COM", "a@x.com,b@y.com"), true);
  assert.equal(isAdminEmail("c@y.com", "a@x.com,b@y.com"), false);
  assert.equal(isAdminEmail("anyone@x.com", ""), false);
});
