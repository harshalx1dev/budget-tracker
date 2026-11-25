// Heuristic reader for bank narrations. Banks format UPI lines differently, so this extracts
// what is common (a 12-digit reference, a VPA, a readable name/remark) and keeps the raw text.
export type Narration = { payee: string; vpa: string | null; ref: string | null; isUpi: boolean };

const VPA = /[a-z0-9._]+@[a-z][a-z0-9]+/i;
const REF = /\b\d{12}\b/;
const NOISE = new Set(["upi", "dr", "cr", "to", "from", "transfer", "payment", "pay", "imps", "neft", "rtgs", "pos", "ach", "by", "ref", "no", "txn", "sent", "using", "paytm", "okaxis", "okhdfcbank", "oksbi", "ybl"]);

export function readNarration(raw: string): Narration {
  const text = raw.replace(/\s+/g, " ").trim();
  const vpa = VPA.exec(text)?.[0] ?? null;
  const ref = REF.exec(text)?.[0] ?? null;
  const isUpi = /\bupi\b/i.test(text) || vpa !== null;

  // Prefer a readable segment between separators that is not a ref, VPA or bank code.
  const parts = text.split(/[\/\-|:]/).map((p) => p.trim()).filter(Boolean);
  const readable = parts.find((p) => {
    const lower = p.toLowerCase();
    return /[a-z]{3,}/i.test(p) && !REF.test(p) && !VPA.test(p) && !NOISE.has(lower) && !/^[A-Z]{4}\d/.test(p);
  });
  const payee = (readable ?? vpa?.split("@")[0] ?? text).slice(0, 60);
  return { payee: payee.replace(/\s+/g, " ").trim(), vpa, ref, isUpi };
}

export const normalizePayee = (s: string) => s.toLowerCase().replace(/[^a-z0-9@ ]+/g, " ").replace(/\s+/g, " ").trim();
