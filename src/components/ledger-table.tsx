import { formatMinor } from "@/lib/money";
import { formatDay } from "@/lib/dates";
import { DeleteButton } from "./delete-button";
import type { listTransactions } from "@/server/services/ledger";

type Row = Awaited<ReturnType<typeof listTransactions>>[number];

export function LedgerTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) {
    return (
      <div className="empty">
        <h3>nothing recorded yet</h3>
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead><tr><th>date</th><th>what</th><th>category</th><th>account</th><th className="num">amount</th><th><span className="visually-hidden">actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatDay(r.occurredOn)}</td>
              <td>{r.payee || r.note || "—"}{r.payee && r.note ? <span className="label"> {r.note}</span> : null}</td>
              <td>{r.transferId ? "transfer" : r.category ?? (r.status === "pending" ? "needs review" : "—")}</td>
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
