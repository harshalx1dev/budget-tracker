import { addMonths, shiftDays } from "./dates";

/** Day `day` of a YYYY-MM month, or its last day when the month is shorter. */
const onDay = (ym: string, day: number) => {
  const last = shiftDays(addMonths(`${ym}-01`, 1), -1);
  const d = `${ym}-${String(day).padStart(2, "0")}`;
  return d > last ? last : d;
};
const move = (ym: string, n: number) => addMonths(`${ym}-01`, n).slice(0, 7);

/** The last bill made on or before today, when it must be paid, and when the next one is made. */
export function cardDates(statementDay: number, dueDay: number, today: string) {
  let ym = today.slice(0, 7);
  if (onDay(ym, statementDay) > today) ym = move(ym, -1);
  const statementOn = onDay(ym, statementDay);
  const dueOn = onDay(ym, dueDay) > statementOn ? onDay(ym, dueDay) : onDay(move(ym, 1), dueDay);
  return { statementOn, dueOn, nextStatementOn: onDay(move(ym, 1), statementDay) };
}

/**
 * What is still to pay on the last bill. Everything owed when it was made, less whatever has reached the card
 * since. Spending after the bill date belongs to the next one.
 */
export function cardBill(i: { statementDay: number; dueDay: number; today: string; openingBalanceMinor: number; rows: { on: string; kind: "income" | "expense"; amountMinor: number }[] }) {
  const dates = cardDates(i.statementDay, i.dueDay, i.today);
  let owed = -i.openingBalanceMinor, paid = 0, unbilled = 0;
  for (const r of i.rows) {
    if (r.on <= dates.statementOn) owed += r.kind === "expense" ? r.amountMinor : -r.amountMinor;
    else if (r.kind === "income") paid += r.amountMinor;
    else unbilled += r.amountMinor;
  }
  const toPay = Math.max(0, owed - paid);
  return { ...dates, billed: Math.max(0, owed), toPay, unbilled: Math.max(0, unbilled - Math.max(0, paid - Math.max(0, owed))), overdue: toPay > 0 && dates.dueOn < i.today };
}
