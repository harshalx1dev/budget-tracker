// AI may explain figures but never produce them. Every sizeable number in its text must already be in the facts
// it was given; otherwise the text is dropped. Years and small numbers (counts, percents) are not checked.
const NUM = /\d[\d,]*(?:\.\d+)?/g;

const values = (s: string) => {
  const out = new Set<number>();
  for (const m of s.match(NUM) ?? []) {
    const n = Number(m.replace(/,/g, ""));
    if (Number.isFinite(n)) out.add(Math.round(n * 100) / 100);
  }
  return out;
};

export function ungroundedNumbers(text: string, facts: string): number[] {
  const known = values(facts);
  const bad: number[] = [];
  for (const n of values(text)) {
    if (n < 1000 || (n >= 1900 && n <= 2100 && Number.isInteger(n))) continue;
    // "₹6.5L" style rounding is not allowed either: figures must be quoted as given.
    if (!known.has(n)) bad.push(n);
  }
  return bad;
}

/** Strip the markup a model might add and keep plain text only; React escapes the rest. */
export const plain = (s: string) => s.replace(/[*_`#>]/g, "").replace(/\n{3,}/g, "\n\n").trim();
