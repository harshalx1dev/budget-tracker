export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="loading">
      <div className="skeleton" style={{ width: "30%", height: 28 }} />
      <div className="stats">
        {[0, 1, 2].map((i) => <div key={i} className="well" style={{ height: 112 }} />)}
      </div>
      <div className="well" style={{ height: 240 }} />
    </div>
  );
}
