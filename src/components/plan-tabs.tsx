"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/plan", label: "forecast" },
  { href: "/app/plan/budgets", label: "budgets" },
  { href: "/app/plan/goals", label: "goals" },
  { href: "/app/plan/commitments", label: "commitments" },
];

export function PlanTabs() {
  const path = usePathname();
  const current = TABS.filter((t) => path === t.href || path.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="subnav" aria-label="plan sections">
      {TABS.map((t) => <Link key={t.href} href={t.href} className="pill" aria-current={current === t.href ? "page" : undefined}>{t.label}</Link>)}
    </nav>
  );
}
