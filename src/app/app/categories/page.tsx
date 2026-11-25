import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { CategoryForm, DeleteIcon, RuleForm } from "@/components/category-forms";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { listRules } from "@/server/services/capture";

export const metadata = { title: "categories and rules" };

async function CategoriesLoader() {
  const { workspace } = await requireWorkspace();
  const [categories, rules] = await Promise.all([listCategories(workspace.id), listRules(workspace.id)]);
  return (
    <div className="settle stack">
      <h1>categories and rules</h1>
      <section className="stack-sm" aria-labelledby="cat-h">
        <h2 id="cat-h">categories</h2>
        <CategoryForm />
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>name</th><th>kind</th><th><span className="visually-hidden">remove</span></th></tr></thead>
            <tbody>{categories.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.kind}</td><td><DeleteIcon kind="category" id={c.id} label={`delete ${c.name}`} /></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="stack-sm" aria-labelledby="rule-h">
        <h2 id="rule-h">rules</h2>
        <p className="label">Rules categorise new entries automatically. Ones you teach in the inbox show as learned.</p>
        <RuleForm categories={categories} />
        {rules.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>contains</th><th>category</th><th>how</th><th><span className="visually-hidden">remove</span></th></tr></thead>
              <tbody>{rules.map((r) => <tr key={r.id}><td>{r.pattern}</td><td>{r.category}</td><td>{r.source}</td><td><DeleteIcon kind="rule" id={r.id} label={`delete rule ${r.pattern}`} /></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Categories() {
  return <Suspense fallback={<PageSkeleton />}><CategoriesLoader /></Suspense>;
}
