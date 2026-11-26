import "server-only";
import { eq, inArray } from "drizzle-orm";
import * as webpush from "web-push";
import { db, schema } from "@/server/db";
import { listExpected } from "@/server/services/commitments";
import { workspaceForUser } from "@/server/services/workspace";
import { buildDigest, type Digest } from "@/lib/reminders";
import { shiftDays, todayISO } from "@/lib/dates";

const { pushSent, pushSubscriptions, user } = schema;

export type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export type Sender = (sub: Sub, payload: string) => Promise<void>;

/** The real sender. A 404 or 410 from the push service means the subscription is gone. */
export const webPushSender: Sender = async (sub, payload) => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) throw new Error("Push is not configured on this server");
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 6 * 3600 });
};

const isGone = (e: unknown) => typeof e === "object" && e !== null && "statusCode" in e && [404, 410].includes((e as { statusCode: number }).statusCode);

export async function saveSubscription(userId: string, s: { endpoint: string; p256dh: string; auth: string }) {
  await db.insert(pushSubscriptions).values({ userId, ...s }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: s.p256dh, auth: s.auth } });
}

export const removeSubscription = (userId: string, endpoint: string) =>
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning({ id: pushSubscriptions.id }).then((r) => r.length && userId);

export const subscriptionCount = async (userId: string) => (await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).length;

async function deliver(subs: Sub[], digest: Digest, send: Sender) {
  let sent = 0;
  const gone: string[] = [];
  for (const sub of subs) {
    try { await send(sub, JSON.stringify(digest)); sent++; } catch (e) { if (isGone(e)) gone.push(sub.id); }
  }
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return sent;
}

/** A test notification to this user's own devices. */
export async function sendTest(userId: string, send: Sender = webPushSender) {
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) throw new Error("Turn reminders on for this device first");
  return deliver(subs, { title: "Budget", body: "Reminders are on for this device.", url: "/app/plan/commitments", tag: "test" }, send);
}

/**
 * The daily job: for every user with a subscribed device, one digest of unpaid payments due soon or recently missed.
 * A (user, day) row in push_sent makes a second run the same day send nothing.
 */
export async function sendReminders(send: Sender = webPushSender, today = todayISO()) {
  const subs = await db.select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth, name: user.name })
    .from(pushSubscriptions).innerJoin(user, eq(user.id, pushSubscriptions.userId));
  const byUser = new Map<string, { name: string; subs: Sub[] }>();
  for (const s of subs) byUser.set(s.userId, { name: s.name, subs: [...(byUser.get(s.userId)?.subs ?? []), s] });

  let users = 0, notifications = 0;
  for (const [userId, u] of byUser) {
    const ws = await workspaceForUser(userId, u.name);
    const items = await listExpected(ws.id, shiftDays(today, -7), shiftDays(today, 1));
    const digest = buildDigest(items, today, ws.homeCurrency);
    if (!digest) continue;
    const claimed = await db.insert(pushSent).values({ userId, reminderKey: "digest", day: today }).onConflictDoNothing().returning({ id: pushSent.id });
    if (!claimed.length) continue;
    users++;
    notifications += await deliver(u.subs, digest, send);
  }
  return { users, notifications };
}
