import { RecurringForm, ArchiveButton, MarkPaidButton } from "./commit-forms";
import { AddPanel } from "./add-panel";
import { EditDialog } from "./edit-dialog";
import { formatMinor } from "@/lib/money";
import { formatDay, formatDayYear, shiftDays, todayISO } from "@/lib/dates";
import { listCategories, listAccounts } from "@/server/services/ledger";
import { listExpected, listRecurring } from "@/server/services/commitments";
import { isAssetType } from "@/lib/savings";

const EVERY = { weekly: "week", monthly: "month", yearly: "year" } as const;

/** Money coming in, such as salary: when it next arrives, a way to mark it received, and its settings. */
export async function IncomeSection({ workspaceId, home }: { workspaceId: string; home: string }) {
  const today = todayISO();
  const [rules, expected, categories, accounts] = await Promise.all([
    listRecurring(workspaceId), listExpected(workspaceId, shiftDays(today, -45), shiftDays(today, 400)), listCategories(workspaceId), listAccounts(workspaceId),
  ]);
  const income = rules.filter((r) => r.kind === "income");
  const places = accounts.filter((a) => !isAssetType(a.type)).map((a) => ({ id: a.id, name: a.name, type: a.type }));
  return (
    <section id="income" className="stack-sm" aria-labelledby="income-h">
      <h2 id="income-h">Income</h2>
      {income.length === 0 ? (
        <p className="label">Add your salary and anything else that arrives regularly, so the app knows when money is coming.</p>
      ) : (
        <ul className="well rows">
          {income.map((r) => {
            // the oldest one not yet received: late if its date has passed
            const next = expected.find((e) => e.sourceKind === "rule" && e.sourceId === r.id && e.status !== "paid");
            return (
              <li key={r.id} className="row">
                <div className="bar__head">
                  <p className="row__title">{r.name}</p>
                  <p className="row__value amt" data-kind="income">{formatMinor(r.amountMinor, home, { whole: true })}</p>
                  <span className="head-actions">
                    <EditDialog label={`Edit ${r.name}`}><RecurringForm only="income" accounts={places} categories={categories} item={{
                      id: r.id, name: r.name, kind: r.kind, amount: String(r.amountMinor / 100), frequency: r.frequency, every: r.intervalCount, anchor: r.anchor, weekendShift: r.weekendShift,
                      startOn: r.startOn, endOn: r.endOn ?? "", count: r.maxCount, pattern: r.matchPattern ?? "", accountId: r.accountId ?? "", categoryId: r.categoryId ?? "", intoAccountId: "",
                    }} /></EditDialog>
                    <ArchiveButton kind="rule" id={r.id} label={`Remove ${r.name}`} />
                  </span>
                </div>
                <div className="wish__foot">
                  <p className="label">
                    Every {r.intervalCount > 1 ? `${r.intervalCount} ${EVERY[r.frequency]}s` : EVERY[r.frequency]}
                    {next ? `, ${next.status === "overdue" ? "expected on" : "next on"} ${formatDay(next.dueOn)}` : ""}
                    {r.endOn ? `, until ${formatDayYear(r.endOn)}` : ""}
                  </p>
                  {next && next.dueOn <= shiftDays(today, 5) && <MarkPaidButton sourceKind="rule" sourceId={r.id} dueOn={next.dueOn} label="Mark received" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddPanel label="Add income" open={income.length === 0}><RecurringForm only="income" accounts={places} categories={categories} /></AddPanel>
    </section>
  );
}
