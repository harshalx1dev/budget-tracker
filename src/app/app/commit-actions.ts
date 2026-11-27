"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/server/session";
import { addRevision, archiveLoan, archiveRule, autoMatch, createLoan, createRule, deleteRevision, markPaid, updateLoan, updateRule } from "@/server/services/commitments";
import { toMinor } from "@/lib/money";

export type CommitState = { error?: string; message?: string };

const refresh = () => revalidatePath("/app", "layout");
const fail = (e: unknown): CommitState => ({ error: e instanceof Error ? e.message : "Something went wrong" });

const blank = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date");
const num = (s: unknown) => { const t = blank(s); if (t === null) return null; const n = Number(t.replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };

export async function addLoanAction(_: CommitState, fd: FormData): Promise<CommitState> {
  const { workspace } = await requireWorkspace();
  const cur = workspace.homeCurrency;
  const name = blank(fd.get("name"));
  const firstDueOn = day.safeParse(fd.get("firstDueOn"));
  const instalments = num(fd.get("instalments"));
  const emi = blank(fd.get("emi")), principal = blank(fd.get("principal"));
  const rate = num(fd.get("rate"));
  if (!name || !firstDueOn.success || !instalments || !Number.isInteger(instalments) || instalments < 1 || instalments > 600) return { error: "Name, next due date and instalments left (a whole number) are needed" };
  if (Number.isNaN(rate) || (rate !== null && (rate < 0 || rate > 100))) return { error: "Interest rate must be between 0 and 100" };
  const emiMinor = emi ? toMinor(emi, cur) : null;
  const principalMinor = principal ? toMinor(principal, cur) : null;
  if ((emi && !emiMinor) || (principal && !principalMinor)) return { error: "Amounts must be above zero" };
  try {
    const loan = { name, lender: blank(fd.get("lender")), emiMinor, firstDueOn: firstDueOn.data, instalments, principalMinor, annualRatePct: rate, matchPattern: blank(fd.get("pattern")), accountId: blank(fd.get("accountId")) };
    const id = blank(fd.get("id"));
    if (id) await updateLoan(workspace.id, id, loan); else await createLoan(workspace.id, loan);
    refresh();
    return { message: id ? "Saved" : "Loan added" };
  } catch (e) { return fail(e); }
}

export async function addRevisionAction(_: CommitState, fd: FormData): Promise<CommitState> {
  const { workspace } = await requireWorkspace();
  const kind = z.enum(["emi", "rate", "prepayment"]).safeParse(fd.get("kind"));
  const effectiveOn = day.safeParse(fd.get("effectiveOn"));
  const value = num(fd.get("value"));
  if (!kind.success || !effectiveOn.success || value === null || Number.isNaN(value) || value < 0) return { error: "Pick what changed, the date, and a value" };
  const cur = workspace.homeCurrency;
  const minor = kind.data === "rate" ? null : toMinor(String(value), cur);
  if (kind.data !== "rate" && !minor) return { error: "Amount must be above zero" };
  if (kind.data === "rate" && value > 100) return { error: "Interest rate must be between 0 and 100" };
  try {
    await addRevision(workspace.id, String(fd.get("loanId")), {
      kind: kind.data, effectiveOn: effectiveOn.data,
      emiMinor: kind.data === "emi" ? minor : null, amountMinor: kind.data === "prepayment" ? minor : null, ratePct: kind.data === "rate" ? value : null,
      note: blank(fd.get("note")),
    });
    refresh();
    return { message: "Change recorded" };
  } catch (e) { return fail(e); }
}

export async function removeRevisionAction(id: string) {
  const { workspace } = await requireWorkspace();
  await deleteRevision(workspace.id, id);
  refresh();
}

export async function archiveLoanAction(id: string) {
  const { workspace } = await requireWorkspace();
  await archiveLoan(workspace.id, id);
  refresh();
}

export async function addRecurringAction(_: CommitState, fd: FormData): Promise<CommitState> {
  const { workspace } = await requireWorkspace();
  const p = z.object({
    name: z.string().trim().min(1).max(60),
    kind: z.enum(["income", "expense"]),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    startOn: day,
    anchor: z.enum(["start_day", "month_end"]).default("start_day"),
    weekendShift: z.enum(["none", "sunday_back", "weekend_back"]).default("none"),
  }).safeParse(Object.fromEntries(fd));
  const amountMinor = toMinor(String(fd.get("amount") ?? ""), workspace.homeCurrency);
  const every = num(fd.get("every")) ?? 1;
  const endOn = blank(fd.get("endOn"));
  const count = num(fd.get("count"));
  if (!p.success || !amountMinor) return { error: "Name, amount and start date are needed" };
  if (!Number.isInteger(every) || every < 1 || every > 60) return { error: "Repeat interval must be a whole number" };
  if (endOn && !day.safeParse(endOn).success) return { error: "End date is not valid" };
  if (count !== null && (!Number.isInteger(count) || count < 1)) return { error: "Number of times must be a whole number" };
  if (endOn && endOn < p.data.startOn) return { error: "End date is before the start" };
  try {
    const rule = { ...p.data, amountMinor, intervalCount: every, endOn, maxCount: count, matchPattern: blank(fd.get("pattern")), accountId: blank(fd.get("accountId")), categoryId: blank(fd.get("categoryId")), transferToAccountId: blank(fd.get("intoAccountId")) };
    const id = blank(fd.get("id"));
    if (id) await updateRule(workspace.id, id, rule); else await createRule(workspace.id, rule);
    refresh();
    return { message: id ? "Saved" : "Recurring item added" };
  } catch (e) { return fail(e); }
}

export async function archiveRecurringAction(id: string) {
  const { workspace } = await requireWorkspace();
  await archiveRule(workspace.id, id);
  refresh();
}

export async function markPaidAction(sourceKind: "loan" | "rule", sourceId: string, dueOn: string): Promise<CommitState> {
  const { workspace } = await requireWorkspace();
  try { await markPaid(workspace.id, sourceKind, sourceId, dueOn); refresh(); return { message: "Recorded" }; } catch (e) { return fail(e); }
}

export async function matchNowAction(): Promise<CommitState> {
  const { workspace } = await requireWorkspace();
  const n = await autoMatch(workspace.id);
  refresh();
  return { message: n ? `matched ${n} payment${n === 1 ? "" : "s"}` : "nothing new to match" };
}
