"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addContributionAction, addGoalAction, archiveGoalAction, deleteBudgetAction, setBudgetAction, setBufferAction, type PlanState } from "@/app/app/plan-actions";

type Cat = { id: string; name: string };

function Status({ s }: { s: PlanState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}
function useReset(s: PlanState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return ref;
}

export function BudgetForm({ categories }: { categories: Cat[] }) {
  const [s, action, pending] = useActionState<PlanState, FormData>(setBudgetAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">category</span><select name="categoryId" className="input">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="field"><span className="label">monthly limit</span><input name="amount" inputMode="decimal" required className="input" /></label>
      <label className="check"><input type="checkbox" name="rollover" /> carry unspent money to next month</label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>save budget</button></div>
    </form>
  );
}

export function GoalForm() {
  const [s, action, pending] = useActionState<PlanState, FormData>(addGoalAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">goal</span><input name="name" required maxLength={60} placeholder="emergency fund" className="input" /></label>
      <label className="field"><span className="label">target amount</span><input name="target" inputMode="decimal" required className="input" /></label>
      <label className="field"><span className="label">by (optional)</span><input name="targetDate" type="date" className="input" /></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>add goal</button></div>
    </form>
  );
}

export function ContributionForm({ goalId }: { goalId: string }) {
  const [s, action, pending] = useActionState<PlanState, FormData>(addContributionAction, {});
  const ref = useReset(s);
  return (
    <form ref={ref} action={action} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="goalId" value={goalId} />
      <label className="visually-hidden" htmlFor={`c-${goalId}`}>amount</label>
      <input id={`c-${goalId}`} name="amount" inputMode="decimal" required placeholder="amount" className="input input--sm" />
      <label className="check"><input type="checkbox" name="withdraw" /> withdraw</label>
      <button className="btn btn--secondary" disabled={pending}>save</button>
      <Status s={s} />
    </form>
  );
}

export function BufferForm({ current }: { current: string }) {
  const [s, action, pending] = useActionState<PlanState, FormData>(setBufferAction, {});
  return (
    <form action={action} className="inline-form" aria-busy={pending}>
      <label className="visually-hidden" htmlFor="buffer">buffer amount</label>
      <input id="buffer" name="buffer" inputMode="decimal" defaultValue={current} className="input input--sm" />
      <button className="btn btn--secondary" disabled={pending}>save</button>
      <Status s={s} />
    </form>
  );
}

export function RemoveButton({ kind, id, label }: { kind: "budget" | "goal"; id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="icon-btn" aria-label={label} disabled={pending} onClick={() => start(async () => { if (kind === "budget") await deleteBudgetAction(id); else await archiveGoalAction(id); })}>
      <Trash2 size={16} aria-hidden />
    </button>
  );
}
