import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { isAssetType, TYPE_LABELS } from "@/lib/savings";
import { CreditCard, Landmark, TrendingUp, Wallet } from "lucide-react";
import { TransferForm, ReconcileForm } from "@/components/money-moves";
import { AccountForm } from "@/components/account-form";

export const metadata = { title: "Accounts" };

async function AccountsLoader() {
  const { workspace } = await requireWorkspace();
  const accounts = await listAccounts(workspace.id);
  return (
    <div className="settle stack">
      <h1>Accounts</h1>
      <AccountForm homeCurrency={workspace.homeCurrency} />
      <section className="well" aria-label="Your accounts">
        <table className="ledger">
          <thead><tr><th>Name</th><th>Type</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}><td><span className="what"><span className="what__icon" data-kind="account" aria-hidden>{a.type === "cash" ? <Wallet size={14} /> : a.type === "card" ? <CreditCard size={14} /> : isAssetType(a.type) ? <TrendingUp size={14} /> : <Landmark size={14} />}</span>{a.name}</span></td><td>{TYPE_LABELS[a.type] ?? a.type}</td><td className="num">{formatMinor(a.balanceMinor, a.currency)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="stack-sm" aria-labelledby="mv-h">
        <h2 id="mv-h">Move money</h2>
        <TransferForm accounts={accounts} />
      </section>
      <section className="stack-sm" aria-labelledby="rc-h">
        <h2 id="rc-h">Count your cash</h2>
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
