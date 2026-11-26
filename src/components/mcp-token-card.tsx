"use client";

import { useActionState, useState, useTransition } from "react";
import { Copy } from "lucide-react";
import { createTokenAction, revokeTokenAction, type TokenState } from "@/app/app/mcp-actions";
import { formatDayYear } from "@/lib/dates";

export type TokenRow = { id: string; name: string; prefix: string; write: boolean; state: "active" | "revoked" | "expired"; expiresAt: string | null; lastUsedAt: string | null };

export function McpTokenCard({ endpoint, tokens }: { endpoint: string; tokens: TokenRow[] }) {
  const [s, action, pending] = useActionState<TokenState, FormData>(createTokenAction, {});
  const [revoking, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const cmd = s.token ? `claude mcp add --transport http budget ${endpoint} --header "Authorization: Bearer ${s.token}"` : "";

  return (
    <div className="stack-sm">
      <p className="label">Connect your own AI agent (Claude, or any MCP client). It can read your budget, and with write access, add entries. Nothing is ever edited or deleted through it.</p>
      <p className="label">Endpoint: <code className="code">{endpoint}</code></p>

      <form action={action} className="inline-form" aria-busy={pending}>
        <label className="visually-hidden" htmlFor="tname">token name</label>
        <input id="tname" name="name" required maxLength={60} placeholder="my agent" className="input input--sm" />
        <label className="visually-hidden" htmlFor="tdays">lifetime</label>
        <select id="tdays" name="days" className="input input--sm" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">never expires</option></select>
        <label className="check"><input type="checkbox" name="write" /> allow adding entries</label>
        <button className="btn btn--primary" disabled={pending}>create token</button>
        {s.error && <p className="error" role="alert">{s.error}</p>}
      </form>

      {s.token && (
        <div className="well stack-sm" style={{ padding: "var(--space-md)" }} role="status">
          <p>Copy this now. It is shown once and cannot be recovered.</p>
          <code className="code code--block">{s.token}</code>
          <p className="label">Claude Code:</p>
          <code className="code code--block">{cmd}</code>
          <button type="button" className="btn btn--secondary" style={{ justifySelf: "start" }} onClick={async () => { await navigator.clipboard.writeText(s.token!); setCopied(true); }}><Copy size={16} aria-hidden /> {copied ? "copied" : "copy token"}</button>
        </div>
      )}

      {tokens.length > 0 && (
        <div className="table-wrap">
          <table className="ledger">
            <thead><tr><th>name</th><th>access</th><th>last used</th><th>expires</th><th><span className="visually-hidden">revoke</span></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name} <span className="label">{t.prefix}…</span></td>
                  <td>{t.write ? "read and add" : "read only"}</td>
                  <td>{t.lastUsedAt ? formatDayYear(t.lastUsedAt.slice(0, 10)) : "never"}</td>
                  <td>{t.state !== "active" ? t.state : t.expiresAt ? formatDayYear(t.expiresAt.slice(0, 10)) : "never"}</td>
                  <td>{t.state === "active" ? <button type="button" className="pill pill--outline" disabled={revoking} onClick={() => start(() => revokeTokenAction(t.id))}>revoke</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
