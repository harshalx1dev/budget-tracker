// shortcut: dates are calendar days in India time until workspaces get their own timezone.
const TZ = "Asia/Kolkata";

export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const thisMonth = () => todayISO().slice(0, 7);

export function shiftDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `months` after `iso`, keeping the original day where the month has it, else the month's last day. */
export function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Builds YYYY-MM-DD, or null if the calendar day does not exist (e.g. 31 Feb). */
export function makeISO(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatDayYear(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
