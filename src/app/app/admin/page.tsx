import { Suspense } from "react";
import { Activity, Plug, Sparkles, Users } from "lucide-react";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { PageSkeleton } from "@/components/page-skeleton";
import { db, schema } from "@/server/db";
import { requireAdmin } from "@/server/session";
import { formatDayYear } from "@/lib/dates";

export const metadata = { title: "Admin" };

const { aiUsage, mcpCalls, mcpTokens, pushSubscriptions, session, transactions, user, workspaces } = schema;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

// Admins see accounts and usage totals, never anyone's ledger: nothing below reads a transaction's contents.
async function AdminLoader() {
  await requireAdmin();
  const week = ago(7);
  const lastSeen = sql<Date | null>`max(${session.updatedAt})`;
  const [[users], [fresh], [spaces], [entries], [active], [devices], ai, mcp, people] = await Promise.all([
    db.select({ n: count() }).from(user),
    db.select({ n: count() }).from(user).where(gte(user.createdAt, week)),
    db.select({ n: count() }).from(workspaces),
    db.select({ n: count() }).from(transactions),
    db.select({ n: sql<number>`count(distinct ${session.userId})::int` }).from(session).where(gte(session.updatedAt, week)),
    db.select({ n: count() }).from(pushSubscriptions),
    db.select({
      feature: aiUsage.feature, calls: count(),
      failed: sql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
      onAppKey: sql<number>`count(*) filter (where ${aiUsage.keySource} = 'admin')::int`,
      tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int + coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    }).from(aiUsage).where(gte(aiUsage.createdAt, week)).groupBy(aiUsage.feature).orderBy(desc(count())),
    db.select({ tool: mcpCalls.tool, calls: count(), failed: sql<number>`count(*) filter (where not ${mcpCalls.ok})::int` }).from(mcpCalls).where(gte(mcpCalls.createdAt, week)).groupBy(mcpCalls.tool).orderBy(desc(count())),
    db.select({ id: user.id, name: user.name, email: user.email, role: user.role, joined: user.createdAt, seen: lastSeen })
      .from(user).leftJoin(session, eq(session.userId, user.id)).groupBy(user.id).orderBy(desc(user.createdAt)).limit(200),
  ]);
  const [tokens] = await db.select({ n: count() }).from(mcpTokens).where(sql`${mcpTokens.revokedAt} is null and (${mcpTokens.expiresAt} is null or ${mcpTokens.expiresAt} > now())`);

  const stats: [string, number][] = [["people", users.n], ["new this week", fresh.n], ["active this week", active.n], ["workspaces", spaces.n], ["entries in total", entries.n], ["reminder devices", devices.n], ["agent tokens", tokens.n]];

  return (
    <div className="settle stack">
      <h1>Admin</h1>
      <p className="label">You see accounts and usage totals only, never anyone&apos;s entries.</p>

      <section className="stats" aria-label="Totals">
        {stats.map(([label, value], i) => { const Icon = [Users, Activity, Sparkles, Plug][i % 4]; return <div key={label} className="stat well"><div className="stat__top"><p className="label">{label}</p><span className="stat__icon"><Icon size={18} aria-hidden /></span></div><p className="figure">{value}</p></div>; })}
      </section>

      <section className="stack-sm" aria-labelledby="ai-h">
        <h2 id="ai-h">AI use, last 7 days</h2>
        {ai.length === 0 ? <div className="well empty"><h3>No AI calls yet</h3><p>Calls show here by feature once people use them.</p></div> : (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Feature</th><th className="num">Calls</th><th className="num">Failed</th><th className="num">On the app key</th><th className="num">Tokens</th></tr></thead>
              <tbody>{ai.map((a) => <tr key={a.feature}><td>{a.feature.replace(/_/g, " ")}</td><td className="num">{a.calls}</td><td className="num">{a.failed}</td><td className="num">{a.onAppKey}</td><td className="num">{a.tokens.toLocaleString("en-IN")}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="mcp-h">
        <h2 id="mcp-h">Agent calls, last 7 days</h2>
        {mcp.length === 0 ? <div className="well empty"><h3>No agent calls yet</h3><p>Calls to the MCP endpoint show here by tool.</p></div> : (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Tool</th><th className="num">Calls</th><th className="num">Failed</th></tr></thead>
              <tbody>{mcp.map((m) => <tr key={m.tool}><td>{m.tool.replace(/_/g, " ")}</td><td className="num">{m.calls}</td><td className="num">{m.failed}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack-sm" aria-labelledby="people-h">
        <h2 id="people-h">People</h2>
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Last seen</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}><td>{p.name}</td><td>{p.email}</td><td className="cap">{p.role}</td><td>{formatDayYear(p.joined.toISOString().slice(0, 10))}</td><td>{p.seen ? formatDayYear(new Date(p.seen).toISOString().slice(0, 10)) : "Never"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function Admin() {
  return <Suspense fallback={<PageSkeleton />}><AdminLoader /></Suspense>;
}
