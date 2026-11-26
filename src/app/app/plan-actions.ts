"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addContribution, addGoal, archiveGoal, deleteBudget, setBudget, setBuffer } from "@/server/services/planner";
import { toMinor } from "@/lib/money";
import { thisMonth, todayISO } from "@/lib/dates";

export type PlanState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): PlanState => ({ error: e instanceof Error ? e.message : "Something went wrong" });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function setBudgetAction(_: PlanState, fd: FormData): Promise<PlanState> {
  const { workspace } = await requireWorkspace();
  const amount = toMinor(String(fd.get("amount") ?? ""), workspace.homeCurrency);
  const categoryId = String(fd.get("categoryId") ?? "");
  if (!amount || !categoryId) return { error: "Pick a category and a monthly limit" };
  try { await setBudget(workspace.id, categoryId, amount, fd.get("rollover") === "on", thisMonth()); refresh(); return { message: "Budget saved" }; } catch (e) { return fail(e); }
}

export async function deleteBudgetAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteBudget(workspace.id, id);
  refresh();
}

export async function addGoalAction(_: PlanState, fd: FormData): Promise<PlanState> {
  const { workspace } = await requireWorkspace();
  const name = String(fd.get("name") ?? "").trim().slice(0, 60);
  const target = toMinor(String(fd.get("target") ?? ""), workspace.homeCurrency);
  const dateRaw = String(fd.get("targetDate") ?? "");
  const date = dateRaw ? day.safeParse(dateRaw) : null;
  if (!name || !target) return { error: "Name and target amount are needed" };
  if (date && !date.success) return { error: "Target date is not valid" };
  if (date?.success && date.data <= todayISO()) return { error: "Target date should be in the future" };
  try { await addGoal(workspace.id, name, target, date?.success ? date.data : null); refresh(); return { message: "Goal added" }; } catch (e) { return fail(e); }
}

export async function addContributionAction(_: PlanState, fd: FormData): Promise<PlanState> {
  const { workspace } = await requireWorkspace();
  const raw = String(fd.get("amount") ?? "").trim();
  const withdraw = fd.get("withdraw") === "on";
  const minor = toMinor(raw, workspace.homeCurrency);
  if (!minor) return { error: "Enter an amount above zero" };
  try { await addContribution(workspace.id, String(fd.get("goalId")), withdraw ? -minor : minor, todayISO(), null); refresh(); return { message: withdraw ? "withdrawn" : "saved" }; } catch (e) { return fail(e); }
}

export async function archiveGoalAction(id: string) {
  const { workspace } = await requireWorkspace();
  await archiveGoal(workspace.id, id);
  refresh();
}

export async function setBufferAction(_: PlanState, fd: FormData): Promise<PlanState> {
  const { workspace } = await requireWorkspace();
  const raw = String(fd.get("buffer") ?? "").trim();
  const minor = raw === "" || raw === "0" ? 0 : toMinor(raw, workspace.homeCurrency);
  if (minor === null) return { error: "Enter an amount, or 0 for none" };
  await setBuffer(workspace.id, minor);
  refresh();
  return { message: "Buffer saved" };
}
