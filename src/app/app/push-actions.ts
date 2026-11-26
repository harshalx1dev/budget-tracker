"use server";

import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { removeSubscription, saveSubscription, sendTest } from "@/server/services/push";

export type PushState = { error?: string; message?: string };

const sub = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "push endpoints are https"),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(8).max(100),
});

export async function saveSubscriptionAction(raw: unknown): Promise<PushState> {
  const { user } = await requireWorkspace();
  const p = sub.safeParse(raw);
  if (!p.success) return { error: "That device could not be registered." };
  await saveSubscription(user.id, p.data);
  return { message: "Reminders are on for this device." };
}

export async function removeSubscriptionAction(endpoint: string): Promise<PushState> {
  const { user } = await requireWorkspace();
  await removeSubscription(user.id, String(endpoint).slice(0, 1000));
  return { message: "Reminders are off for this device." };
}

export async function sendTestAction(): Promise<PushState> {
  const { user } = await requireWorkspace();
  try { const n = await sendTest(user.id); return { message: n ? "Sent. It should appear in a moment." : "No device accepted it. Turn reminders off and on again." }; }
  catch (e) { return { error: e instanceof Error ? e.message : "Could not send" }; }
}
