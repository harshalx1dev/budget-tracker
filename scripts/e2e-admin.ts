// Checks the admin approach against the real database and a running server, with invented accounts only.
// Run: npm run check:admin  (start the server first with ADMIN_EMAILS=hook-admin@budget.test npm run start)
import { eq, inArray } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { db, schema } from "@/server/db";
import { ensureAdmins } from "@/server/admin-bootstrap";
import { hasKey } from "@/server/ai/gateway";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const FIXTURES = ["admin-fixture@budget.test", "member-fixture@budget.test", "hook-admin@budget.test", "hook-member@budget.test", "hook-inject@budget.test"];
const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
const roleOf = async (email: string) => (await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.email, email)))[0]?.role;

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ name: "Fixture Person", email, password: "fixture-pass-123", ...extra }) });
  return r.status;
}
async function signInCookie(email: string) {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: "fixture-pass-123" }) });
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  await db.delete(schema.user).where(inArray(schema.user.email, FIXTURES));

  // bootstrap: promotes listed addresses, creates the first one with the password, then is a no-op
  await db.insert(schema.user).values({ id: "member-fixture-id", name: "Member", email: "member-fixture@budget.test" });
  await db.insert(schema.user).values({ id: "bystander-fixture-id", name: "Bystander", email: "hook-member@budget.test" });
  const env = { ADMIN_EMAILS: " Admin-Fixture@Budget.Test , member-fixture@budget.test", ADMIN_PASSWORD: "fixture-pass-123" };
  const r1 = await ensureAdmins(db, env);
  ok(r1.admin === "created" && r1.promoted === 1, "first run creates the admin and promotes the existing listed account");
  ok(await roleOf("admin-fixture@budget.test") === "admin" && await roleOf("member-fixture@budget.test") === "admin", "both listed accounts are admins (email matched case-insensitively)");
  ok(await roleOf("hook-member@budget.test") === "user", "an account that is not listed stays a normal user");
  const [adm] = await db.select().from(schema.user).where(eq(schema.user.email, "admin-fixture@budget.test"));
  const [cred] = await db.select().from(schema.account).where(eq(schema.account.userId, adm.id));
  ok(Boolean(cred?.password) && await verifyPassword({ hash: cred.password!, password: "fixture-pass-123" }) && cred.password !== "fixture-pass-123", "the password is stored hashed and verifies");
  const r2 = await ensureAdmins(db, env);
  ok(r2.admin === "unchanged" && r2.promoted === 0, "running again changes nothing");

  await db.insert(schema.session).values({ id: "fixture-session", userId: adm.id, token: "fixture-token-1", expiresAt: new Date(Date.now() + 3600_000) });
  const r3 = await ensureAdmins(db, { ...env, ADMIN_PASSWORD: "a-new-fixture-pass-456" });
  ok(r3.admin === "password-updated", "changing ADMIN_PASSWORD resets the admin's password");
  ok((await db.select().from(schema.session).where(eq(schema.session.userId, adm.id))).length === 0, "and signs the admin out everywhere");
  ok((await ensureAdmins(db, { ...env, ADMIN_PASSWORD: "short" })).admin === "skipped", "a password under 8 characters is refused");
  ok((await ensureAdmins(db, { ADMIN_EMAILS: "" })).admin === "skipped", "with no ADMIN_EMAILS nothing happens");

  // the app-wide Gemini key is for admins only
  process.env.ADMIN_GEMINI_API_KEY = "fixture-app-key-not-real";
  ok((await hasKey("member-fixture-id"))?.source === "admin", "an admin without their own key is offered the app key");
  ok(await hasKey("bystander-fixture-id") === null, "a normal user is never offered the app key");
  delete process.env.ADMIN_GEMINI_API_KEY;
  ok(await hasKey("member-fixture-id") === null, "without ADMIN_GEMINI_API_KEY nobody gets one");

  // sign-up hook and page guard against the running server (ADMIN_EMAILS=hook-admin@budget.test there)
  ok(await signUp("hook-admin@budget.test") === 200 && await roleOf("hook-admin@budget.test") === "admin", "signing up with a listed address makes an admin immediately");
  ok(await signUp("hook-inject@budget.test", { role: "admin" }) === 200 && await roleOf("hook-inject@budget.test") === "user", "a role sent with the sign-up form is ignored");

  const adminCookie = await signInCookie("hook-admin@budget.test");
  const userCookie = await signInCookie("hook-inject@budget.test");
  const adminPage = await (await fetch(`${BASE}/app/admin`, { headers: { cookie: adminCookie } })).text();
  const userPage = await (await fetch(`${BASE}/app/admin`, { headers: { cookie: userCookie } })).text();
  ok(/accounts and usage totals only/.test(adminPage) && /hook-inject@budget\.test/.test(adminPage), "an admin sees the admin page with the people list");
  ok(!/accounts and usage totals only/.test(userPage) && !/hook-inject@budget\.test/.test(userPage), "a normal user gets nothing from the admin page");
  ok((await fetch(`${BASE}/app/admin`, { redirect: "manual" })).status === 307, "signed out, the admin page sends you to sign in");

  await db.delete(schema.user).where(inArray(schema.user.email, FIXTURES));
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
