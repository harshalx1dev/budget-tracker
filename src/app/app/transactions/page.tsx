import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories, listTransactions } from "@/server/services/ledger";
import Link from "next/link";
import { QuickAddBar } from "@/components/quick-add-bar";
import { TransactionForm } from "@/components/transaction-form";
import { LedgerTable } from "@/components/ledger-table";

export const metadata = { title: "transactions" };

async function TransactionsLoader() {
  const { workspace } = await requireWorkspace();
  const [accounts, categories, rows] = await Promise.all([
    listAccounts(workspace.id),
    listCategories(workspace.id),
    listTransactions(workspace.id, 200),
  ]);
  return (
    <div className="settle stack">
      <div className="head-row"><h1>transactions</h1><Link href="/app/import" className="btn btn--secondary">import statement</Link></div>
      <QuickAddBar />
      <TransactionForm accounts={accounts} categories={categories} homeCurrency={workspace.homeCurrency} />
      <section className="well" aria-label="ledger">
        <LedgerTable rows={rows} empty="Nothing here yet. Add an entry above." />
      </section>
    </div>
  );
}

export default function Transactions() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TransactionsLoader />
    </Suspense>
  );
}
