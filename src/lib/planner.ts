import { addMonths } from "./dates";

/* ---- month helpers (YYYY-MM) ---- */
export const nextMonth = (ym: string) => addMonths(`${ym}-01`, 1).slice(0, 7);
export const monthEnd = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
export const monthsBetween = (fromYM: string, toYM: string) => (+toYM.slice(0, 4) - +fromYM.slice(0, 4)) * 12 + (+toYM.slice(5, 7) - +fromYM.slice(5, 7));

/**
 * What a category may spend in `month`: its limit, plus (with rollover) what earlier months since the budget began
 * left over or overspent. The carry never goes below zero.
 */
export function budgetAvailable(b: { limit: number; rollover: boolean; startMonth: string; month: string; spentByMonth: Record<string, number> }) {
  if (!b.rollover) return b.limit;
  let carry = 0;
  for (let m = b.startMonth; m < b.month; m = nextMonth(m)) carry += b.limit - (b.spentByMonth[m] ?? 0);
  return b.limit + Math.max(0, carry);
}

/* ---- forecast ---- */
export type ForecastMonth = { month: string; income: number; committed: number; variable: number };
export type ForecastRow = ForecastMonth & { start: number; end: number };

export function projectForecast(startBalance: number, months: ForecastMonth[]): ForecastRow[] {
  let bal = startBalance;
  return months.map((m) => {
    const start = bal;
    bal = start + m.income - m.committed - m.variable;
    return { ...m, start, end: bal };
  });
}

/** Budgeted categories use what is left of the budget; others use their recent average (scaled for a part-month). */
export function variableSpend(input: {
  budgeted: { limitAvailable: number; committed: number; spentSoFar: number }[];
  unbudgetedAvg: number;
  fractionLeft: number; // 1 for a future month, days left / days in month for the current one
}) {
  const budgeted = input.budgeted.reduce((s, b) => s + Math.max(0, b.limitAvailable - b.committed - b.spentSoFar), 0);
  return Math.round(budgeted + input.unbudgetedAvg * input.fractionLeft);
}

/* ---- safe to spend ---- */
export function computeSafeToSpend(i: { balance: number; dueOutflows: number; goalSetAside: number; buffer: number; days: number }) {
  const safe = i.balance - i.dueOutflows - i.goalSetAside - i.buffer;
  const days = Math.max(1, i.days);
  return { safe, perDay: safe > 0 ? Math.floor(safe / days) : 0, days };
}

/* ---- goals ---- */
export function goalProgress(g: { targetMinor: number; savedMinor: number; targetDate: string | null; today: string }) {
  const remaining = Math.max(0, g.targetMinor - g.savedMinor);
  if (remaining === 0) return { remaining, monthsLeft: 0, requiredMonthly: 0, status: "done" as const };
  if (!g.targetDate) return { remaining, monthsLeft: null, requiredMonthly: null, status: "open" as const };
  if (g.targetDate <= g.today) return { remaining, monthsLeft: 0, requiredMonthly: remaining, status: "overdue" as const };
  // Calendar months between now and the target month, at least one.
  const monthsLeft = Math.max(1, monthsBetween(g.today.slice(0, 7), g.targetDate.slice(0, 7)));
  return { remaining, monthsLeft, requiredMonthly: Math.ceil(remaining / monthsLeft), status: "on-track" as const };
}
