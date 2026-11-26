/** A tiny trend line for a stat tile. Decorative: the figure beside it carries the number. */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 120, H = 32, P = 3;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [P + (i * (W - P * 2)) / (values.length - 1), H - P - ((v - min) / span) * (H - P * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path className="spark__area" d={`${line}L${pts[pts.length - 1][0]} ${H}L${P} ${H}Z`} />
      <path className="spark__line" d={line} pathLength="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
