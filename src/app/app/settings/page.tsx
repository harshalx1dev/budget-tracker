import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { AiKeyForm } from "@/components/ai-bits";
import { RemindersCard } from "@/components/reminders-card";
import { McpTokenCard } from "@/components/mcp-token-card";
import { listTokens } from "@/server/mcp/tokens";
import { tokenState } from "@/lib/mcp-token";
import { hasKey, usageToday } from "@/server/ai/gateway";
import { requireWorkspace } from "@/server/session";

export const metadata = { title: "settings" };

async function SettingsLoader() {
  const { user, workspace } = await requireWorkspace();
  const [connected, used, tokens] = await Promise.all([hasKey(user.id), usageToday(user.id), listTokens(user.id)]);
  const endpoint = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/mcp`;
  return (
    <div className="settle stack">
      <h1>settings</h1>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>account</h2>
        <p>{user.name} <span className="label">{user.email}</span></p>
      </section>
      {user.role === "admin" && (
        <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
          <h2>admin</h2>
          <p><Link href="/app/admin" className="link">accounts and usage across the app</Link></p>
        </section>
      )}
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>ai</h2>
        <AiKeyForm connected={connected} usedToday={used} />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>connect an agent</h2>
        <McpTokenCard endpoint={endpoint} tokens={tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, write: t.scopes.includes("write"), state: tokenState(t), expiresAt: t.expiresAt?.toISOString() ?? null, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))} />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>bill reminders</h2>
        <RemindersCard />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>export your data</h2>
        <p className="label">Your data is yours. The CSV opens in any spreadsheet; the backup holds everything except passwords, keys and tokens.</p>
        <div className="inline-form">
          <a className="btn btn--secondary" href="/app/export/transactions" download>transactions as csv</a>
          <a className="btn btn--secondary" href="/app/export/backup" download>full backup as json</a>
        </div>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>categories and rules</h2>
        <p><Link href="/app/categories" className="link">manage categories and auto-categorise rules</Link></p>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>budget</h2>
        <p>{workspace.name} <span className="label">home currency {workspace.homeCurrency}</span></p>
      </section>
    </div>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsLoader />
    </Suspense>
  );
}
