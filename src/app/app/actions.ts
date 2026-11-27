"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { createAccount, createTransaction, deleteTransaction, listAccounts } from "@/server/services/ledger";
import { autoMatch } from "@/server/services/commitments";
import { CURRENCIES, toMinor } from "@/lib/money";

export type FormState = { error?: string; ok?: boolean };

const text = (max: number) => z.string().trim().max(max).transform((s) => s || null);

const txSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().transform((s) => s || null),
  kind: z.enum(["income", "expense"]),
  amount: z.string(),
  fx: z.string().transform((s) => s.trim() || null),
  payee: text(80),
  note: text(200),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function addTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const p = txSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Check the form and try again" };
  const { amount, fx, ...rest } = p.data;
  if (fx && !(Number(fx) > 0)) return { error: "Exchange rate must be a positive number" };
  try {
    // Account currency is resolved in the service; the amount's exponent follows it.
    const acct = (await listAccounts(workspace.id)).find((a) => a.id === rest.accountId);
    if (!acct) return { error: "Account not found" };
    const amountMinor = toMinor(amount, acct.currency);
    if (!amountMinor) return { error: "Enter an amount above zero" };
    await createTransaction(workspace.id, { ...rest, amountMinor, fxRateToHome: fx }, workspace.homeCurrency);
    await autoMatch(workspace.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save" };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeTransaction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteTransaction(workspace.id, id);
  revalidatePath("/app", "layout");
}

const accountSchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(["cash", "bank", "card", "wallet", "savings", "fd", "mutual_fund", "stocks", "retirement", "gold", "other_asset"]),
  currency: z.enum(CURRENCIES),
  opening: z.string().trim(),
  aliases: z.string().trim().max(80).transform((s) => s.toLowerCase().split(/[\s,]+/).filter(Boolean)),
});

export async function addAccount(_: FormState, fd: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const p = accountSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Check the form and try again" };
  const { opening, currency, ...rest } = p.data;
  const entered = opening && Number(opening.replace(/,/g, "")) !== 0 ? toMinor(opening, currency) : 0;
  if (entered === null) return { error: "Enter the amount as a number above zero, or leave it empty" };
  // On a card the figure typed is what is owed, which counts against you.
  const card = rest.type === "card";
  const day = (name: string) => Number(String(fd.get(name) ?? "").trim()) || null;
  const statementDay = card ? day("statementDay") : null, dueDay = card ? day("dueDay") : null;
  const validDay = (d: number | null) => d === null || (Number.isInteger(d) && d >= 1 && d <= 31);
  if (!validDay(statementDay) || !validDay(dueDay) || (statementDay === null) !== (dueDay === null)) return { error: "Give both card days, each between 1 and 31, or neither" };
  await createAccount(workspace.id, { ...rest, currency, openingBalanceMinor: card && entered ? -entered : entered, statementDay, dueDay });
  revalidatePath("/app", "layout");
  return { ok: true };
}
