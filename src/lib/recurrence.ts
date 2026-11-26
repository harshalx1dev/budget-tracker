import { addMonths, shiftDays } from "./dates";

export type RuleIn = {
  frequency: "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startOn: string;
  endOn: string | null;
  maxCount: number | null;
  /** monthly only: "month_end" lands on the last day of each month (30th, 31st, 28th...). */
  anchor?: "start_day" | "month_end";
  /** Paydays: "sunday_back" moves a Sunday to Saturday; "weekend_back" moves Saturday and Sunday to Friday. */
  weekendShift?: "none" | "sunday_back" | "weekend_back";
};

const CAP = 5000;

const lastDayOf = (iso: string) => shiftDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday

function shifted(iso: string, mode: RuleIn["weekendShift"]) {
  if (mode === "sunday_back") return weekday(iso) === 0 ? shiftDays(iso, -1) : iso;
  if (mode === "weekend_back") return weekday(iso) === 6 ? shiftDays(iso, -1) : weekday(iso) === 0 ? shiftDays(iso, -2) : iso;
  return iso;
}

/** Dates of a rule inside [from, to]. Each date is computed from the start, never from the previous date. */
export function occurrences(rule: RuleIn, from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = 0; k < CAP; k++) {
    if (rule.maxCount !== null && k >= rule.maxCount) break;
    let base =
      rule.frequency === "weekly" ? shiftDays(rule.startOn, 7 * rule.intervalCount * k)
      : rule.frequency === "monthly" ? addMonths(rule.startOn, rule.intervalCount * k)
      : addMonths(rule.startOn, 12 * rule.intervalCount * k);
    if (rule.frequency === "monthly" && rule.anchor === "month_end") base = lastDayOf(base);
    const d = shifted(base, rule.weekendShift);
    // A shift moves a date back at most two days, so stop only once the unshifted date is clearly past the window.
    if (base > shiftDays(to, 3) || (rule.endOn !== null && d > rule.endOn)) break;
    if (d > to) continue;
    if (d >= from) out.push(d);
  }
  return out;
}
