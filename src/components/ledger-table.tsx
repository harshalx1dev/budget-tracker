import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { DeleteButton } from "./delete-button";
import type { listTransactions } from "@/server/services/ledger";

type Row = Awaited<ReturnType<typeof listTransactions>>[number];

export function LedgerTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) {
    return (
      <div className="empty">
        <h3>Nothing recorded yet</h3>
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead><tr><th>Date</th><th>What</th><th>Category</th><th>Account</th><th className="num">Amount</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatDay(r.occurredOn)}</td>
              <td>{r.payee || r.note || "—"}{r.payee && r.note ? <span className="label"> {r.note}</span> : null}</td>
              <td>{r.transferId ? "Transfer" : r.category ?? (r.status === "pending" ? "Needs review" : "—")}</td>
              <td>{r.account}</td>
              <td className="num amt" data-kind={r.kind}>{formatMinor(r.kind === "income" ? r.amountMinor : -r.amountMinor, r.currency, { sign: true })}</td>
              <td><DeleteButton id={r.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
