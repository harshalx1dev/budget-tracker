/**
 * Spreadsheet-safe CSV. Cells that start with = + - @ (or a tab or carriage return) would be run as formulas by
 * Excel or Sheets, and bank descriptions and notes are untrusted text, so such cells get a leading apostrophe.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: (string | number | null | undefined)[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
