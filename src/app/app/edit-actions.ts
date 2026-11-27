"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/session";
import { renameCategory, updateAccount, updateTransaction } from "@/server/services/ledger";
import { autoMatch } from "@/server/services/commitments";
import { toMinor } from "@/lib/money";

export type EditState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): EditState => ({ error: e instanceof Error ? e.message : "Something went wrong" });
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max) || null;
/** Zero or a positive amount; null when it is not a number. */
const amount = (raw: string, currency: string) => (Number(raw.replace(/,/g, "")) === 0 ? 0 : toMinor(raw, currency));

export async function updateAccountAction(_: EditState, fd: FormData): Promise<EditState> {
  const { workspace } = await requireWorkspace();
  const name = text(fd.get("name"), 40);
  if (!name) return { error: "The account needs a name" };
  const raw = String(fd.get("balance") ?? "").trim();
  const entered = raw === "" ? null : amount(raw.replace(/^-/, ""), workspace.homeCurrency);
  if (raw !== "" && entered === null) return { error: "Enter the amount as a number" };
  try {
    await updateAccount(workspace.id, String(fd.get("id") ?? ""), {
      name,
      aliases: String(fd.get("aliases") ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean).slice(0, 12),
      // an overdrawn account can be typed with a minus sign; a card's figure is what is owed
      balanceMinor: entered === null ? null : raw.startsWith("-") ? -entered : entered,
    });
    refresh();
    return { message: "Saved" };
  } catch (e) { return fail(e); }
}

export async function updateTransactionAction(_: EditState, fd: FormData): Promise<EditState> {
  const { workspace } = await requireWorkspace();
  const occurredOn = String(fd.get("occurredOn") ?? "");
  const amountMinor = toMinor(String(fd.get("amount") ?? ""), String(fd.get("currency") ?? workspace.homeCurrency));
  if (!amountMinor || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return { error: "An amount above zero and a date are needed" };
  const kind = fd.get("kind") === "income" ? "income" : "expense";
  try {
    await updateTransaction(workspace.id, String(fd.get("id") ?? ""), {
      amountMinor, occurredOn, kind, accountId: text(fd.get("accountId"), 60), categoryId: text(fd.get("categoryId"), 60), payee: text(fd.get("payee"), 80), note: text(fd.get("note"), 200),
    });
    await autoMatch(workspace.id);
    refresh();
    return { message: "Saved" };
  } catch (e) { return fail(e); }
}

export async function renameCategoryAction(_: EditState, fd: FormData): Promise<EditState> {
  const { workspace } = await requireWorkspace();
  const name = text(fd.get("name"), 40);
  if (!name) return { error: "The category needs a name" };
  try { await renameCategory(workspace.id, String(fd.get("id") ?? ""), name); refresh(); return { message: "Saved" }; } catch (e) { return fail(e); }
}
