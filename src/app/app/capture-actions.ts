"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addCategory, addRule, categorize, convertToTransfer, createTransfer, deleteCategory, deleteRule, importStatement, quickAdd, reconcileCash } from "@/server/services/capture";
import { listAccounts } from "@/server/services/ledger";
import { exponent, formatMinor, toMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { pdfToTable } from "@/server/services/pdf";
import type { StatementRow } from "@/lib/statement";

export type CaptureState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): CaptureState => ({ error: e instanceof Error ? e.message : "something went wrong" });

export async function quickAddAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const input = String(fd.get("q") ?? "").trim().slice(0, 200);
  if (!input) return { error: "type something like: chai 20 cash" };
  try {
    const r = await quickAdd(workspace.id, workspace.homeCurrency, input);
    refresh();
    return { message: `added ${formatMinor(r.amountMinor, r.currency)} to ${r.account}${r.text ? ` for ${r.text}` : ""}${r.categorised ? "" : ", needs a category in the inbox"}` };
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
  if (!parsed.success) return { error: "that file has rows the importer could not read" };
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
  try { await convertToTransfer(workspace.id, id, otherAccountId); refresh(); return { message: "moved to a transfer" }; } catch (e) { return fail(e); }
}

export async function newTransferAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const from = String(fd.get("from")), to = String(fd.get("to"));
  const accts = await listAccounts(workspace.id);
  const cur = accts.find((a) => a.id === from)?.currency;
  const amount = cur ? toMinor(String(fd.get("amount") ?? ""), cur) : null;
  if (!amount) return { error: "enter an amount above zero" };
  try { await createTransfer(workspace.id, from, to, amount, String(fd.get("date") || todayISO())); refresh(); return { message: "transfer recorded" }; } catch (e) { return fail(e); }
}

export async function reconcileAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const id = String(fd.get("account"));
  const acct = (await listAccounts(workspace.id)).find((a) => a.id === id);
  const raw = Number(String(fd.get("actual") ?? "").replace(/,/g, ""));
  if (!acct || !Number.isFinite(raw) || raw < 0) return { error: "enter the amount you actually have" };
  try {
    const r = await reconcileCash(workspace.id, id, Math.round(raw * 10 ** exponent(acct.currency)), todayISO());
    refresh();
    return { message: r.diff === 0 ? "already matches" : `${r.diff < 0 ? "booked untracked spending of" : "booked extra cash of"} ${formatMinor(Math.abs(r.diff), r.currency)}` };
  } catch (e) { return fail(e); }
}

export async function addCategoryAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  const p = z.object({ name: z.string().trim().min(1).max(40), kind: z.enum(["income", "expense"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "enter a name" };
  await addCategory(workspace.id, p.data.name, p.data.kind);
  refresh();
  return { message: "category added" };
}

export async function deleteCategoryAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteCategory(workspace.id, id);
  refresh();
}

export async function addRuleAction(_: CaptureState, fd: FormData): Promise<CaptureState> {
  const { workspace } = await requireWorkspace();
  try { await addRule(workspace.id, String(fd.get("pattern") ?? ""), String(fd.get("categoryId") ?? "")); refresh(); return { message: "rule saved" }; } catch (e) { return fail(e); }
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
  if (!(file instanceof File) || file.size === 0) return { error: "choose a PDF file" };
  if (file.size > MAX_PDF) return { error: "that PDF is over 4 MB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { error: "that does not look like a PDF" };
  try { return { table: await pdfToTable(bytes) }; } catch (e) { return { error: e instanceof Error ? e.message : "could not read that PDF" }; }
}
