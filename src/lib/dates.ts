// shortcut: dates are calendar days in India time until workspaces get their own timezone.
const TZ = "Asia/Kolkata";

export const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export const thisMonth = () => todayISO().slice(0, 7);

export function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).toLowerCase();
}
