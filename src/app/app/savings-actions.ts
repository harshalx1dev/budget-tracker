"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addValuation, archiveDeposit, createAsset, createDeposit, updateDeposit, recordMaturity, setEmergency } from "@/server/services/savings";
import { isAssetType } from "@/lib/savings";
import { toMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";

export type SavingsState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): SavingsState => ({ error: e instanceof Error ? e.message : "Something went wrong" });
const blank = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = (v: unknown) => { const t = blank(v); if (t === null) return null; const n = Number(t.replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };

export async function addAssetAction(_: SavingsState, fd: FormData): Promise<SavingsState> {
  const { workspace } = await requireWorkspace();
  const name = blank(fd.get("name"))?.slice(0, 60);
  const type = String(fd.get("type") ?? "");
  const invested = blank(fd.get("invested")), value = blank(fd.get("value"));
  const investedMinor = invested ? toMinor(invested, workspace.homeCurrency) : 0;
  const valueMinor = value ? toMinor(value, workspace.homeCurrency) : null;
  if (!name || !isAssetType(type) || investedMinor === null || (value && !valueMinor)) return { error: "Name, type and amounts above zero are needed" };
  try { await createAsset(workspace.id, workspace.homeCurrency, { name, type, investedMinor, valueMinor }); refresh(); return { message: "Added" }; } catch (e) { return fail(e); }
}

export async function addValuationAction(_: SavingsState, fd: FormData): Promise<SavingsState> {
  const { workspace } = await requireWorkspace();
  const value = toMinor(String(fd.get("value") ?? ""), workspace.homeCurrency);
  const date = day.safeParse(String(fd.get("on") || todayISO()));
  if (!value || !date.success || date.data > todayISO()) return { error: "Enter what it is worth now, as an amount above zero" };
  try { await addValuation(workspace.id, workspace.homeCurrency, String(fd.get("accountId")), date.data, value); refresh(); return { message: "Value saved" }; } catch (e) { return fail(e); }
}

export async function addDepositAction(_: SavingsState, fd: FormData): Promise<SavingsState> {
  const { workspace } = await requireWorkspace();
  const cur = workspace.homeCurrency;
  const name = blank(fd.get("name"))?.slice(0, 60);
  const principal = toMinor(String(fd.get("principal") ?? ""), cur);
  const rate = num(fd.get("rate"));
  const startOn = day.safeParse(String(fd.get("startOn") ?? "")), maturityOn = day.safeParse(String(fd.get("maturityOn") ?? ""));
  const stated = blank(fd.get("maturityAmount"));
  const maturityMinor = stated ? toMinor(stated, cur) : null;
  if (!name || !principal || rate === null || Number.isNaN(rate) || rate < 0 || rate > 30 || !startOn.success || !maturityOn.success || (stated && !maturityMinor)) return { error: "Name, amount, interest rate (0 to 30) and both dates are needed" };
  try {
    const id = blank(fd.get("id"));
    const deposit = { name, principalMinor: principal, annualRatePct: rate, startOn: startOn.data, maturityOn: maturityOn.data, maturityMinor, payoutAccountId: blank(fd.get("payoutAccountId")) };
    if (id) await updateDeposit(workspace.id, cur, id, deposit); else await createDeposit(workspace.id, cur, { ...deposit });
    refresh();
    return { message: id ? "Saved" : "Deposit added" };
  } catch (e) { return fail(e); }
}

export async function recordMaturityAction(id: string): Promise<SavingsState> {
  const { workspace } = await requireWorkspace();
  try { await recordMaturity(workspace.id, workspace.homeCurrency, id); refresh(); return { message: "Recorded" }; } catch (e) { return fail(e); }
}

export async function archiveDepositAction(id: string) {
  const { workspace } = await requireWorkspace();
  await archiveDeposit(workspace.id, id);
  refresh();
}

export async function setEmergencyAction(_: SavingsState, fd: FormData): Promise<SavingsState> {
  const { workspace } = await requireWorkspace();
  const months = num(fd.get("months"));
  if (months === null || Number.isNaN(months) || !Number.isInteger(months) || months < 1 || months > 24) return { error: "Months must be a whole number from 1 to 24" };
  try { await setEmergency(workspace.id, months, blank(fd.get("accountId"))); refresh(); return { message: "Saved" }; } catch (e) { return fail(e); }
}
