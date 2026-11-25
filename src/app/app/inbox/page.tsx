import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { InboxList } from "@/components/inbox-list";
import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { listPending } from "@/server/services/capture";

export const metadata = { title: "inbox" };

async function InboxLoader() {
  const { workspace } = await requireWorkspace();
  const [rows, categories, accounts] = await Promise.all([listPending(workspace.id), listCategories(workspace.id), listAccounts(workspace.id)]);
  return (
    <div className="settle stack">
      <h1>inbox</h1>
      {rows.length === 0 ? (
        <section className="well empty">
          <h3>all caught up</h3>
          <p>Entries without a category land here, from quick-add and imported statements.</p>
          <Link href="/app/import" className="btn btn--secondary">import a statement</Link>
        </section>
      ) : (
        <InboxList rows={rows} categories={categories} accounts={accounts} />
      )}
    </div>
  );
}

export default function Inbox() {
  return <Suspense fallback={<PageSkeleton />}><InboxLoader /></Suspense>;
}
