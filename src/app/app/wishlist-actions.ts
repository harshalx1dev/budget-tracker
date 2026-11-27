"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addLink, addWish, chooseLink, deleteLink, deleteWish, recordPurchase, setAutoEmi, setMaxEmiRatio, setWishStatus, updateWish, type NewWish } from "@/server/services/wishlist";
import { toMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export type WishState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): WishState => ({ error: e instanceof Error ? e.message : "Something went wrong" });
const blank = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => { const t = blank(v); if (t === null) return null; const n = Number(t.replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };
const safeUrl = (raw: string) => {
  try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null; } catch { return null; }
};

/** The fields shared by adding and editing. */
function readWish(fd: FormData, cur: string): { error: string } | { wish: NewWish } {
  const p = z.object({
    title: z.string().trim().min(1).max(80),
    type: z.enum(["need", "want", "desire"]),
    priority: z.coerce.number().int().min(1).max(3),
    quantity: z.coerce.number().int().min(1).max(999),
  }).safeParse({ quantity: 1, ...Object.fromEntries(fd) });
  const price = toMinor(String(fd.get("price") ?? ""), cur);
  if (!p.success || !price) return { error: "A name, a price above zero and a quantity from 1 to 999 are needed" };
  const down = blank(fd.get("down")) ? toMinor(String(fd.get("down")), cur) : null;
  const tenure = num(fd.get("tenure")), rate = num(fd.get("rate"));
  if (Number.isNaN(tenure) || Number.isNaN(rate)) return { error: "Tenure and rate must be numbers" };
  if (tenure !== null && (!Number.isInteger(tenure) || tenure < 1 || tenure > 120)) return { error: "EMI tenure must be 1 to 120 months" };
  if (rate !== null && (rate < 0 || rate > 100)) return { error: "Interest rate must be between 0 and 100" };
  if (down !== null && down >= price * p.data.quantity) return { error: "The down payment must be less than the price" };
  const date = blank(fd.get("targetDate"));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Target date is not valid" };
  return {
    wish: {
      title: p.data.title, priceMinor: price, quantity: p.data.quantity, type: p.data.type, priority: p.data.priority, targetDate: date,
      notes: blank(fd.get("notes"))?.slice(0, 300) ?? null, categoryId: blank(fd.get("categoryId")), downPaymentMinor: down, emiTenureMonths: tenure, emiRatePct: rate,
    },
  };
}

export async function addWishAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const read = readWish(fd, workspace.homeCurrency);
  if ("error" in read) return read;
  const link = blank(fd.get("url"));
  const url = link ? safeUrl(link) : null;
  if (link && !url) return { error: "That link does not look like a web address" };
  try {
    const id = await addWish(workspace.id, read.wish);
    if (url) await addLink(workspace.id, id, url, null, null);
    refresh();
    return { message: "Added to your wishlist" };
  } catch (e) { return fail(e); }
}

export async function updateWishAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const read = readWish(fd, workspace.homeCurrency);
  if ("error" in read) return read;
  try { await updateWish(workspace.id, String(fd.get("id") ?? ""), read.wish); refresh(); return { message: "Saved" }; } catch (e) { return fail(e); }
}

export async function purchaseAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const record = fd.get("record") === "on";
  const on = record ? String(fd.get("date") ?? "") : todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || on > todayISO()) return { error: "Pick the day you bought it" };
  const amountMinor = record ? toMinor(String(fd.get("paid") ?? ""), workspace.homeCurrency) : null;
  if (record && !amountMinor) return { error: "Enter what you paid" };
  const accountId = String(fd.get("accountId") ?? "");
  if (record && !accountId) return { error: "Pick the account you paid from" };
  try {
    await recordPurchase(workspace.id, workspace.homeCurrency, { id: String(fd.get("id") ?? ""), count: Number(fd.get("count")), on, expense: amountMinor ? { amountMinor, accountId, categoryId: blank(fd.get("categoryId")) } : null });
    refresh();
    return { message: "Marked as bought" };
  } catch (e) { return fail(e); }
}

export async function chooseLinkAction(id: string) {
  const { workspace } = await requireWorkspace();
  await chooseLink(workspace.id, id);
  refresh();
}

export async function addLinkAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const raw = blank(fd.get("url"));
  const url = raw ? safeUrl(raw) : null;
  if (!url) return { error: "Paste a web address" };
  const priceRaw = blank(fd.get("price"));
  const price = priceRaw ? toMinor(priceRaw, workspace.homeCurrency) : null;
  if (priceRaw && !price) return { error: "Price must be above zero" };
  try { await addLink(workspace.id, String(fd.get("itemId")), url, blank(fd.get("label"))?.slice(0, 60) ?? null, price); refresh(); return { message: "Link saved" }; } catch (e) { return fail(e); }
}

export async function removeLinkAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteLink(workspace.id, id);
  refresh();
}

export async function setStatusAction(id: string, status: "wanted" | "planned" | "bought" | "dropped") {
  const { workspace } = await requireWorkspace();
  await setWishStatus(workspace.id, id, status, status === "bought" ? todayISO() : null);
  refresh();
}

export async function removeWishAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteWish(workspace.id, id);
  refresh();
}

export async function setAutoEmiAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const over = toMinor(String(fd.get("over") ?? ""), workspace.homeCurrency);
  const months = num(fd.get("months")), rate = num(fd.get("rate"));
  if (!over || months === null || rate === null || Number.isNaN(months) || Number.isNaN(rate)) return { error: "Fill in the amount, the months and the rate" };
  try { await setAutoEmi(workspace.id, { on: fd.get("on") === "on", overMinor: over, months, ratePct: rate }); refresh(); return { message: "Saved" }; } catch (e) { return fail(e); }
}

export async function setRatioAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const n = num(fd.get("ratio"));
  if (n === null || Number.isNaN(n) || n < 5 || n > 100 || !Number.isInteger(n)) return { error: "Enter a whole number from 5 to 100" };
  await setMaxEmiRatio(workspace.id, n);
  refresh();
  return { message: "Saved" };
}
