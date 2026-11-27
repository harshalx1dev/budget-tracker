import { Suspense } from "react";
import { Summary } from "@/components/summary";
import { AddPanel } from "@/components/add-panel";
import { PageSkeleton } from "@/components/page-skeleton";
import { ContributionForm, GoalForm, RemoveButton } from "@/components/plan-forms";
import { GoalFirmness } from "@/components/goal-firmness";
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
  const saved = goals.reduce((n, g) => n + g.saved, 0);
  const target = goals.reduce((n, g) => n + g.targetMinor, 0);
  return (
    <div className="settle stack">
      <h1>Goals</h1>
      {goals.length > 0 && <Summary figure={formatMinor(saved, home, { whole: true })} pct={(saved / Math.max(1, target)) * 100} caption={`saved towards ${formatMinor(target, home, { whole: true })} across ${goals.length} goal${goals.length === 1 ? "" : "s"}`} />}
      {goals.length === 0 ? (
        <div className="well empty"><h3>No goals yet</h3><p>Money you are putting away for something. Add one below and the app works out what each month needs.</p></div>
      ) : (
        <ul className="well rows">
          {goals.map((g) => {
            const pct = g.targetMinor > 0 ? Math.max(0, Math.min(100, Math.round((g.saved / g.targetMinor) * 100))) : 0;
            return (
              <li key={g.id} className="row">
                <div className="bar__head">
                  <p className="row__title">{g.name}{g.targetDate ? <span className="label"> by {formatDayYear(g.targetDate)}</span> : null}</p>
                  <p className="row__value">{formatMinor(g.saved, home, { whole: true })} <span className="label">of {formatMinor(g.targetMinor, home, { whole: true })}</span></p>
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
                <div className="inline-form">{g.targetDate ? <GoalFirmness id={g.id} fixed={g.fixed} name={g.name} /> : <p className="label">Flexible: it has no date, so there is no monthly amount to hold.</p>}{g.accountId ? <p className="label">Progress follows its savings account.</p> : <ContributionForm goalId={g.id} />}</div>
              </li>
            );
          })}
        </ul>
      )}
      <AddPanel label="Add a goal" open={goals.length === 0}><GoalForm savingsAccounts={assets.map((a) => ({ id: a.id, name: a.name }))} /></AddPanel>
    </div>
  );
}

export default function Goals() {
  return <Suspense fallback={<PageSkeleton />}><GoalsLoader /></Suspense>;
}
