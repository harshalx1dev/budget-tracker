import { Suspense } from "react";
import { Summary } from "@/components/summary";
import { AddPanel } from "@/components/add-panel";
import { PageSkeleton } from "@/components/page-skeleton";
import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";
import { listAssets } from "@/server/services/savings";
import { listCards } from "@/server/services/cards";
import { CardSection } from "@/components/card-section";
import { EditDialog } from "@/components/edit-dialog";
import { AccountEditForm } from "@/components/edit-forms";
import { formatMinor } from "@/lib/money";
import { isAssetType, TYPE_LABELS } from "@/lib/savings";
import { CreditCard, Landmark, TrendingUp, Wallet } from "lucide-react";
import { TransferForm, ReconcileForm } from "@/components/money-moves";
import { AccountForm } from "@/components/account-form";
import { IncomeSection } from "@/components/income-section";

export const metadata = { title: "Accounts" };

async function AccountsLoader() {
  const { workspace } = await requireWorkspace();
  const [accounts, assets, cards] = await Promise.all([listAccounts(workspace.id), listAssets(workspace.id), listCards(workspace.id)]);
  // Savings and investments show what they are worth today, the same figure as on the savings page.
  const worth = new Map(assets.map((a) => [a.id, a.valueMinor]));
  return (
    <div className="settle stack">
      <h1>Accounts</h1>
      <Summary figure={formatMinor(accounts.filter((a) => a.currency === workspace.homeCurrency && !isAssetType(a.type)).reduce((n, a) => n + a.balanceMinor, 0), workspace.homeCurrency, { whole: true })} caption="in your spending accounts; savings and investments are not included" />
      <section className="well table-wrap" aria-label="Your accounts">
        <table className="ledger">
          <thead><tr><th>Name</th><th>Type</th><th className="num">Balance</th><th><span className="visually-hidden">Edit</span></th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}><td><span className="what"><span className="what__icon" data-kind="account" aria-hidden>{a.type === "cash" ? <Wallet size={14} /> : a.type === "card" ? <CreditCard size={14} /> : isAssetType(a.type) ? <TrendingUp size={14} /> : <Landmark size={14} />}</span>{a.name}</span></td><td>{TYPE_LABELS[a.type] ?? a.type}</td><td className="num">{formatMinor(worth.get(a.id) ?? a.balanceMinor, a.currency)}</td><td>{a.type === "fd" ? null : (
                <EditDialog label={`Edit ${a.name}`}><AccountEditForm account={{ id: a.id, name: a.name, type: a.type, aliases: a.aliases.join(", "), balance: String((a.type === "card" ? -a.balanceMinor : a.balanceMinor) / 100), saving: isAssetType(a.type) }} /></EditDialog>
              )}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <CardSection cards={cards} payFrom={["bank", "wallet", "cash"].flatMap((t) => accounts.filter((a) => a.type === t))} />
      <AddPanel label="Add an account or credit card"><AccountForm homeCurrency={workspace.homeCurrency} /></AddPanel>
      <IncomeSection workspaceId={workspace.id} home={workspace.homeCurrency} />
      <section className="stack-sm" aria-labelledby="mv-h">
        <h2 id="mv-h">Move money</h2>
        <TransferForm accounts={accounts} />
      </section>
      <section className="stack-sm" aria-labelledby="rc-h">
        <h2 id="rc-h">Update cash in hand</h2>
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
