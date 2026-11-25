import { requireWorkspace } from "@/server/session";
import { listAccounts } from "@/server/services/ledger";
import { formatMinor } from "@/lib/money";
import { AccountForm } from "@/components/account-form";

export const metadata = { title: "accounts" };

export default async function Accounts() {
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
    </div>
  );
}
