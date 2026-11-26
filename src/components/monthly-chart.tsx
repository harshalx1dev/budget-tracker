import { formatMinor } from "@/lib/money";

type Row = { month: string; income: number; expense: number };

const compact = (minor: number, cur: string) =>
  new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(minor / 100);
const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

/** Income against spending per month, as paired bars. The table on the page carries the exact figures. */
export function MonthlyChart({ rows, currency }: { rows: Row[]; currency: string }) {
  const W = 640, H = 230, PAD = 24, BASE = 190;
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
  const step = (W - PAD * 2) / rows.length;
  const bw = Math.min(26, step * 0.32);
  const bar = (v: number) => Math.max(v > 0 ? 2 : 0, Math.round((v / max) * 140));
  return (
    <figure className="chart-fig">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Income and spending by month: ${rows.map((r) => `${r.month} income ${formatMinor(r.income, currency)}, spending ${formatMinor(r.expense, currency)}`).join("; ")}`} className="chart">
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} className="chart__axis" />
        {rows.map((r, i) => {
          const cx = PAD + step * i + step / 2;
          return (
            <g key={r.month}>
              <rect x={cx - bw - 2} y={BASE - bar(r.income)} width={bw} height={bar(r.income)} rx={5} className="chart__bar chart__bar--income" />
              <rect x={cx + 2} y={BASE - bar(r.expense)} width={bw} height={bar(r.expense)} rx={5} className="chart__bar chart__bar--spend" />
              <text x={cx} y={H - 10} textAnchor="middle" className="chart__label">{label(r.month)}</text>
              <text x={cx - bw / 2 - 2} y={BASE - bar(r.income) - 6} textAnchor="middle" className="chart__value">{r.income ? compact(r.income, currency) : ""}</text>
              <text x={cx + bw / 2 + 2} y={BASE - bar(r.expense) - 6} textAnchor="middle" className="chart__value">{r.expense ? compact(r.expense, currency) : ""}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legend"><span><i className="swatch swatch--income" /> Income</span><span><i className="swatch swatch--spend" /> Spending</span></figcaption>
    </figure>
  );
}
