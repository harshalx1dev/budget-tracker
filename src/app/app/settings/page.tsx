import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { requireWorkspace } from "@/server/session";

export const metadata = { title: "settings" };

async function SettingsLoader() {
  const { user, workspace } = await requireWorkspace();
  return (
    <div className="settle stack">
      <h1>settings</h1>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>account</h2>
        <p>{user.name} <span className="label">{user.email}</span></p>
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
