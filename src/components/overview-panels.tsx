import Link from "next/link";
import { CalendarClock, Inbox, PieChart, ShoppingBag, Target, TrendingUp, Wallet } from "lucide-react";
import { UpcomingList, type Upcoming } from "./upcoming-list";
import { BuyButton } from "./buy-dialog";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { spendingAccounts } from "@/lib/savings";
import { listExpected } from "@/server/services/commitments";
import { listCards } from "@/server/services/cards";
import { affordability } from "@/server/services/wishlist";
import { budgetStatus, listGoals } from "@/server/services/planner";
import { listAssets } from "@/server/services/savings";
import { spendingByCategory } from "@/server/services/reports";
import { pendingCount } from "@/server/services/capture";
import { formatMinor } from "@/lib/money";
import { shiftDays, thisMonth, todayISO } from "@/lib/dates";

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

function Panel({ id, title, icon, href, more, wide, children }: { id: string; title: string; icon: React.ReactNode; href: string; more: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className="well panel" data-wide={wide || undefined} aria-labelledby={id}>
      <div className="panel__head">
        <span className="stat__icon" aria-hidden>{icon}</span>
        <h2 id={id}>{title}</h2>
        <Link href={href} className="link">{more}</Link>
      </div>
      {children}
    </section>
  );
}

/** The rest of the picture under free-to-spend: what is coming, what can be bought, and how the plan is going. */
export async function OverviewPanels({ workspaceId, home }: { workspaceId: string; home: string }) {
  const today = todayISO(), month = thisMonth();
  const [expected, cards, wish, budgets, spend, goals, assets, pending, accounts, categories] = await Promise.all([
    listExpected(workspaceId, shiftDays(today, -45), shiftDays(today, 30)), listCards(workspaceId), affordability(workspaceId, home),
    budgetStatus(workspaceId, month), spendingByCategory(workspaceId, home, month), listGoals(workspaceId), listAssets(workspaceId), pendingCount(workspaceId),
    listAccounts(workspaceId), listCategories(workspaceId),
  ]);
  const payFrom = spendingAccounts(accounts, home);
  const expense = categories.filter((c) => c.kind === "expense").map(({ id, name }) => ({ id, name }));
  const buy = (id: string) => {
    const i = wish.items.find((x) => x.id === id)!;
    return <BuyButton key={i.boughtCount} item={{ id, title: i.title, priceMinor: i.priceMinor, left: i.quantity - i.boughtCount, categoryId: i.categoryId }} accounts={payFrom} categories={expense} currency={home} />;
  };
  const money = (v: number) => formatMinor(v, home, { whole: true });

  const upcoming: Upcoming[] = [
    ...expected.filter((e) => e.status !== "paid").map((e) => ({ key: e.key, name: e.name, dueOn: e.dueOn, amountMinor: e.amountMinor, income: e.kind === "income", source: { kind: e.sourceKind, id: e.sourceId } })),
    ...cards.filter((c) => c.bill && c.bill.toPay > 0 && c.bill.dueOn <= shiftDays(today, 30)).map((c) => ({ key: `card-${c.id}`, name: `${c.name} bill`, dueOn: c.bill!.dueOn, amountMinor: c.bill!.toPay, income: false })),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));

  // The buying plan: each purchase uses up room for the next, so these can all be bought as listed.
  const planned = wish.order.filter((o) => o.month).sort((a, b) => a.month!.localeCompare(b.month!));
  const now = planned.filter((o) => o.month === month);
  const next = planned.filter((o) => o.month !== month);
  const sum = (rows: typeof planned) => money(rows.reduce((s, o) => s + o.priceMinor, 0));

  const tight = [...budgets].sort((a, b) => b.spent / (b.available || 1) - a.spent / (a.available || 1)).slice(0, 4);
  const spent = spend.reduce((s, c) => s + c.total, 0);
  const invested = assets.filter((a) => a.currency === home);

  return (
    <>
      {pending > 0 && (
        <Link href="/app/inbox" className="well nudge"><Inbox size={18} aria-hidden /><span>{pending} {pending === 1 ? "entry needs" : "entries need"} a category</span><span className="link">Sort them</span></Link>
      )}
      <div className="panels">
        <Panel id="up-h" title="Coming up" icon={<CalendarClock size={18} />} href="/app/plan/commitments" more="Bills and EMIs" wide>
          <UpcomingList items={upcoming} today={today} home={home} />
        </Panel>

        {wish.order.length > 0 && (
          <Panel id="buy-h" title="What you can buy" icon={<ShoppingBag size={18} />} href="/app/plan/wishlist" more="Whole list">
            {now.length > 0 ? (
              <>
                <p className="panel__figure">{now.length} {now.length === 1 ? "item" : "items"} now, {sum(now)}</p>
                <p className="label">Uses all your money outside goals and what you keep aside, not only what is free this month.</p>
                <ul className="lines lines--buy">{now.slice(0, 5).map((o) => <li key={o.id}><span className="lines__what">{o.title}</span><span className="lines__sum">{money(o.priceMinor)}</span>{buy(o.id)}</li>)}</ul>
              </>
            ) : (
              <p className="panel__figure">{next.length ? `Nothing yet. Next from ${monthLabel(next[0].month!)}` : "Nothing fits the plan yet"}</p>
            )}
            {next.length > 0 && (
              <>
                {now.length > 0 && <p className="label">Later</p>}
                <ul className="lines lines--buy">{next.slice(0, now.length ? 3 : 5).map((o) => <li key={o.id}><span className="lines__when">{monthLabel(o.month!)}</span><span className="lines__what">{o.title}</span><span className="lines__sum">{money(o.priceMinor)}</span>{buy(o.id)}</li>)}</ul>
              </>
            )}
            {!wish.incomeKnown && <p className="label">Add your salary under Accounts to get dates.</p>}
          </Panel>
        )}

        <Panel id="spend-h" title="Where money went" icon={<PieChart size={18} />} href="/app/plan/reports" more="Trends">
          {spend.length === 0 ? <p className="label">Nothing spent yet this month.</p> : (
            <ul className="lines">
              {spend.slice(0, 5).map((c) => (
                <li key={c.name} className="lines__bar">
                  <span className="lines__what">{c.name}</span><span className="lines__sum">{money(c.total)}</span>
                  <span className="bar__track" aria-hidden><span className="bar__fill" style={{ display: "block", transform: `scaleX(${spent ? c.total / spent : 0})` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="bud-h" title="Budgets" icon={<Wallet size={18} />} href="/app/plan/budgets" more={budgets.length ? "All budgets" : "Set one"}>
          {tight.length === 0 ? <p className="label">Give a category a monthly limit and see here how much is left.</p> : (
            <ul className="lines">
              {tight.map((b) => (
                <li key={b.id} className="lines__bar">
                  <span className="lines__what">{b.category}</span>
                  <span className="lines__sum" data-bad={b.spent > b.available || undefined}>{b.spent > b.available ? `${money(b.spent - b.available)} over` : `${money(b.left)} left`}</span>
                  <span className="bar__track" aria-hidden><span className="bar__fill" data-over={b.spent > b.available} style={{ display: "block", transform: `scaleX(${Math.min(1, b.spent / (b.available || 1))})` }} /></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {invested.length > 0 && (
          <Panel id="inv-h" title="Savings and investments" icon={<TrendingUp size={18} />} href="/app/plan/savings" more="Details">
            <p className="panel__figure">{money(invested.reduce((s, a) => s + a.valueMinor, 0))}</p>
            <ul className="lines">{[...invested].sort((a, b) => b.valueMinor - a.valueMinor).slice(0, 5).map((a) => <li key={a.id}><span className="lines__what">{a.name}</span><span className="lines__sum">{money(a.valueMinor)}</span></li>)}</ul>
          </Panel>
        )}

        {goals.length > 0 && (
          <Panel id="goal-h" title="Goals" icon={<Target size={18} />} href="/app/plan/goals" more="All goals">
            <ul className="lines">
              {goals.slice(0, 4).map((g) => (
                <li key={g.id} className="lines__bar">
                  <span className="lines__what">{g.name}</span><span className="lines__sum">{money(g.saved)} of {money(g.targetMinor)}</span>
                  <span className="bar__track" aria-hidden><span className="bar__fill" style={{ display: "block", transform: `scaleX(${Math.max(0, Math.min(1, g.saved / (g.targetMinor || 1)))})` }} /></span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
