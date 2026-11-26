import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { InboxList } from "@/components/inbox-list";
import { requireWorkspace } from "@/server/session";
import { hasKey } from "@/server/ai/gateway";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { listPending } from "@/server/services/capture";

export const metadata = { title: "Inbox" };

async function InboxLoader() {
  const { user, workspace } = await requireWorkspace();
  const [rows, categories, accounts, key] = await Promise.all([listPending(workspace.id), listCategories(workspace.id), listAccounts(workspace.id), hasKey(user.id)]);
  return (
    <div className="settle stack">
      <h1>Inbox</h1>
      {rows.length === 0 ? (
        <section className="well empty">
          <h3>All caught up</h3>
          <p>Entries without a category land here, from quick-add and imported statements.</p>
          <Link href="/app/import" className="btn btn--secondary">Import a statement</Link>
        </section>
      ) : (
        <InboxList rows={rows} categories={categories} accounts={accounts} aiEnabled={Boolean(key)} />
      )}
    </div>
  );
}

export default function Inbox() {
  return <Suspense fallback={<PageSkeleton />}><InboxLoader /></Suspense>;
}
