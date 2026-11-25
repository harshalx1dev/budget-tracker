"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { importAction } from "@/app/app/capture-actions";
import { findHeaderRow, guessMapping, toStatementRows, type Mapping, type StatementRow } from "@/lib/statement";
import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";

type Acct = { id: string; name: string; currency: string };
type Parsed = { filename: string; header: string[]; table: string[][]; headerIdx: number; mapping: Mapping | null };

const FIELDS: { key: keyof Mapping; label: string; optional?: boolean }[] = [
  { key: "date", label: "date" }, { key: "narration", label: "description" },
  { key: "debit", label: "debit (money out)", optional: true }, { key: "credit", label: "credit (money in)", optional: true },
  { key: "amount", label: "single amount", optional: true }, { key: "drCr", label: "dr/cr flag", optional: true }, { key: "ref", label: "reference", optional: true },
];

export function ImportForm({ accounts }: { accounts: Acct[] }) {
  const [p, setP] = useState<Parsed | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [msg, setMsg] = useState<{ error?: string; added?: number; merged?: number; duplicates?: number } | null>(null);
  const [busy, start] = useTransition();

  function onFile(file: File) {
    setMsg(null);
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const table = res.data;
        const headerIdx = findHeaderRow(table);
        if (headerIdx < 0) return setMsg({ error: "could not find the transaction table in that file; is it a CSV statement?" }), setP(null);
        setP({ filename: file.name, header: table[headerIdx], table, headerIdx, mapping: guessMapping(table[headerIdx]) });
      },
      error: () => setMsg({ error: "could not read that file" }),
    });
  }

  const rows: StatementRow[] = p?.mapping ? toStatementRows(p.table, p.headerIdx, p.mapping) : [];
  const setField = (k: keyof Mapping, v: string) => p && setP({ ...p, mapping: { ...(p.mapping ?? { date: 0, narration: 1, debit: null, credit: null, amount: null, drCr: null, ref: null }), [k]: v === "" ? null : Number(v) } });
  const acct = accounts.find((a) => a.id === accountId);

  return (
    <div className="stack">
      <div className="well tx-form">
        <label className="field"><span className="label">statement file (csv)</span><input type="file" accept=".csv,text/csv" className="input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
        <label className="field"><span className="label">import into</span>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</select>
        </label>
      </div>
      {msg?.error && <p role="alert" className="error">{msg.error}</p>}
      {msg?.added !== undefined && (
        <p role="status" className="well" style={{ padding: "var(--space-lg)" }}>
          added {msg.added} new{msg.merged ? `, matched ${msg.merged} to entries you had already added` : ""}, skipped {msg.duplicates} already imported. <Link href="/app/inbox" className="link">review the inbox</Link>
        </p>
      )}
      {p && (
        <section className="well stack-sm" style={{ padding: "var(--space-lg)" }} aria-label="column mapping and preview">
          <h2>check the columns</h2>
          <div className="tx-form" style={{ padding: 0 }}>
            {FIELDS.map((f) => (
              <label key={f.key} className="field"><span className="label">{f.label}</span>
                <select className="input" value={p.mapping?.[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)}>
                  {f.optional && <option value="">not used</option>}
                  {p.header.map((h, i) => <option key={i} value={i}>{h || `column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="label">{rows.length} transactions found{rows.length ? `, ${formatDay(rows[rows.length - 1].date)} to ${formatDay(rows[0].date)}` : ""}</p>
          <div className="table-wrap">
            <table className="ledger">
              <thead><tr><th>date</th><th>description</th><th className="num">amount</th></tr></thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={i}><td>{formatDay(r.date)}</td><td>{r.narration.slice(0, 80)}</td><td className="num amt" data-kind={r.kind}>{formatMinor(Math.round(r.amount * 100) * (r.kind === "income" ? 1 : -1), acct?.currency ?? "INR", { sign: true })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tx-form__end">
            <button className="btn btn--primary" disabled={busy || !rows.length || !accountId}
              onClick={() => start(async () => setMsg(await importAction(accountId, p.filename, rows)))}>
              <Upload size={16} aria-hidden /> {busy ? "importing" : `import ${rows.length} rows`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
