import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { CategoryForm, DeleteIcon, RuleForm } from "@/components/category-forms";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { listRules } from "@/server/services/capture";
import { EditDialog } from "@/components/edit-dialog";
import { CategoryRenameForm } from "@/components/edit-forms";

export const metadata = { title: "Categories and rules" };

async function CategoriesLoader() {
  const { workspace } = await requireWorkspace();
  const [categories, rules] = await Promise.all([listCategories(workspace.id), listRules(workspace.id)]);
  return (
    <div className="settle stack">
      <h1>Categories and rules</h1>
      <section className="stack-sm" aria-labelledby="cat-h">
        <h2 id="cat-h">Categories</h2>
        <CategoryForm />
        <div className="well table-wrap">
          <table className="ledger">
            <thead><tr><th>Name</th><th>Kind</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
            <tbody>{categories.map((c) => <tr key={c.id}><td>{c.name}</td><td className="cap">{c.kind}</td><td><span className="head-actions"><EditDialog label={`Rename ${c.name}`}><CategoryRenameForm id={c.id} name={c.name} /></EditDialog><DeleteIcon kind="category" id={c.id} label={`Delete ${c.name}`} /></span></td></tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="stack-sm" aria-labelledby="rule-h">
        <h2 id="rule-h">Rules</h2>
        <p className="label">Rules categorise new entries automatically. Ones you teach in the inbox show as learned.</p>
        <RuleForm categories={categories} />
        {rules.length > 0 && (
          <div className="well table-wrap">
            <table className="ledger">
              <thead><tr><th>Contains</th><th>Category</th><th>How</th><th><span className="visually-hidden">Remove</span></th></tr></thead>
              <tbody>{rules.map((r) => <tr key={r.id}><td>{r.pattern}</td><td>{r.category}</td><td className="cap">{r.source}</td><td><DeleteIcon kind="rule" id={r.id} label={`Delete rule ${r.pattern}`} /></td></tr>)}</tbody>
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
