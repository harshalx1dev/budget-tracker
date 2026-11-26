import { Loader } from "./loader";

export function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <div className="loading-row"><Loader /><span className="label">Loading</span></div>
      <div className="stats">
        {[0, 1, 2].map((i) => <div key={i} className="well" style={{ height: 112 }} />)}
      </div>
      <div className="well" style={{ height: 240 }} />
    </div>
  );
}
