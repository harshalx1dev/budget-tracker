import { timingSafeEqual } from "node:crypto";
import { sendReminders } from "@/server/services/push";

export const maxDuration = 60;

function authorised(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7)), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called once a day by the scheduler (see vercel.json), which sends the CRON_SECRET as a bearer token. */
export async function GET(request: Request) {
  if (!authorised(request.headers.get("authorization"))) return new Response("unauthorized", { status: 401 });
  try {
    return Response.json(await sendReminders());
  } catch (e) {
    console.error("reminders failed", e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
