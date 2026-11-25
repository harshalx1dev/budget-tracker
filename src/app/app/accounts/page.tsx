import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { TransferForm, ReconcileForm } from "@/components/money-moves";
import { AccountForm } from "@/components/account-form";

export const metadata = { title: "accounts" };

async function AccountsLoader() {
  const { workspace } = await requireWorkspace();
  const accounts = await listAccounts(workspace.id);
  return (
    <div className="settle stack">
      <h1>accounts</h1>
      <AccountForm homeCurrency={workspace.homeCurrency} />
      <section className="well" aria-label="your accounts">
        <table className="ledger">
          <thead><tr><th>name</th><th>type</th><th className="num">balance</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td>{a.type}</td><td className="num">{formatMinor(a.balanceMinor, a.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="stack-sm" aria-labelledby="mv-h">
        <h2 id="mv-h">move money</h2>
        <TransferForm accounts={accounts} />
      </section>
      <section className="stack-sm" aria-labelledby="rc-h">
        <h2 id="rc-h">count your cash</h2>
        <p className="label">Enter what you actually have. The gap against the books is recorded as untracked cash spending, so you never need to log every small purchase.</p>
        <ReconcileForm accounts={accounts} />
      </section>
    </div>
  );
}

export default function Accounts() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AccountsLoader />
    </Suspense>
  );
}
