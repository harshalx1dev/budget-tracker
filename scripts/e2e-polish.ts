// Service-level check of Phase 7 against the real database, using invented data only: idempotent offline sync,
// export safety, reports, and the reminder job with a fake push sender (no push service is contacted).
// Run: npm run check:polish. It deletes data, so it only touches the dedicated test account's workspace.
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { quickAdd } from "@/server/services/capture";
import { createRule } from "@/server/services/commitments";
import { fullBackup, transactionsCsv } from "@/server/services/export";
import { monthlyTotals, spendingByCategory } from "@/server/services/reports";
import { sendReminders, type Sender } from "@/server/services/push";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId, userId: schema.user.id }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const { workspaceId: ws, userId } = m;
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets]) await db.delete(t).where(eq(t.workspaceId, ws));
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  await db.delete(schema.pushSent).where(eq(schema.pushSent.userId, userId));
  const today = todayISO();

  // offline sync: the same key adds once; the day typed, not the day synced, anchors "yesterday"
  const ref = "11111111-1111-4111-8111-111111111111";
  const typedOn = shiftDays(today, -3);
  const a = await quickAdd(ws, "INR", "chai 20 cash yesterday", undefined, { clientRef: ref, asOf: typedOn });
  const b = await quickAdd(ws, "INR", "chai 20 cash yesterday", undefined, { clientRef: ref, asOf: typedOn });
  const rows = await db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, ws));
  ok(!a.duplicate && b.duplicate && rows.length === 1, "syncing the same queued entry twice adds it once");
  ok(rows[0].occurredOn === shiftDays(typedOn, -1), "a late sync keeps the day it was typed (yesterday relative to then)");

  // export safety
  const [acct] = await db.select().from(schema.accounts).where(eq(schema.accounts.workspaceId, ws));
  await db.insert(schema.transactions).values({ workspaceId: ws, accountId: acct.id, kind: "expense", amountMinor: 12345, currency: "INR", payee: "=HYPERLINK(\"http://evil.example\",\"x\")", note: "a, \"quoted\" note", occurredOn: today });
  const csv = await transactionsCsv(ws, {});
  ok(csv.split("\r\n")[0].startsWith("date,type,amount"), "the CSV has a header row");
  ok(!/(^|,)=HYPERLINK/m.test(csv) && csv.includes("'=HYPERLINK"), "a formula-looking payee is neutralised in the CSV");
  ok(csv.includes('"a, ""quoted"" note"'), "commas and quotes are escaped");
  ok(/123\.45/.test(csv), "amounts are exported in major units");
  const backup = JSON.stringify(await fullBackup(ws));
  ok(!/"(tokenHash|token_hash|ciphertext|authTag|auth_tag|password|accessToken|refreshToken)"\s*:/i.test(backup), "the backup holds no secret fields");
  ok(JSON.parse(backup).transactions.length === 2, "the backup carries the transactions");

  // reports
  const tot = await monthlyTotals(ws, "INR", today.slice(0, 7), 6);
  ok(tot.length === 6 && tot.at(-1)!.month === today.slice(0, 7), "six months of totals ending this month");
  ok(tot.reduce((s, r) => s + r.expense, 0) === 2000 + 12345, "spending totals add up");
  const cats = await spendingByCategory(ws, "INR", today.slice(0, 7));
  ok(cats.reduce((s, c) => s + c.total, 0) === tot.at(-1)!.expense, "category totals match the month");

  // reminders with a fake sender
  await db.insert(schema.pushSubscriptions).values({ userId, endpoint: "https://push.example/fixture-1", p256dh: "p256dh-fixture-key", auth: "auth-fixture" });
  await createRule(ws, { name: "Gym", kind: "expense", amountMinor: 80000, frequency: "monthly", intervalCount: 1, startOn: today, endOn: null, maxCount: null, matchPattern: null, accountId: null, categoryId: null, anchor: "start_day", weekendShift: "none" });
  const sent: string[] = [];
  const good: Sender = async (_s, payload) => { sent.push(payload); };
  const r1 = await sendReminders(good, today);
  ok(r1.notifications === 1 && /Gym/.test(sent[0]) && /today/.test(sent[0]), "a payment due today sends one reminder naming it");
  const r2 = await sendReminders(good, today);
  ok(r2.notifications === 0 && sent.length === 1, "running the job again the same day sends nothing");
  const r3 = await sendReminders(good, shiftDays(today, 10));
  ok(r3.notifications === 0, "a day with nothing due sends nothing");

  await db.delete(schema.pushSent).where(eq(schema.pushSent.userId, userId));
  const gone: Sender = async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); };
  await sendReminders(gone, today);
  ok((await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId))).length === 0, "a subscription the push service reports gone is removed");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
