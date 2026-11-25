import { makeISO } from "./dates";

export type Mapping = { date: number; narration: number; debit: number | null; credit: number | null; amount: number | null; drCr: number | null; ref: number | null };
export type StatementRow = { date: string; kind: "income" | "expense"; amount: number; narration: string; ref: string | null };

const has = (s: string, words: string[]) => words.some((w) => s.includes(w));
const clean = (s: unknown) => String(s ?? "").trim().toLowerCase();

const KEYS = {
  date: ["date", "txn date", "value dt", "tran date"],
  narration: ["narration", "description", "particulars", "remarks", "details", "transaction remarks"],
  debit: ["debit", "withdrawal", "dr amount", "withdrawals"],
  credit: ["credit", "deposit", "cr amount", "deposits"],
  amount: ["amount"],
  drCr: ["dr/cr", "cr/dr", "type"],
  ref: ["ref", "chq", "cheque", "utr", "reference"],
};

/** Statements often start with account details; find the row that looks like the table header. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = rows[i].map(clean);
    const date = cells.some((c) => has(c, KEYS.date));
    const narr = cells.some((c) => has(c, KEYS.narration));
    const money = cells.some((c) => has(c, [...KEYS.debit, ...KEYS.credit, ...KEYS.amount]));
    if (date && narr && money) return i;
  }
  return -1;
}

export function guessMapping(header: string[]): Mapping | null {
  const cells = header.map(clean);
  const find = (words: string[], skip: number[] = []) => {
    const i = cells.findIndex((c, idx) => !skip.includes(idx) && c && has(c, words));
    return i >= 0 ? i : null;
  };
  const date = find(KEYS.date);
  const narration = find(KEYS.narration);
  if (date === null || narration === null) return null;
  const debit = find(KEYS.debit);
  const credit = find(KEYS.credit);
  const amount = debit === null && credit === null ? find(KEYS.amount) : null;
  if (debit === null && credit === null && amount === null) return null;
  const drCr = amount !== null ? find(KEYS.drCr) : null;
  const ref = find(KEYS.ref, [narration]);
  return { date, narration, debit, credit, amount, drCr, ref };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Indian statements are day-first. Never routed through `new Date(string)`. */
export function parseDate(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return makeISO(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})/.exec(s);
  if (m) return makeISO(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[/\-. ]([a-z]{3})[a-z]*[/\-. ,]*(\d{2,4})/.exec(s);
  if (m && MONTHS.includes(m[2])) return makeISO(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  return null;
}

/** "1,234.50", "₹ 1,234.50 Dr" -> 1234.5 (sign dropped; direction comes from columns). */
export function parseAmount(input: string | undefined): number | null {
  if (!input) return null;
  const n = Number(input.replace(/[₹,\s]|rs\.?|inr|dr|cr/gi, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toStatementRows(rows: string[][], headerIdx: number, m: Mapping): StatementRow[] {
  const out: StatementRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[m.date] ?? "");
    if (!date) continue; // footers, totals, blank lines
    let kind: "income" | "expense" | null = null;
    let amount: number | null = null;
    if (m.amount !== null) {
      amount = parseAmount(r[m.amount]);
      const flag = clean(m.drCr !== null ? r[m.drCr] : r[m.amount]);
      kind = /\bcr\b|credit/.test(flag) ? "income" : /\bdr\b|debit/.test(flag) ? "expense" : null;
    } else {
      const d = m.debit !== null ? parseAmount(r[m.debit]) : null;
      const c = m.credit !== null ? parseAmount(r[m.credit]) : null;
      if (d) { amount = d; kind = "expense"; } else if (c) { amount = c; kind = "income"; }
    }
    if (!amount || !kind) continue;
    out.push({ date, kind, amount, narration: String(r[m.narration] ?? "").trim(), ref: m.ref !== null ? String(r[m.ref] ?? "").trim() || null : null });
  }
  return out;
}
