import { normalizePayee } from "./narration";

export type Rule = { pattern: string; categoryId: string };

/** First rule whose pattern appears in the text wins; longer (more specific) patterns go first. */
export function matchRule(rules: Rule[], ...texts: (string | null | undefined)[]): string | null {
  const hay = normalizePayee(texts.filter(Boolean).join(" "));
  if (!hay) return null;
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  return sorted.find((r) => hay.includes(r.pattern))?.categoryId ?? null;
}
