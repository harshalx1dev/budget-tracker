import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ImportForm } from "@/components/import-form";
import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";

export const metadata = { title: "Import" };

async function ImportLoader() {
  const { workspace } = await requireWorkspace();
  const accounts = (await listAccounts(workspace.id)).filter((a) => a.currency === workspace.homeCurrency);
  return (
    <div className="settle stack">
      <h1>Import a statement</h1>
      <p className="lead">Download a CSV or PDF statement from your bank, pick the account, and check the columns. Importing the same period twice is safe: lines already imported are skipped.</p>
      <ImportForm accounts={accounts} />
    </div>
  );
}

export default function Import() {
  return <Suspense fallback={<PageSkeleton />}><ImportLoader /></Suspense>;
}
