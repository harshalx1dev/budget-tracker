"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { createAccount, createTransaction, deleteTransaction, listAccounts } from "@/server/services/ledger";
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
  if (!p.success) return { error: "check the form and try again" };
  const { amount, fx, ...rest } = p.data;
  if (fx && !(Number(fx) > 0)) return { error: "exchange rate must be a positive number" };
  try {
    // Account currency is resolved in the service; the amount's exponent follows it.
    const acct = (await listAccounts(workspace.id)).find((a) => a.id === rest.accountId);
    if (!acct) return { error: "account not found" };
    const amountMinor = toMinor(amount, acct.currency);
    if (!amountMinor) return { error: "enter an amount above zero" };
    await createTransaction(workspace.id, { ...rest, amountMinor, fxRateToHome: fx }, workspace.homeCurrency);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "could not save" };
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
  type: z.enum(["cash", "bank", "card", "wallet"]),
  currency: z.enum(CURRENCIES),
  opening: z.string().trim(),
});

export async function addAccount(_: FormState, fd: FormData): Promise<FormState> {
  const { workspace } = await requireWorkspace();
  const p = accountSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "check the form and try again" };
  const { opening, currency, ...rest } = p.data;
  const openingBalanceMinor = opening ? toMinor(opening, currency) : 0;
  if (openingBalanceMinor === null) return { error: "opening balance must be a number" };
  await createAccount(workspace.id, { ...rest, currency, openingBalanceMinor });
  revalidatePath("/app", "layout");
  return { ok: true };
}
