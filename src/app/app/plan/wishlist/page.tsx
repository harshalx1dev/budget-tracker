import { Suspense } from "react";
import { Pencil, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkChip, LinkForm, RatioForm, RemoveIcon, StatusSelect, UseOptionButton, WishForm } from "@/components/wish-forms";
import { AddPanel } from "@/components/add-panel";
import { WishControls } from "@/components/wish-controls";
import { BuyButton } from "@/components/buy-dialog";
import { spendingAccounts } from "@/lib/savings";
import { readView, viewWishes } from "@/lib/wish-view";
import { AiButton } from "@/components/ai-bits";
import { adviseWishlistAction } from "@/app/app/ai-actions";
import { hasKey } from "@/server/ai/gateway";
import { getSummary } from "@/server/services/ai-features";
import { requireWorkspace } from "@/server/session";
import { listAccounts, listCategories } from "@/server/services/ledger";
import { affordability } from "@/server/services/wishlist";
import { formatMinor } from "@/lib/money";
import { formatDayYear, thisMonth } from "@/lib/dates";

export const metadata = { title: "Want to buy" };

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const KIND = { need: "Must have", want: "Nice to have", desire: "Someday" } as const;

type Query = Promise<Record<string, string | string[] | undefined>>;

async function WishlistLoader({ searchParams }: { searchParams: Query }) {
  const view = readView(await searchParams);
  const { user, workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [categories, a, key, advice, accounts] = await Promise.all([listCategories(workspace.id), affordability(workspace.id, home), hasKey(user.id), getSummary(workspace.id, "wishlist", "current"), listAccounts(workspace.id)]);
  const payFrom = spendingAccounts(accounts, home);
  const expense = categories.filter((c) => c.kind === "expense");
  const rest = a.items.filter((i) => i.status === "bought" || i.status === "dropped");
  const now = thisMonth();
  const money = (v: number) => formatMinor(v, home, { whole: true });
  // Each purchase uses up room for the next, so the plan's order is what is shown: soonest first.
  const list = a.order.map((o) => { const item = a.items.find((i) => i.id === o.id)!; return { ...o, item, type: item.type, priority: item.priority }; });
  const shown = viewWishes(list, view, now);
  const total = (rows: typeof list) => money(rows.reduce((s, o) => s + o.priceMinor, 0));
  const when = (o: (typeof list)[number]) =>
    !o.month ? { tone: "later", text: `Not before ${monthLabel(a.horizonEnd)}` }
    : o.method === "emi" ? { tone: o.month === now ? "now" : "soon", text: `${money(o.emiMinor ?? 0)} a month for ${o.tenure} months, from ${monthLabel(o.month)}` }
    : o.month === now ? { tone: "now", text: "You can buy this now" } : { tone: "soon", text: `From ${monthLabel(o.month)}` };

  return (
    <div className="settle stack">
      <h1>Want to buy</h1>
      {list.length > 0 && <p className="label">These dates use the money in your accounts and what is coming, leaving alone anything set aside for goals or kept aside.</p>}
      {list.length === 0 ? (
        <div className="well empty"><h3>Nothing here yet</h3><p>Add something you want and the app tells you when you can afford it.</p></div>
      ) : (
        <>
        <WishControls view={view} />
        <p className="label" role="status">{shown.length === list.length ? `${list.length} item${list.length === 1 ? "" : "s"}, ${total(list)} in all` : `Showing ${shown.length} of ${list.length}, ${total(shown)} of ${total(list)}`}</p>
        {shown.length === 0 ? <div className="well empty"><h3>Nothing matches</h3><p>Change or clear the filters to see the rest of your list.</p></div> : (
        <ul className="well rows">
          {shown.map((o) => {
            const w = when(o);
            const i = o.item;
            return (
              <li key={o.id} className="row">
                <div className="bar__head">
                  <p className="row__title">{o.title}</p>
                  <p className="row__value">{money(o.priceMinor)}</p>
                </div>
                {i.quantity > 1 && <p className="label">{i.quantity - i.boughtCount} of {i.quantity} still to buy, {money(i.priceMinor)} each</p>}
                <div className="wish__foot">
                  <p className="when" data-tone={w.tone}>{w.text}</p>
                  <span className="head-actions"><BuyButton key={i.boughtCount} item={{ id: o.id, title: o.title, priceMinor: i.priceMinor, left: i.quantity - i.boughtCount, categoryId: i.categoryId }} accounts={payFrom} categories={expense.map(({ id, name }) => ({ id, name }))} currency={home} /><RemoveIcon kind="wish" id={o.id} label={`Delete ${o.title}`} /></span>
                </div>
                {i.emiOption && (
                  <p className="label">On EMI: {money(i.emiOption.monthlyMinor)} a month for {i.emiOption.tenure} months{i.emiOption.downMinor ? ` after ${money(i.emiOption.downMinor)} down` : ""}, at {i.emiOption.ratePct}%{i.emiOption.assumed ? " (your assumed rate)" : ""}{i.emiOption.interestMinor > 0 ? `, ${money(i.emiOption.interestMinor)} interest` : ""}.</p>
                )}
                <details className="more-line">
                  <summary><SlidersHorizontal size={15} aria-hidden />Details, options and editing</summary>
                  <div className="more-line__body stack-sm">
                    <p className="label">{KIND[i.type]}.{i.targetDate ? ` Wanted by ${formatDayYear(i.targetDate)}.` : ""}{o.interestMinor ? ` EMI interest ${money(o.interestMinor)}.` : ""}{i.notes ? ` ${i.notes}` : ""}</p>
                    {i.links.length > 0 && (
                      <ul className="options">
                        {i.links.map((l) => (
                          <li key={l.id}>
                            <LinkChip id={l.id} url={l.url} label={l.label ?? host(l.url)} price={l.priceMinor ? formatMinor(l.priceMinor, home) : null} />
                            {l.priceMinor ? (l.priceMinor === i.priceMinor ? <span className="label">This price is used</span> : <UseOptionButton id={l.id} />) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <LinkForm itemId={i.id} />
                    <details className="more-line">
                      <summary><Pencil size={15} aria-hidden />Edit this item</summary>
                      <WishForm key={JSON.stringify([i.title, i.priceMinor, i.quantity, i.type, i.priority, i.notes, i.targetDate, i.categoryId, i.downPaymentMinor, i.emiTenureMonths, i.emiRatePct])} categories={expense} item={{
                        id: i.id, title: i.title, price: String(i.priceMinor / 100), quantity: i.quantity, type: i.type, priority: i.priority, targetDate: i.targetDate, categoryId: i.categoryId, notes: i.notes,
                        down: i.downPaymentMinor ? String(i.downPaymentMinor / 100) : "", tenure: i.emiTenureMonths, rate: i.emiRatePct === null ? "" : String(Number(i.emiRatePct)),
                      }} />
                    </details>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        )}
        </>
      )}

      <AddPanel label="Add something you want" open={list.length === 0}><WishForm categories={expense} /></AddPanel>

      <details className="more">
        <summary className="btn btn--secondary">How are these dates decided?</summary>
        <div className="stack-sm">
          <p className="label">The app looks six months and more ahead at your salary, bills and spending. It keeps {money(a.buffer)} untouched and lets all EMIs together take at most {a.maxRatioPct}% of your income.</p>
          {!a.incomeKnown && <p className="label">No salary is planned yet. <Link href="/app/accounts#income" className="link">Add your salary</Link>.</p>}
          <p className="label">Most of your income that EMIs may take, in percent:</p>
          <RatioForm current={a.maxRatioPct} />
          {list.length > 0 && (
            <>
              {advice ? <p className="prose-ai">{advice.body}</p> : null}
              <AiButton label={advice ? "Explain again with AI" : "Explain this with AI"} run={adviseWishlistAction} enabled={Boolean(key)} />
            </>
          )}
        </div>
      </details>

      {rest.length > 0 && (
        <details className="more">
          <summary className="btn btn--secondary">Bought and dropped ({rest.length})</summary>
          <div className="well table-wrap">
            <table className="ledger">
              <tbody>
                {rest.map((i) => (
                  <tr key={i.id}><td>{i.title}</td><td className="num">{formatMinor(i.priceMinor * i.quantity, home)}</td><td><StatusSelect id={i.id} status={i.status} /></td><td><RemoveIcon kind="wish" id={i.id} label={`Delete ${i.title}`} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export default function Wishlist({ searchParams }: { searchParams: Query }) {
  return <Suspense fallback={<PageSkeleton />}><WishlistLoader searchParams={searchParams} /></Suspense>;
}
