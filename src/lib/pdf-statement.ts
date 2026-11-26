// Turns positioned PDF text into the same table shape a CSV gives, so the existing column mapper and
// importer are reused. Pure: the PDF library only supplies { x, y, w, str } items per page.
export type PdfItem = { x: number; y: number; w: number; str: string };

type Col = { name: string; left: number; right: number; numeric: boolean };

const DATE = /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/;
const MONEY = /^-?[\d,]+\.\d{2}$/;
const LINE_TOLERANCE = 2.5;
const WRAP_GAP = 16;
const TEXT_SLOP = 8; // body text starts a few points left of its header

/** Group items into visual lines, top to bottom, each sorted left to right. */
function toLines(items: PdfItem[]): { y: number; items: PdfItem[] }[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfItem[] }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= LINE_TOLERANCE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Merge header fragments that sit close together ("Withdrawal" + "(Dr.)") into one column header. */
function headerColumns(items: PdfItem[]): Col[] {
  const cols: Col[] = [];
  for (const it of items) {
    const last = cols.at(-1);
    if (last && it.x - last.right < 5) {
      last.name += ` ${it.str.trim()}`;
      last.right = it.x + it.w;
    } else cols.push({ name: it.str.trim(), left: it.x, right: it.x + it.w, numeric: false });
  }
  for (const c of cols) c.numeric = /withdrawal|deposit|debit|credit|balance|amount/i.test(c.name);
  return cols;
}

const isHeader = (items: PdfItem[]) => {
  const t = items.map((i) => i.str).join(" ").toLowerCase();
  return t.includes("date") && t.includes("description") && t.includes("balance");
};

export const PDF_HEADER = ["Date", "Description", "Chq/Ref No.", "Withdrawal", "Deposit", "Balance"];

/** Returns [header, ...rows] or null when no transaction table is found. */
export function pdfPagesToTable(pages: PdfItem[][]): string[][] | null {
  let cols: Col[] | null = null;
  const rows: string[][] = [];
  let current: { y: number; cells: string[] } | null = null;

  const colIndex = (name: RegExp) => cols!.findIndex((c) => name.test(c.name));

  for (const page of pages) {
    for (const line of toLines(page)) {
      if (isHeader(line.items)) {
        cols = headerColumns(line.items);
        current = null;
        continue;
      }
      if (!cols) continue;
      const iDate = colIndex(/date/i), iDesc = colIndex(/description/i), iRef = colIndex(/ref|chq/i);
      const iDr = colIndex(/withdrawal|debit/i), iCr = colIndex(/deposit|credit/i), iBal = colIndex(/balance/i);
      if (iDate < 0 || iDesc < 0 || iBal < 0) continue;

      const cells = ["", "", "", "", "", ""];
      for (const it of line.items) {
        const s = it.str.trim();
        let target = -1;
        if (MONEY.test(s)) {
          // Amounts are right-aligned: compare right edges with the numeric headers.
          const right = it.x + it.w;
          let best = Infinity;
          for (const [slot, idx] of [[3, iDr], [4, iCr], [5, iBal]] as const) {
            if (idx < 0) continue;
            const d = Math.abs(right - cols[idx].right);
            if (d < best) { best = d; target = slot; }
          }
        } else {
          // Text is left-aligned: the last column that starts at or before the item.
          const dateLeft = cols[iDate].left, descLeft = cols[iDesc].left, refLeft = iRef >= 0 ? cols[iRef].left : Infinity;
          target = it.x >= refLeft - TEXT_SLOP ? 2 : it.x >= descLeft - TEXT_SLOP ? 1 : it.x >= dateLeft - TEXT_SLOP ? 0 : -1;
        }
        if (target >= 0) cells[target] = `${cells[target]} ${s}`.trim();
      }

      // The date may arrive split into pieces; a real row has a complete date in the date slot.
      const startsRow = DATE.test(cells[0]);
      if (startsRow) {
        current = { y: line.y, cells };
        rows.push(cells);
      } else if (current && current.y - line.y <= WRAP_GAP && !cells[0] && !cells[3] && !cells[4] && !cells[5]) {
        // A wrapped second line of the previous row: description and reference continue.
        current.cells[1] = `${current.cells[1]} ${cells[1]}`.trim();
        current.cells[2] = `${current.cells[2]}${cells[2]}`;
        current.y = line.y;
      } else {
        current = null;
      }
    }
  }
  return rows.length ? [PDF_HEADER, ...rows] : null;
}
