import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ContributionForm, GoalForm, RemoveButton } from "@/components/plan-forms";
import { requireWorkspace } from "@/server/session";
import { listGoals } from "@/server/services/planner";
import { listAssets } from "@/server/services/savings";
import { formatMinor } from "@/lib/money";
import { formatDayYear } from "@/lib/dates";

export const metadata = { title: "Goals" };

async function GoalsLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [goals, assets] = await Promise.all([listGoals(workspace.id), listAssets(workspace.id)]);
  return (
    <div className="settle stack">
      <h1>Goals</h1>
      <p className="lead">Money you are putting away for something. Tell the app how much you set aside; it works out what each month needs.</p>
      <GoalForm savingsAccounts={assets.map((a) => ({ id: a.id, name: a.name }))} />
      {goals.length === 0 ? (
        <div className="well empty"><h3>No goals yet</h3><p>Add one above, for example an emergency fund or a trip.</p></div>
      ) : (
        <ul className="bars">
          {goals.map((g) => {
            const pct = g.targetMinor > 0 ? Math.max(0, Math.min(100, Math.round((g.saved / g.targetMinor) * 100))) : 0;
            return (
              <li key={g.id} className="well bar">
                <div className="bar__head">
                  <p>{g.name}{g.targetDate ? <span className="label"> by {formatDayYear(g.targetDate)}</span> : null}</p>
                  <p className="num">{formatMinor(g.saved, home)} of {formatMinor(g.targetMinor, home)}</p>
                  <RemoveButton kind="goal" id={g.id} label={`Remove ${g.name}`} />
                </div>
                <div className="bar__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${g.name} saved`}>
                  <div className="bar__fill" style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
                <p className="label">
                  {g.status === "done" ? "Reached"
                    : g.status === "overdue" ? <span className="error">Target date has passed, {formatMinor(g.remaining, home)} still to go</span>
                    : g.requiredMonthly ? `${formatMinor(g.requiredMonthly, home)} a month for ${g.monthsLeft} month${g.monthsLeft === 1 ? "" : "s"} gets there${g.contributedThisMonth > 0 ? `, ${formatMinor(g.contributedThisMonth, home)} already saved this month` : ""}`
                    : `${formatMinor(g.remaining, home)} to go, no date set`}
                </p>
                {g.accountId ? <p className="label">Tracked with a savings account, so progress follows its value.</p> : <ContributionForm goalId={g.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Goals() {
  return <Suspense fallback={<PageSkeleton />}><GoalsLoader /></Suspense>;
}
