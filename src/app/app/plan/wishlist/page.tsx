import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkChip, LinkForm, RatioForm, RemoveIcon, StatusSelect, WishForm } from "@/components/wish-forms";
import { requireWorkspace } from "@/server/session";
import { listCategories } from "@/server/services/ledger";
import { affordability } from "@/server/services/wishlist";
import { formatMinor } from "@/lib/money";
import { formatDayYear } from "@/lib/dates";

export const metadata = { title: "wishlist" };

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).toLowerCase();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const PRIORITY = { 1: "high", 2: "medium", 3: "low" } as const;

async function WishlistLoader() {
  const { workspace } = await requireWorkspace();
  const home = workspace.homeCurrency;
  const [categories, a] = await Promise.all([listCategories(workspace.id), affordability(workspace.id, home)]);
  const expense = categories.filter((c) => c.kind === "expense");
  const active = a.items.filter((i) => i.status === "wanted" || i.status === "planned");
  const rest = a.items.filter((i) => i.status === "bought" || i.status === "dropped");
  // Planned in priority order (each purchase uses room), shown by date so the list reads as a timeline.
  const plans = a.order.filter((o) => o.month).sort((x, y) => x.month!.localeCompare(y.month!));
  const blocked = a.order.filter((o) => !o.month);

  return (
    <div className="settle stack">
      <h1>wishlist</h1>
      <p className="lead">Everything you want to buy, with links. The app works out what you can afford and when, using your forecast, your buffer and your existing EMIs.</p>

      <section className="stack-sm" aria-labelledby="ord-h">
        <h2 id="ord-h">what to buy, and when</h2>
        {!a.incomeKnown && <p className="label">Income is not planned yet, so the EMI share of income cannot be checked. <Link href="/app/plan/commitments" className="link">Add your salary</Link>.</p>}
        {active.length === 0 ? (
          <div className="well empty"><h3>nothing to plan yet</h3><p>Add something you want below. Needs are planned first, then by priority.</p></div>
        ) : (
          <>
            {plans.length > 0 && (
              <ol className="plan-list">
                {plans.map((o, i) => (
                  <li key={o.id} className="well plan-item">
                    <span className="plan-item__n figure figure--s">{i + 1}</span>
                    <div>
                      <p>{o.title} <span className="label">{formatMinor(o.priceMinor, home)}</span></p>
                      <p className="label">
                        {o.method === "outright"
                          ? `pay in full in ${monthLabel(o.month!)}`
                          : `${formatMinor(o.downMinor ?? 0, home)} down in ${monthLabel(o.month!)}, then ${formatMinor(o.emiMinor ?? 0, home)} a month for ${o.tenure} months${o.interestMinor ? `, ${formatMinor(o.interestMinor, home)} of interest` : ""}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {blocked.length > 0 && <p className="label">Not affordable before {monthLabel(a.horizonEnd)} on your current plan: {blocked.map((b) => b.title).join(", ")}.</p>}
            <p className="label">Each purchase here uses up room for the next. Your buffer is {formatMinor(a.buffer, home)} and EMIs may take up to {a.maxRatioPct}% of income.</p>
          </>
        )}
        <div className="stack-sm">
          <p className="label">Largest share of income all EMIs together may take:</p>
          <RatioForm current={a.maxRatioPct} />
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="add-h">
        <h2 id="add-h">add something</h2>
        <details className="more"><summary className="pill">add to wishlist</summary><WishForm categories={expense} /></details>
      </section>

      {active.length > 0 && (
        <section className="stack-sm" aria-labelledby="items-h">
          <h2 id="items-h">on the list</h2>
          <ul className="bars">
            {active.map((i) => (
              <li key={i.id} className="well bar">
                <div className="bar__head">
                  <p>{i.title} <span className="label">{i.type}, {PRIORITY[i.priority as 1 | 2 | 3]} priority</span></p>
                  <p className="num">{formatMinor(i.priceMinor, home)}</p>
                  <span className="head-actions"><StatusSelect id={i.id} status={i.status} /><RemoveIcon kind="wish" id={i.id} label={`delete ${i.title}`} /></span>
                </div>
                <p className="label">
                  {i.outrightMonth ? `in full from ${monthLabel(i.outrightMonth)}` : "not affordable in full yet"}
                  {i.emi ? `; on emi from ${monthLabel(i.emi.month)} at ${formatMinor(i.emi.emiMinor, home)} a month for ${i.emi.tenure} months${i.emi.interestMinor ? ` (${formatMinor(i.emi.interestMinor, home)} interest)` : ""}${i.emi.ratioUnknown ? ", EMI share of income unchecked" : ""}` : i.emiTenureMonths ? "; not possible on emi yet" : ""}
                  {i.targetDate ? `. You wanted it by ${formatDayYear(i.targetDate)}${(i.outrightMonth ?? "9999") > i.targetDate.slice(0, 7) && (i.emi?.month ?? "9999") > i.targetDate.slice(0, 7) ? ", which this plan misses" : ""}` : ""}
                </p>
                {i.notes && <p className="label">{i.notes}</p>}
                <div className="chips">{i.links.map((l) => <LinkChip key={l.id} id={l.id} url={l.url} label={l.label ?? host(l.url)} price={l.priceMinor ? formatMinor(l.priceMinor, home) : null} />)}</div>
                <LinkForm itemId={i.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="stack-sm" aria-labelledby="done-h">
          <h2 id="done-h">bought and dropped</h2>
          <div className="well table-wrap">
            <table className="ledger">
              <tbody>
                {rest.map((i) => (
                  <tr key={i.id}><td>{i.title}</td><td className="num">{formatMinor(i.priceMinor, home)}</td><td><StatusSelect id={i.id} status={i.status} /></td><td><RemoveIcon kind="wish" id={i.id} label={`delete ${i.title}`} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default function Wishlist() {
  return <Suspense fallback={<PageSkeleton />}><WishlistLoader /></Suspense>;
}
