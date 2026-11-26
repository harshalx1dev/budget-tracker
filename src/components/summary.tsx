/** The page's answer, large: one headline figure, one line of context, and optionally how far along it is. */
export function Summary({ figure, caption, pct, bad }: { figure: string; caption: React.ReactNode; pct?: number; bad?: boolean }) {
  return (
    <section className="summary" aria-label="Summary">
      <p className="summary__figure" data-bad={bad || undefined}>{figure}</p>
      <p className="summary__caption">{caption}</p>
      {pct !== undefined && <div className="bar__track summary__track" aria-hidden><div className="bar__fill" data-over={bad} style={{ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})` }} /></div>}
    </section>
  );
}
