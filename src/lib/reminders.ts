import { formatMinor } from "./money";
import { daysBetween } from "./dates";

export type DueItem = { name: string; dueOn: string; amountMinor: number; kind: "income" | "expense"; status: "paid" | "overdue" | "upcoming" };
export type Digest = { title: string; body: string; url: string; tag: string };

const OVERDUE_DAYS = 7;

/**
 * One short notification a day: unpaid payments due today or tomorrow, and unpaid ones that slipped past in the last
 * week. Income and anything already paid is left out. Returns null when there is nothing worth interrupting for.
 */
export function buildDigest(items: DueItem[], today: string, currency: string): Digest | null {
  const rel = (it: DueItem) => daysBetween(today, it.dueOn);
  const open = items.filter((i) => i.kind === "expense" && i.status !== "paid");
  const late = open.filter((i) => rel(i) < 0 && rel(i) >= -OVERDUE_DAYS).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const soon = open.filter((i) => rel(i) >= 0 && rel(i) <= 1).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  if (!late.length && !soon.length) return null;

  const when = (i: DueItem) => (rel(i) === 0 ? "today" : rel(i) === 1 ? "tomorrow" : `${-rel(i)} day${rel(i) === -1 ? "" : "s"} late`);
  const parts = [...late, ...soon].slice(0, 4).map((i) => `${i.name.slice(0, 40)} ${formatMinor(i.amountMinor, currency)} ${when(i)}`);
  const more = late.length + soon.length - parts.length;
  const total = late.length + soon.length;
  return {
    title: late.length ? `${total} payment${total === 1 ? "" : "s"} need attention` : `${total} payment${total === 1 ? "" : "s"} due soon`,
    body: parts.join(", ") + (more > 0 ? `, and ${more} more` : ""),
    url: "/app/plan/commitments",
    tag: `digest-${today}`,
  };
}
