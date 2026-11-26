import { getCurrentUser } from "@/server/session";
import { workspaceForUser } from "@/server/services/workspace";
import { fullBackup } from "@/server/services/export";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("sign in first", { status: 401 });
  const ws = await workspaceForUser(user.id, user.name);
  return new Response(JSON.stringify(await fullBackup(ws.id), null, 1), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="budget-backup.json"', "cache-control": "no-store" },
  });
}
