import { Suspense } from "react";
import { AutoEmiForm } from "@/components/auto-emi-form";
import { InstallCard } from "@/components/install-app";
import { getAutoEmi } from "@/server/services/wishlist";
import { BellRing, CalendarClock, Download, Plug, ShieldCheck, Smartphone, Sparkles, Tags, User, Wallet } from "lucide-react";
import { SectionHead } from "@/components/section-head";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { AiKeyForm } from "@/components/ai-bits";
import { RemindersCard } from "@/components/reminders-card";
import { McpTokenCard } from "@/components/mcp-token-card";
import { listTokens } from "@/server/mcp/tokens";
import { tokenState } from "@/lib/mcp-token";
import { hasKey, usageToday } from "@/server/ai/gateway";
import { requireWorkspace } from "@/server/session";

export const metadata = { title: "Settings" };

async function SettingsLoader() {
  const { user, workspace } = await requireWorkspace();
  const [connected, used, tokens, emi] = await Promise.all([hasKey(user.id), usageToday(user.id), listTokens(user.id), getAutoEmi(workspace.id)]);
  const endpoint = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/mcp`;
  return (
    <div className="settle stack">
      <h1>Settings</h1>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={User}>Account</SectionHead>
        <p>{user.name} <span className="label">{user.email}</span></p>
      </section>
      {user.role === "admin" && (
        <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
          <SectionHead icon={ShieldCheck}>Admin</SectionHead>
          <p><Link href="/app/admin" className="link">Accounts and usage across the app</Link></p>
        </section>
      )}
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Smartphone}>Install the app</SectionHead>
        <InstallCard />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={CalendarClock}>EMI for big purchases</SectionHead>
        <AutoEmiForm key={JSON.stringify(emi)} on={emi.on} over={String(emi.overMinor / 100)} months={emi.months} rate={String(emi.ratePct)} />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Sparkles}>AI</SectionHead>
        <AiKeyForm connected={connected} usedToday={used} />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Plug}>Connect an agent</SectionHead>
        <McpTokenCard endpoint={endpoint} tokens={tokens.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, write: t.scopes.includes("write"), state: tokenState(t), expiresAt: t.expiresAt?.toISOString() ?? null, lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))} />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={BellRing}>Bill reminders</SectionHead>
        <RemindersCard />
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Download}>Export your data</SectionHead>
        <p className="label">Your data is yours. The CSV opens in any spreadsheet; the backup holds everything except passwords, keys and tokens.</p>
        <div className="inline-form">
          <a className="btn btn--secondary" href="/app/export/transactions" download>Transactions as CSV</a>
          <a className="btn btn--secondary" href="/app/export/backup" download>Full backup as json</a>
        </div>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Tags}>Categories and rules</SectionHead>
        <p><Link href="/app/categories" className="link">Manage categories and auto-categorise rules</Link></p>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <SectionHead icon={Wallet}>Budget</SectionHead>
        <p>{workspace.name} <span className="label">Home currency {workspace.homeCurrency}</span></p>
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
