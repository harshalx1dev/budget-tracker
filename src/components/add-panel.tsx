import { Plus } from "lucide-react";

/** A create form tucked behind one button, so what you already have comes first. Starts open when there is nothing yet. */
export function AddPanel({ label, open, children }: { label: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="more" open={open}>
      <summary className="btn btn--secondary"><Plus size={16} aria-hidden />{label}</summary>
      {children}
    </details>
  );
}
