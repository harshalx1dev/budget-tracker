"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/app/plan/budgets", label: "Budgets" },
  { href: "/app/plan/commitments", label: "Bills & EMIs" },
  { href: "/app/plan/goals", label: "Goals & savings", also: "/app/plan/savings" },
  { href: "/app/plan/wishlist", label: "Want to buy" },
  { href: "/app/plan/reports", label: "Trends" },
];
const GOALS = [{ href: "/app/plan/goals", label: "Goals" }, { href: "/app/plan/savings", label: "Savings and investments" }];

export function PlanTabs() {
  const path = usePathname();
  const under = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <div className="stack-sm">
      <nav className="subnav" aria-label="Plan sections">
        {TABS.map((t) => <Link key={t.href} href={t.href} className="pill" aria-current={under(t.href) || (t.also && under(t.also)) ? "page" : undefined}>{t.label}</Link>)}
      </nav>
      {GOALS.some((g) => under(g.href)) && (
        <nav className="seg" aria-label="Goals and savings">
          {GOALS.map((g) => <Link key={g.href} href={g.href} className="seg__opt" data-on={under(g.href)} aria-current={under(g.href) ? "page" : undefined}>{g.label}</Link>)}
        </nav>
      )}
    </div>
  );
}
