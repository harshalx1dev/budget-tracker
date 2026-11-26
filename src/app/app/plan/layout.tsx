import { Suspense } from "react";
import { PlanTabs } from "@/components/plan-tabs";

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="stack">
      <Suspense fallback={<div className="subnav" />}><PlanTabs /></Suspense>
      {children}
    </div>
  );
}
