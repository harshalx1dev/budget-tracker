import { addMonths, shiftDays } from "./dates";

export type RuleIn = {
  frequency: "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startOn: string;
  endOn: string | null;
  maxCount: number | null;
};

const CAP = 5000;

/** Dates of a rule inside [from, to]. Each date is computed from the start, never from the previous date. */
export function occurrences(rule: RuleIn, from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = 0; k < CAP; k++) {
    if (rule.maxCount !== null && k >= rule.maxCount) break;
    const d =
      rule.frequency === "weekly" ? shiftDays(rule.startOn, 7 * rule.intervalCount * k)
      : rule.frequency === "monthly" ? addMonths(rule.startOn, rule.intervalCount * k)
      : addMonths(rule.startOn, 12 * rule.intervalCount * k);
    if (d > to || (rule.endOn !== null && d > rule.endOn)) break;
    if (d >= from) out.push(d);
  }
  return out;
}
