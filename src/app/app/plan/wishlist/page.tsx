import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { BoughtButton, LinkChip, LinkForm, RatioForm, RemoveIcon, StatusSelect, WishForm } from "@/components/wish-forms";
import { AddPanel } from "@/components/add-panel";
import { AiButton } from "@/components/ai-bits";
import { adviseWishlistAction } from "@/app/app/ai-actions";
import { hasKey } from "@/server/ai/gateway";
import { getSummary } from "@/server/services/ai-features";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { affordability } from "@/server/services/wishlist";
import { formatMinor } from "@/lib/money";
import { formatDayYear, thisMonth } from "@/lib/dates";

export const metadata = { title: "Want to buy" };

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const KIND = { need: "Must have", want: "Nice to have", desire: "Someday" } as const;

async function WishlistLoader() {
  const { user, workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [categories, a, key, advice] = await Promise.all([listCategories(workspace.id), affordability(workspace.id, home), hasKey(user.id), getSummary(workspace.id, "wishlist", "current")]);
  const expense = categories.filter((c) => c.kind === "expense");
  const rest = a.items.filter((i) => i.status === "bought" || i.status === "dropped");
  const now = thisMonth();
  const money = (v: number) => formatMinor(v, home, { whole: true });
  // Each purchase uses up room for the next, so the plan's order is what is shown: soonest first.
  const list = a.order.map((o) => ({ ...o, item: a.items.find((i) => i.id === o.id)! })).sort((x, y) => (x.month ?? "9999").localeCompare(y.month ?? "9999"));
  const when = (o: (typeof list)[number]) =>
    !o.month ? { tone: "later", text: `Not before ${monthLabel(a.horizonEnd)}` }
    : o.method === "emi" ? { tone: o.month === now ? "now" : "soon", text: `${money(o.emiMinor ?? 0)} a month for ${o.tenure} months, from ${monthLabel(o.month)}` }
    : o.month === now ? { tone: "now", text: "You can buy this now" } : { tone: "soon", text: `From ${monthLabel(o.month)}` };

  return (
    <div className="settle stack">
      <h1>Want to buy</h1>
      {list.length > 0 && <p className="label">These dates use all the money in your accounts, not only what is free this month.</p>}
      {list.length === 0 ? (
        <div className="well empty"><h3>Nothing here yet</h3><p>Add something you want and the app tells you when you can afford it.</p></div>
      ) : (
        <ul className="well rows">
          {list.map((o) => {
            const w = when(o);
            const i = o.item;
            return (
              <li key={o.id} className="row">
                <div className="bar__head">
                  <p className="row__title">{o.title}</p>
                  <p className="row__value">{money(o.priceMinor)}</p>
                </div>
                <div className="wish__foot">
                  <p className="when" data-tone={w.tone}>{w.text}</p>
                  <span className="head-actions"><BoughtButton id={o.id} /><RemoveIcon kind="wish" id={o.id} label={`Delete ${o.title}`} /></span>
                </div>
                <details className="wish__more">
                  <summary className="link">Details and price links</summary>
                  <div className="stack-sm">
                    <p className="label">{KIND[i.type]}.{i.targetDate ? ` Wanted by ${formatDayYear(i.targetDate)}.` : ""}{o.interestMinor ? ` EMI interest ${money(o.interestMinor)}.` : ""}{i.notes ? ` ${i.notes}` : ""}</p>
                    <div className="chips">{i.links.map((l) => <LinkChip key={l.id} id={l.id} url={l.url} label={l.label ?? host(l.url)} price={l.priceMinor ? formatMinor(l.priceMinor, home) : null} />)}</div>
                    <LinkForm itemId={i.id} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <AddPanel label="Add something you want" open={list.length === 0}><WishForm categories={expense} /></AddPanel>

      <details className="more">
        <summary className="btn btn--secondary">How are these dates decided?</summary>
        <div className="stack-sm">
          <p className="label">The app looks six months and more ahead at your salary, bills and spending. It keeps {money(a.buffer)} untouched and lets all EMIs together take at most {a.maxRatioPct}% of your income.</p>
          {!a.incomeKnown && <p className="label">No salary is planned yet. <Link href="/app/plan/commitments" className="link">Add your salary</Link>.</p>}
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
                  <tr key={i.id}><td>{i.title}</td><td className="num">{formatMinor(i.priceMinor, home)}</td><td><StatusSelect id={i.id} status={i.status} /></td><td><RemoveIcon kind="wish" id={i.id} label={`Delete ${i.title}`} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export default function Wishlist() {
  return <Suspense fallback={<PageSkeleton />}><WishlistLoader /></Suspense>;
}
