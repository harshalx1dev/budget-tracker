export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"] as const;

const locale = (cur: string) => (cur === "INR" ? "en-IN" : "en-US");

export function exponent(cur: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency: cur }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "450.5" -> 45050 (minor units). Returns null for anything that is not a positive amount. */
export function toMinor(input: string, cur: string): number | null {
  const n = Number(input.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10 ** exponent(cur));
}

export function formatMinor(minor: number, cur: string, opts: { sign?: boolean } = {}) {
  const e = exponent(cur);
  const s = new Intl.NumberFormat(locale(cur), { style: "currency", currency: cur, minimumFractionDigits: e, maximumFractionDigits: e }).format(Math.abs(minor) / 10 ** e);
  return minor < 0 ? `-${s}` : opts.sign && minor > 0 ? `+${s}` : s;
}
