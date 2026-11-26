import type { LucideIcon } from "lucide-react";

/** A section heading with its icon chip, so settings and plan sections read as distinct places. */
export function SectionHead({ icon: Icon, children, id }: { icon: LucideIcon; children: React.ReactNode; id?: string }) {
  return <div className="sect"><span className="stat__icon"><Icon size={17} aria-hidden /></span><h2 id={id}>{children}</h2></div>;
}
