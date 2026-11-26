import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BudgetForm, RemoveButton } from "@/components/plan-forms";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { budgetStatus } from "@/server/services/planner";
import { formatMinor } from "@/lib/money";
import { daysBetween, thisMonth, todayISO } from "@/lib/dates";
import { monthEnd } from "@/lib/planner";
import { Summary } from "@/components/summary";
import { AddPanel } from "@/components/add-panel";

export const metadata = { title: "Budgets" };

async function BudgetsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [categories, status] = await Promise.all([listCategories(workspace.id), budgetStatus(workspace.id, thisMonth())]);
  const expense = categories.filter((c) => c.kind === "expense");
  const totalLimit = status.reduce((s, b) => s + b.available, 0);
  const totalSpent = status.reduce((s, b) => s + b.spent, 0);

  const ordered = [...status].sort((x, y) => y.spent / (y.available || 1) - x.spent / (x.available || 1));
  const left = totalLimit - totalSpent;
  const today = todayISO();
  const daysLeft = daysBetween(today, monthEnd(today.slice(0, 7))) + 1;
  const money = (v: number) => formatMinor(v, home, { whole: true });

  return (
    <div className="settle stack">
      <h1>Budgets</h1>
      {status.length > 0 && (
        <Summary figure={`${money(Math.abs(left))} ${left < 0 ? "over" : "left"}`} bad={left < 0} pct={totalLimit ? (totalSpent / totalLimit) * 100 : 0}
          caption={`${money(totalSpent)} spent of ${money(totalLimit)} this month, ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`} />
      )}
      {status.length > 0 && (
        <ul className="well rows" aria-label="Budgets by category">
          {ordered.map((b) => {
            const pct = b.available > 0 ? Math.min(100, Math.round((b.spent / b.available) * 100)) : 100;
            const over = b.spent > b.available;
            return (
              <li key={b.id} className="row">
                <div className="bar__head">
                  <p className="row__title">{b.category}{b.rollover ? <span className="label"> carries over</span> : null}</p>
                  <p className="row__value" data-bad={over || undefined}>{over ? `${money(b.spent - b.available)} over` : `${money(b.left)} left`}</p>
                  <RemoveButton kind="budget" id={b.id} label={`Remove budget for ${b.category}`} />
                </div>
                <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${b.category} spent`}>
                  <div className="bar__fill" data-over={over} style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
                <p className="label">{money(b.spent)} spent of {money(b.available)}</p>
              </li>
            );
          })}
        </ul>
      )}
      <AddPanel label="Add or change a budget" open={status.length === 0}>
        <p className="label">A monthly limit per category. Every expense in it counts; transfers never do.</p>
        <BudgetForm categories={expense} />
      </AddPanel>
    </div>
  );
}

export default function Budgets() {
  return <Suspense fallback={<PageSkeleton />}><BudgetsLoader /></Suspense>;
}
