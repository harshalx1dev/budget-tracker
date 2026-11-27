import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { forecast, listGoals, safeToSpend } from "@/server/services/planner";
import { bestPlan, emiPlan, outrightPlan, sequence, type State, type Wish } from "@/lib/affordability";

const { categories, wishlistItems, wishlistLinks, workspaces } = schema;

export type NewWish = {
  title: string; priceMinor: number; type: "need" | "want" | "desire"; priority: number; targetDate: string | null; notes: string | null;
  categoryId: string | null; downPaymentMinor: number | null; emiTenureMonths: number | null; emiRatePct: number | null;
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
  return items.map((i) => ({ ...i, links: links.filter((l) => l.itemId === i.id) }));
}

export async function setWishStatus(workspaceId: string, id: string, status: "wanted" | "planned" | "bought" | "dropped", boughtOn: string | null) {
  await db.update(wishlistItems).set({ status, boughtOn: status === "bought" ? boughtOn : null }).where(and(eq(wishlistItems.id, id), eq(wishlistItems.workspaceId, workspaceId)));
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

const HORIZON = 24;

/** What can be bought and when, from the forecast and your rules. Plain arithmetic: no AI involved. */
async function loadState(workspaceId: string, homeCurrency: string) {
  const [fc, [ws], sts, goals] = await Promise.all([
    forecast(workspaceId, homeCurrency, HORIZON),
    db.select({ buffer: workspaces.bufferMinor, ratio: workspaces.maxEmiRatioPct }).from(workspaces).where(eq(workspaces.id, workspaceId)),
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
  const wishes: Wish[] = active.map((i) => ({
    id: i.id, title: i.title, priceMinor: i.priceMinor, type: i.type, priority: i.priority,
    financing: i.emiTenureMonths ? { downMinor: i.downPaymentMinor ?? 0, tenure: i.emiTenureMonths, ratePct: Number(i.emiRatePct ?? 0) } : null,
  }));
  const monthOf = (idx: number) => fc.rows[idx].month;
  const independent = new Map(wishes.map((w) => {
    const o = outrightPlan(w, state), e = emiPlan(w, state);
    return [w.id, { outright: o ? monthOf(o.index) : null, emi: e ? { month: monthOf(e.index), emiMinor: e.emiMinor, tenure: e.tenure, downMinor: e.downMinor, interestMinor: e.totalInterestMinor, ratioUnknown: e.ratioUnknown } : null, best: bestPlan(w, state) }];
  }));
  const order = sequence(wishes, state).map(({ wish, plan }) => ({
    id: wish.id,
    title: wish.title,
    priceMinor: wish.priceMinor,
    month: plan ? monthOf(plan.index) : null,
    method: plan?.method ?? null,
    emiMinor: plan?.method === "emi" ? plan.emiMinor : null,
    tenure: plan?.method === "emi" ? plan.tenure : null,
    downMinor: plan?.method === "emi" ? plan.downMinor : null,
    interestMinor: plan?.method === "emi" ? plan.totalInterestMinor : null,
  }));
  return {
    items: items.map((i) => ({ ...i, ...(independent.get(i.id) ? { outrightMonth: independent.get(i.id)!.outright, emi: independent.get(i.id)!.emi } : { outrightMonth: null, emi: null }) })),
    order,
    buffer: ws.buffer,
    maxRatioPct: ws.ratio,
    incomeKnown: fc.incomeKnown,
    horizonEnd: fc.rows.at(-1)!.month,
  };
}
