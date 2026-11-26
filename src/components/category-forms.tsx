"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addCategoryAction, addRuleAction, deleteCategoryAction, deleteRuleAction, type CaptureState } from "@/app/app/capture-actions";

type Cat = { id: string; name: string; kind: "income" | "expense" };

function Status({ s }: { s: CaptureState }) {
  return <p className="label" role="status">{s.error ? <span className="error">{s.error}</span> : s.message}</p>;
}

export function CategoryForm() {
  const [s, action, pending] = useActionState<CaptureState, FormData>(addCategoryAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">Name</span><input name="name" required maxLength={40} className="input" /></label>
      <label className="field"><span className="label">Kind</span><select name="kind" className="input"><option value="expense">Expense</option><option value="income">Income</option></select></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>Add category</button></div>
    </form>
  );
}

export function RuleForm({ categories }: { categories: Cat[] }) {
  const [s, action, pending] = useActionState<CaptureState, FormData>(addRuleAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (s.message) ref.current?.reset(); }, [s]);
  return (
    <form ref={ref} action={action} className="well tx-form" aria-busy={pending}>
      <label className="field"><span className="label">When payee or description contains</span><input name="pattern" required minLength={3} maxLength={60} placeholder="Swiggy" className="input" /></label>
      <label className="field"><span className="label">Use category</span><select name="categoryId" className="input">{categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}</select></label>
      <div className="tx-form__end"><Status s={s} /><button className="btn btn--primary" disabled={pending}>Save rule</button></div>
    </form>
  );
}

export function DeleteIcon({ label, kind, id }: { label: string; kind: "category" | "rule"; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="icon-btn" aria-label={label} disabled={pending}
      onClick={() => start(() => (kind === "category" ? deleteCategoryAction(id) : deleteRuleAction(id)))}>
      <Trash2 size={16} aria-hidden />
    </button>
  );
}
