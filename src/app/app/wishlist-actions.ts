"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addLink, addWish, deleteLink, deleteWish, setMaxEmiRatio, setWishStatus } from "@/server/services/wishlist";
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

export async function addWishAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const cur = workspace.homeCurrency;
  const p = z.object({
    title: z.string().trim().min(1).max(80),
    type: z.enum(["need", "want", "desire"]),
    priority: z.coerce.number().int().min(1).max(3),
  }).safeParse(Object.fromEntries(fd));
  const price = toMinor(String(fd.get("price") ?? ""), cur);
  if (!p.success || !price) return { error: "A name and a price above zero are needed" };
  const down = blank(fd.get("down")) ? toMinor(String(fd.get("down")), cur) : null;
  const tenure = num(fd.get("tenure")), rate = num(fd.get("rate"));
  if (Number.isNaN(tenure) || Number.isNaN(rate)) return { error: "Tenure and rate must be numbers" };
  if (tenure !== null && (!Number.isInteger(tenure) || tenure < 1 || tenure > 120)) return { error: "EMI tenure must be 1 to 120 months" };
  if (rate !== null && (rate < 0 || rate > 100)) return { error: "Interest rate must be between 0 and 100" };
  if (down !== null && down >= price) return { error: "The down payment must be less than the price" };
  const date = blank(fd.get("targetDate"));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Target date is not valid" };
  const link = blank(fd.get("url"));
  const url = link ? safeUrl(link) : null;
  if (link && !url) return { error: "That link does not look like a web address" };
  try {
    const id = await addWish(workspace.id, {
      title: p.data.title, priceMinor: price, type: p.data.type, priority: p.data.priority, targetDate: date, notes: blank(fd.get("notes")),
      categoryId: blank(fd.get("categoryId")), downPaymentMinor: down, emiTenureMonths: tenure, emiRatePct: rate,
    });
    if (url) await addLink(workspace.id, id, url, null, null);
    refresh();
    return { message: "Added to your wishlist" };
  } catch (e) { return fail(e); }
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

export async function setRatioAction(_: WishState, fd: FormData): Promise<WishState> {
  const { workspace } = await requireWorkspace();
  const n = num(fd.get("ratio"));
  if (n === null || Number.isNaN(n) || n < 5 || n > 100 || !Number.isInteger(n)) return { error: "Enter a whole number from 5 to 100" };
  await setMaxEmiRatio(workspace.id, n);
  refresh();
  return { message: "Saved" };
}
