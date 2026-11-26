import { getCurrentUser } from "@/server/session";
import { workspaceForUser } from "@/server/services/workspace";
import { transactionsCsv } from "@/server/services/export";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("sign in first", { status: 401 });
  const ws = await workspaceForUser(user.id, user.name);
  const p = new URL(request.url).searchParams;
  const from = p.get("from") ?? undefined, to = p.get("to") ?? undefined;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return new Response("dates must be YYYY-MM-DD", { status: 400 });
  const csv = await transactionsCsv(ws.id, { from, to });
  return new Response(`﻿${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="transactions.csv"', "cache-control": "no-store" } });
}
