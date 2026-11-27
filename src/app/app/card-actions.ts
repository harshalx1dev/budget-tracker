"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/server/session";
import { setCardCycle } from "@/server/services/cards";
import { createTransfer } from "@/server/services/transfers";
import { toMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export type CardState = { error?: string; message?: string };

const fail = (e: unknown): CardState => ({ error: e instanceof Error ? e.message : "Something went wrong" });
const day = (v: FormDataEntryValue | null) => (String(v ?? "").trim() ? Number(v) : null);

export async function setCardCycleAction(_: CardState, fd: FormData): Promise<CardState> {
  const { workspace } = await requireWorkspace();
  try {
    await setCardCycle(workspace.id, String(fd.get("accountId") ?? ""), day(fd.get("statementDay")), day(fd.get("dueDay")));
    revalidatePath("/app", "layout");
    return { message: "Saved" };
  } catch (e) { return fail(e); }
}

export async function payCardAction(_: CardState, fd: FormData): Promise<CardState> {
  const { workspace } = await requireWorkspace();
  const amount = toMinor(String(fd.get("amount") ?? ""), workspace.homeCurrency);
  if (!amount) return { error: "Enter an amount above zero" };
  try {
    // Paying a card moves money to it; the spending was already recorded when the card was used.
    await createTransfer(workspace.id, String(fd.get("fromId") ?? ""), String(fd.get("accountId") ?? ""), amount, todayISO());
    revalidatePath("/app", "layout");
    return { message: "Payment recorded" };
  } catch (e) { return fail(e); }
}
