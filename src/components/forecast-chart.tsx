import { formatMinor } from "@/lib/money";

type Row = { month: string; end: number };

const compact = (minor: number, cur: string) => {
  const major = minor / 100;
  const s = new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(major));
  return `${minor < 0 ? "-" : ""}${s}`;
};

/** Month-end balances as bars; the table beside it carries the exact figures. */
export function ForecastChart({ rows, currency }: { rows: Row[]; currency: string }) {
  const W = 640, H = 220, PAD = 28, BASE = 150;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.end)));
  const step = (W - PAD * 2) / rows.length;
  const bw = Math.min(56, step * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projected month-end balance: ${rows.map((r) => `${r.month} ${formatMinor(r.end, currency)}`).join(", ")}`} className="chart">
      <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} className="chart__axis" />
      {rows.map((r, i) => {
        const h = Math.round((Math.abs(r.end) / max) * 110);
        const x = PAD + step * i + (step - bw) / 2;
        const neg = r.end < 0;
        return (
          <g key={r.month}>
            <rect x={x} y={neg ? BASE : BASE - h} width={bw} height={Math.max(2, h)} rx={6} className={neg ? "chart__bar chart__bar--neg" : "chart__bar"} />
            <text x={x + bw / 2} y={neg ? BASE + h + 16 : BASE - h - 8} textAnchor="middle" className="chart__value">{compact(r.end, currency)}</text>
            <text x={x + bw / 2} y={H - 12} textAnchor="middle" className="chart__label">{new Date(`${r.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }).toLowerCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}
