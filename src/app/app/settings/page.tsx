import { requireWorkspace } from "@/server/session";

export const metadata = { title: "settings" };

export default async function Settings() {
  const { user, workspace } = await requireWorkspace();
  return (
    <div className="settle stack">
      <h1>settings</h1>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>account</h2>
        <p>{user.name} <span className="label">{user.email}</span></p>
      </section>
      <section className="well stack-sm" style={{ padding: "var(--space-lg)" }}>
        <h2>budget</h2>
        <p>{workspace.name} <span className="label">home currency {workspace.homeCurrency}</span></p>
      </section>
    </div>
  );
}
