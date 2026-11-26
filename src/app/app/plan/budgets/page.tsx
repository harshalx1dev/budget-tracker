import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { BudgetForm, RemoveButton } from "@/components/plan-forms";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { budgetStatus } from "@/server/services/planner";
import { formatMinor } from "@/lib/money";
import { thisMonth } from "@/lib/dates";

export const metadata = { title: "budgets" };

async function BudgetsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [categories, status] = await Promise.all([listCategories(workspace.id), budgetStatus(workspace.id, thisMonth())]);
  const expense = categories.filter((c) => c.kind === "expense");
  const totalLimit = status.reduce((s, b) => s + b.available, 0);
  const totalSpent = status.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="settle stack">
      <h1>budgets</h1>
      <p className="lead">A monthly limit per category. Spending counts every expense in the category, including bills and EMIs, and transfers never count.</p>
      <BudgetForm categories={expense} />
      {status.length === 0 ? (
        <div className="well empty"><h3>no budgets yet</h3><p>Pick a category above and give it a monthly limit. The forecast uses it for your everyday spending.</p></div>
      ) : (
        <section className="stack-sm" aria-label="this month">
          <p className="label">This month: {formatMinor(totalSpent, home)} spent of {formatMinor(totalLimit, home)} budgeted.</p>
          <ul className="bars">
            {status.map((b) => {
              const pct = b.available > 0 ? Math.min(100, Math.round((b.spent / b.available) * 100)) : 100;
              const over = b.spent > b.available;
              return (
                <li key={b.id} className="well bar">
                  <div className="bar__head">
                    <p>{b.category}{b.rollover ? <span className="label"> carries over</span> : null}</p>
                    <p className="num">{formatMinor(b.spent, home)} of {formatMinor(b.available, home)}</p>
                    <RemoveButton kind="budget" id={b.id} label={`remove budget for ${b.category}`} />
                  </div>
                  <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${b.category} spent`}>
                    <div className="bar__fill" data-over={over} style={{ transform: `scaleX(${pct / 100})` }} />
                  </div>
                  <p className="label">{over ? <span className="error">{formatMinor(b.spent - b.available, home)} over</span> : `${formatMinor(b.left, home)} left`}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Budgets() {
  return <Suspense fallback={<PageSkeleton />}><BudgetsLoader /></Suspense>;
}
