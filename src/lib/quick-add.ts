import { makeISO, shiftDays } from "./dates";

export type QuickAccount = { id: string; name: string; aliases: string[] };
export type QuickResult = {
  amount: number | null; // major units (450.5), converted to minor by the caller using the account currency
  kind: "income" | "expense";
  accountId: string | null;
  date: string;
  text: string; // what is left once amount, date, account and kind words are removed
};

const INCOME_WORDS = new Set(["received", "salary", "income", "refund", "credited", "cashback"]);
const AMOUNT = /^(?:₹|rs\.?|inr)?(\d[\d,]*(?:\.\d+)?)(k|l|lakh)?$/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * "swiggy 450 upi yesterday" -> amount 450, account via alias, date yesterday, text "swiggy".
 * Pure: `today` is passed in (India-time ISO) so tests and the server agree.
 */
export function parseQuickAdd(input: string, accounts: QuickAccount[], today: string): QuickResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const r: QuickResult = { amount: null, kind: "expense", accountId: null, date: today, text: "" };
  const year = Number(today.slice(0, 4));

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const t = raw.toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    if (t.startsWith("+") && r.amount === null && AMOUNT.test(t.slice(1))) { r.kind = "income"; tokens[i] = raw.slice(1); i--; continue; }
    if (INCOME_WORDS.has(t)) { r.kind = "income"; out.push(raw); continue; }

    // "rs 450"
    if ((t === "rs" || t === "rs." || t === "inr" || t === "₹") && next && AMOUNT.test(next) && r.amount === null) {
      r.amount = toAmount(next); i++; continue;
    }
    const a = AMOUNT.exec(t);
    if (a && r.amount === null && !t.includes("/")) { r.amount = toAmount(t); continue; }

    if (t === "today") continue;
    if (t === "yesterday") { r.date = shiftDays(today, -1); continue; }
    if (/^\d+$/.test(t) && (next === "days" || next === "day") && tokens[i + 2]?.toLowerCase() === "ago") {
      r.date = shiftDays(today, -Number(t)); i += 2; continue;
    }
    const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(t);
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : year;
      const iso = makeISO(y, Number(dm[2]), Number(dm[1]));
      if (iso) { r.date = iso; continue; }
    }
    const mi = next ? MONTHS.indexOf(next.slice(0, 3)) : -1;
    if (/^\d{1,2}$/.test(t) && mi >= 0 && next!.length <= 9) {
      const iso = makeISO(year, mi + 1, Number(t));
      if (iso) { r.date = iso; i++; continue; }
    }

    if (r.accountId === null) {
      const hit = accounts.find((ac) => ac.aliases.some((x) => x.toLowerCase() === t)) ?? accounts.find((ac) => ac.name.toLowerCase().split(/\s+/).includes(t));
      if (hit) { r.accountId = hit.id; continue; }
    }
    out.push(raw);
  }
  r.text = out.join(" ");
  return r;
}

function toAmount(s: string) {
  const m = AMOUNT.exec(s.toLowerCase())!;
  const n = Number(m[1].replace(/,/g, ""));
  return m[2] === "k" ? n * 1000 : m[2] ? n * 100000 : n;
}
