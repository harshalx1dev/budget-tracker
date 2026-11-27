import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { forecast, listGoals, safeToSpend } from "@/server/services/planner";
import { todayISO } from "@/lib/dates";
import { createTransaction } from "@/server/services/ledger";
import { pmt } from "@/lib/schedule";
import { bestPlan, emiTerms, emiPlan, outrightPlan, sequence, type State, type Wish } from "@/lib/affordability";

const { categories, wishlistItems, wishlistLinks, workspaces } = schema;

export type NewWish = {
  title: string; priceMinor: number; type: "need" | "want" | "desire"; priority: number; targetDate: string | null; notes: string | null;
  categoryId: string | null; downPaymentMinor: number | null; emiTenureMonths: number | null; emiRatePct: number | null; quantity?: number;
};

export async function addWish(workspaceId: string, w: NewWish) {
  if (w.categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, w.categoryId), eq(categories.workspaceId, workspaceId)));
    if (!c) throw new Error("Category not found");
  }
  if (w.emiTenureMonths !== null && w.emiRatePct === null) w.emiRatePct = 0;
  const [row] = await db.insert(wishlistItems).values({ workspaceId, ...w, emiRatePct: w.emiRatePct === null ? null : String(w.emiRatePct) }).returning({ id: wishlistItems.id });
  return row.id;
}

export async function listWishlist(workspaceId: string) {
  const items = await db.select().from(wishlistItems).where(eq(wishlistItems.workspaceId, workspaceId)).orderBy(asc(wishlistItems.priority), desc(wishlistItems.createdAt));
  const links = items.length ? await db.select().from(wishlistLinks).where(and(eq(wishlistLinks.workspaceId, workspaceId), inArray(wishlistLinks.itemId, items.map((i) => i.id)))).orderBy(asc(wishlistLinks.createdAt)) : [];
  // remainingMinor is what is still to be spent on it.
  return items.map((i) => ({ ...i, remainingMinor: i.priceMinor * Math.max(0, i.quantity - i.boughtCount), links: links.filter((l) => l.itemId === i.id) }));
}

export async function setWishStatus(workspaceId: string, id: string, status: "wanted" | "planned" | "bought" | "dropped", boughtOn: string | null) {
  // All of it is bought, or none is when something fully bought goes back on the list.
  const boughtCount = status === "bought" ? sql`${wishlistItems.quantity}` : sql`case when ${wishlistItems.boughtCount} >= ${wishlistItems.quantity} then 0 else ${wishlistItems.boughtCount} end`;
  await db.update(wishlistItems).set({ status, boughtOn: status === "bought" ? boughtOn : null, boughtCount }).where(and(eq(wishlistItems.id, id), eq(wishlistItems.workspaceId, workspaceId)));
}

async function ownItem(workspaceId: string, id: string) {
  const [it] = await db.select().from(wishlistItems).where(and(eq(wishlistItems.id, id), eq(wishlistItems.workspaceId, workspaceId)));
  if (!it) throw new Error("Item not found");
  return it;
}

/** Record that some of it has been bought. Buying the last one moves the item to bought. */
export async function buyUnits(workspaceId: string, id: string, count: number, on: string) {
  const it = await ownItem(workspaceId, id);
  const left = it.quantity - it.boughtCount;
  if (!Number.isInteger(count) || count < 1 || count > left) throw new Error(`Enter a number from 1 to ${left}`);
  const boughtCount = it.boughtCount + count;
  const done = boughtCount === it.quantity;
  await db.update(wishlistItems).set({ boughtCount, ...(done ? { status: "bought" as const, boughtOn: on } : {}) }).where(eq(wishlistItems.id, it.id));
}

/** Buying something from the list: what was really paid goes into the books, and the list counts it as bought. */
export async function recordPurchase(workspaceId: string, homeCurrency: string, v: { id: string; count: number; on: string; expense: { amountMinor: number; accountId: string; categoryId: string | null } | null }) {
  const it = await ownItem(workspaceId, v.id);
  const left = it.quantity - it.boughtCount;
  if (!Number.isInteger(v.count) || v.count < 1 || v.count > left) throw new Error(left ? `Enter a number from 1 to ${left}` : "That is already bought");
  if (v.expense) await createTransaction(workspaceId, { ...v.expense, kind: "expense", fxRateToHome: null, payee: it.title.slice(0, 80), note: "From your wishlist", occurredOn: v.on }, homeCurrency);
  await buyUnits(workspaceId, it.id, v.count, v.on);
}

export async function updateWish(workspaceId: string, id: string, w: NewWish) {
  const it = await ownItem(workspaceId, id);
  if (w.categoryId) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, w.categoryId), eq(categories.workspaceId, workspaceId)));
    if (!c) throw new Error("Category not found");
  }
  const quantity = w.quantity ?? it.quantity;
  if (quantity < it.boughtCount) throw new Error(`You have already bought ${it.boughtCount}`);
  if (w.emiTenureMonths !== null && w.emiRatePct === null) w.emiRatePct = 0;
  await db.update(wishlistItems).set({
    ...w, quantity, emiRatePct: w.emiRatePct === null ? null : String(w.emiRatePct),
    ...(it.boughtCount >= quantity ? { status: "bought" as const, boughtOn: it.boughtOn ?? todayISO() } : it.status === "bought" ? { status: "wanted" as const, boughtOn: null } : {}),
  }).where(eq(wishlistItems.id, it.id));
}

/** Go with one of the options: its price becomes the item's price. */
export async function chooseLink(workspaceId: string, linkId: string) {
  const [l] = await db.select().from(wishlistLinks).where(and(eq(wishlistLinks.id, linkId), eq(wishlistLinks.workspaceId, workspaceId)));
  if (!l?.priceMinor) throw new Error("That option has no price");
  await db.update(wishlistItems).set({ priceMinor: l.priceMinor }).where(and(eq(wishlistItems.id, l.itemId), eq(wishlistItems.workspaceId, workspaceId)));
}

export const deleteWish = (workspaceId: string, id: string) => db.delete(wishlistItems).where(and(eq(wishlistItems.id, id), eq(wishlistItems.workspaceId, workspaceId)));

export async function addLink(workspaceId: string, itemId: string, url: string, label: string | null, priceMinor: number | null) {
  const [it] = await db.select({ id: wishlistItems.id }).from(wishlistItems).where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.workspaceId, workspaceId)));
  if (!it) throw new Error("Item not found");
  await db.insert(wishlistLinks).values({ workspaceId, itemId, url, label, priceMinor });
}

export const deleteLink = (workspaceId: string, id: string) => db.delete(wishlistLinks).where(and(eq(wishlistLinks.id, id), eq(wishlistLinks.workspaceId, workspaceId)));

export async function setMaxEmiRatio(workspaceId: string, pct: number) {
  await db.update(workspaces).set({ maxEmiRatioPct: pct }).where(eq(workspaces.id, workspaceId));
}

export async function getAutoEmi(workspaceId: string) {
  const [r] = await db.select({ on: workspaces.autoEmi, overMinor: workspaces.autoEmiOverMinor, months: workspaces.autoEmiMonths, ratePct: workspaces.autoEmiRatePct }).from(workspaces).where(eq(workspaces.id, workspaceId));
  return { ...r, ratePct: Number(r.ratePct) };
}

export async function setAutoEmi(workspaceId: string, v: { on: boolean; overMinor: number; months: number; ratePct: number }) {
  if (!Number.isInteger(v.months) || v.months < 1 || v.months > 120) throw new Error("Months must be 1 to 120");
  if (!(v.ratePct >= 0 && v.ratePct <= 100)) throw new Error("Interest rate must be between 0 and 100");
  if (!Number.isInteger(v.overMinor) || v.overMinor < 0) throw new Error("Enter the amount as a number");
  await db.update(workspaces).set({ autoEmi: v.on, autoEmiOverMinor: v.overMinor, autoEmiMonths: v.months, autoEmiRatePct: String(v.ratePct) }).where(eq(workspaces.id, workspaceId));
}

const HORIZON = 24;

/** What can be bought and when, from the forecast and your rules. Plain arithmetic: no AI involved. */
async function loadState(workspaceId: string, homeCurrency: string) {
  const [fc, [ws], sts, goals] = await Promise.all([
    forecast(workspaceId, homeCurrency, HORIZON),
    db.select({ buffer: workspaces.bufferMinor, ratio: workspaces.maxEmiRatioPct, on: workspaces.autoEmi, overMinor: workspaces.autoEmiOverMinor, months: workspaces.autoEmiMonths, ratePct: workspaces.autoEmiRatePct }).from(workspaces).where(eq(workspaces.id, workspaceId)),
    safeToSpend(workspaceId, homeCurrency),
    listGoals(workspaceId),
  ]);
  // Money set aside for something else is not there to be spent: what goals hold now, and what fixed goals will take.
  const held = sts.goalSetAside;
  const ahead = (month: number) => goals.reduce((s, g) => s + (g.fixed && g.requiredMonthly ? g.requiredMonthly * Math.min(month, Math.max(0, (g.monthsLeft ?? 0) - 1)) : 0), 0);
  const state: State = {
    startBalance: fc.startBalance - held, ends: fc.rows.map((r, i) => r.end - held - ahead(i)), emiLoad: fc.emiByMonth, incomes: fc.rows.map((r) => r.income),
    upfront: fc.rows.map(() => 0), buffer: ws.buffer, maxRatioPct: ws.ratio,
  };
  return { fc, state, ws };
}

/** Judge one hypothetical purchase against the current plan, without saving anything. */
export async function checkWish(workspaceId: string, homeCurrency: string, w: Wish) {
  const { fc, state } = await loadState(workspaceId, homeCurrency);
  const o = outrightPlan(w, state), e = emiPlan(w, state);
  return {
    outrightFrom: o ? fc.rows[o.index].month : null,
    emi: e ? { from: fc.rows[e.index].month, emiMinor: e.emiMinor, tenure: e.tenure, downMinor: e.downMinor, interestMinor: e.totalInterestMinor, ratioUnknown: e.ratioUnknown } : null,
    horizonEnd: fc.rows.at(-1)!.month,
    buffer: state.buffer,
    maxEmiRatioPct: state.maxRatioPct,
    incomeKnown: fc.incomeKnown,
  };
}

export async function affordability(workspaceId: string, homeCurrency: string) {
  const [items, { fc, state, ws }] = await Promise.all([listWishlist(workspaceId), loadState(workspaceId, homeCurrency)]);
  const active = items.filter((i) => i.status === "wanted" || i.status === "planned");
  const auto = { on: ws.on, overMinor: ws.overMinor, months: ws.months, ratePct: Number(ws.ratePct) };
  const terms = new Map(active.map((i) => [i.id, emiTerms({ amountMinor: i.remainingMinor, downMinor: i.downPaymentMinor, tenure: i.emiTenureMonths, ratePct: i.emiRatePct === null ? null : Number(i.emiRatePct) }, auto)]));
  const wishes: Wish[] = active.map((i) => ({ id: i.id, title: i.title, priceMinor: i.remainingMinor, type: i.type, priority: i.priority, financing: terms.get(i.id) ?? null }));
  // What each would cost a month on those terms, whether or not the plan can fit it in yet.
  const option = (id: string, amountMinor: number) => {
    const t = terms.get(id);
    if (!t) return null;
    const monthlyMinor = pmt(amountMinor - t.downMinor, t.ratePct, t.tenure);
    return { ...t, monthlyMinor, interestMinor: Math.max(0, monthlyMinor * t.tenure - (amountMinor - t.downMinor)) };
  };
  const monthOf = (idx: number) => fc.rows[idx].month;
  const independent = new Map(wishes.map((w) => {
    const o = outrightPlan(w, state), e = emiPlan(w, state);
    return [w.id, { outright: o ? monthOf(o.index) : null, emi: e ? { month: monthOf(e.index), emiMinor: e.emiMinor, tenure: e.tenure, downMinor: e.downMinor, interestMinor: e.totalInterestMinor, ratioUnknown: e.ratioUnknown } : null, best: bestPlan(w, state) }];
  }));
  const order = sequence(wishes, state).map(({ wish, plan }) => ({
    id: wish.id,
    title: wish.title,
    priceMinor: wish.priceMinor, // still to be spent
    month: plan ? monthOf(plan.index) : null,
    method: plan?.method ?? null,
    emiMinor: plan?.method === "emi" ? plan.emiMinor : null,
    tenure: plan?.method === "emi" ? plan.tenure : null,
    downMinor: plan?.method === "emi" ? plan.downMinor : null,
    interestMinor: plan?.method === "emi" ? plan.totalInterestMinor : null,
  }));
  return {
    items: items.map((i) => ({ ...i, emiOption: option(i.id, i.remainingMinor), ...(independent.get(i.id) ? { outrightMonth: independent.get(i.id)!.outright, emi: independent.get(i.id)!.emi } : { outrightMonth: null, emi: null }) })),
    order,
    buffer: ws.buffer,
    maxRatioPct: ws.ratio,
    incomeKnown: fc.incomeKnown,
    horizonEnd: fc.rows.at(-1)!.month,
  };
}
