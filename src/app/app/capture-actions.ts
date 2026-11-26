"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { hasKey } from "@/server/ai/gateway";
import { parseEntryWithAi, suggestCategories } from "@/server/services/ai-features";
import { NoAmountError, addCategory, addRule, categorize, convertToTransfer, createTransfer, deleteCategory, deleteRule, importStatement, quickAdd, reconcileCash } from "@/server/services/capture";
import { listAccounts } from "@/server/services/ledger";
import { exponent, formatMinor, toMinor } from "@/lib/money";
import { shiftDays, todayISO } from "@/lib/dates";
import { pdfToTable } from "@/server/services/pdf";
import type { StatementRow } from "@/lib/statement";

export type CaptureState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): CaptureState => ({ error: e instanceof Error ? e.message : "Something went wrong" });

export async function quickAddAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { user, workspace } = await requireWorkspace();
  const input = String(fd.get("q") ?? "").trim().slice(0, 200);
  if (!input) return { error: "Type something like: chai 20 cash" };
  // An entry queued offline carries the day it was typed and a key, so a retry never adds it twice.
  const ref = String(fd.get("ref") ?? "");
  const asOf = String(fd.get("asOf") ?? "");
  const opts = {
    clientRef: /^[0-9a-f-]{36}$/i.test(ref) ? ref : undefined,
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(asOf) && asOf <= shiftDays(todayISO(), 1) && asOf >= shiftDays(todayISO(), -30) ? asOf : undefined,
  };
  try {
    let r;
    try {
      r = await quickAdd(workspace.id, workspace.homeCurrency, input, undefined, opts);
    } catch (e) {
      // Free text the local parser cannot read: ask the AI, only if this user has connected a key.
      if (!(e instanceof NoAmountError) || !(await hasKey(user.id))) throw e;
      r = await quickAdd(workspace.id, workspace.homeCurrency, input, await parseEntryWithAi(user.id, workspace.id, input), opts);
    }
    refresh();
    if (r.duplicate) return { message: "Already added" };
    return { message: `Added ${formatMinor(r.amountMinor, r.currency)} to ${r.account}${r.text ? ` for ${r.text}` : ""}${r.categorised ? "" : ", needs a category in the inbox"}` };
  } catch (e) { return fail(e); }
}

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["income", "expense"]),
  amount: z.number().positive().max(1e10),
  narration: z.string().max(500),
  ref: z.string().max(100).nullable(),
});

export async function importAction(accountId: string, filename: string, rows: StatementRow[]): Promise<CaptureState & { added?: number; merged?: number; duplicates?: number }> {
  const { workspace } = await requireWorkspace();
  const parsed = z.array(rowSchema).max(20000).safeParse(rows);
  if (!parsed.success) return { error: "That file has rows the importer could not read" };
  try {
    const r = await importStatement(workspace.id, workspace.homeCurrency, accountId, filename, parsed.data);
    refresh();
    return { added: r.added, merged: r.merged, duplicates: r.duplicates };
  } catch (e) { return fail(e); }
}

export async function categorizeAction(id: string, categoryId: string, remember: boolean): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  try {
    const n = await categorize(workspace.id, id, categoryId, remember);
    refresh();
    return { message: n > 1 ? `categorised ${n} similar entries` : "categorised" };
  } catch (e) { return fail(e); }
}

export async function transferAction(id: string, otherAccountId: string): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  try { await convertToTransfer(workspace.id, id, otherAccountId); refresh(); return { message: "Moved to a transfer" }; } catch (e) { return fail(e); }
}

export async function newTransferAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const from = String(fd.get("from")), to = String(fd.get("to"));
  const accts = await listAccounts(workspace.id);
  const cur = accts.find((a) => a.id === from)?.currency;
  const amount = cur ? toMinor(String(fd.get("amount") ?? ""), cur) : null;
  if (!amount) return { error: "Enter an amount above zero" };
  try { await createTransfer(workspace.id, from, to, amount, String(fd.get("date") || todayISO())); refresh(); return { message: "Transfer recorded" }; } catch (e) { return fail(e); }
}

export async function reconcileAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const id = String(fd.get("account"));
  const acct = (await listAccounts(workspace.id)).find((a) => a.id === id);
  const raw = Number(String(fd.get("actual") ?? "").replace(/,/g, ""));
  if (!acct || !Number.isFinite(raw) || raw < 0) return { error: "Enter the amount you actually have" };
  try {
    const r = await reconcileCash(workspace.id, id, Math.round(raw * 10 ** exponent(acct.currency)), todayISO());
    refresh();
    return { message: r.diff === 0 ? "already matches" : `${r.diff < 0 ? "booked untracked spending of" : "booked extra cash of"} ${formatMinor(Math.abs(r.diff), r.currency)}` };
  } catch (e) { return fail(e); }
}

export async function addCategoryAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const p = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(["income", "expense"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Enter a name" };
  await addCategory(workspace.id, p.data.name, p.data.kind);
  refresh();
  return { message: "Category added" };
}

export async function deleteCategoryAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteCategory(workspace.id, id);
  refresh();
}

export async function addRuleAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  try { await addRule(workspace.id, String(fd.get("pattern") ?? ""), String(fd.get("categoryId") ?? "")); refresh(); return { message: "Rule saved" }; } catch (e) { return fail(e); }
}

export async function deleteRuleAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteRule(workspace.id, id);
  refresh();
}

const MAX_PDF = 4 * 1024 * 1024;

/** Reads a bank PDF into the same table shape a CSV gives, so the column check and import are shared. */
export async function parsePdfAction(fd: FormData): Promise<{ error?: string; table?: string[][] }> {
  await requireWorkspace();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file" };
  if (file.size > MAX_PDF) return { error: "That PDF is over 4 MB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { error: "That does not look like a PDF" };
  try { return { table: await pdfToTable(bytes) }; } catch (e) { return { error: e instanceof Error ? e.message : "Could not read that PDF" }; }
}

/** Ask the AI to suggest categories for the inbox. Nothing is saved; the page shows them as one-tap choices. */
export async function suggestCategoriesAction(): Promise<{ error?: string; suggestions?: Record<string, string> }> {
  const { user, workspace } = await requireWorkspace();
  try { return { suggestions: await suggestCategories(user.id, workspace.id) }; } catch (e) { return fail(e); }
}
