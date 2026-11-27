import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { buildSchedule, pmt, type RevisionIn } from "@/lib/schedule";
import { occurrences } from "@/lib/recurrence";
import { matchExpected, type Candidate, type Expected } from "@/lib/match-expected";
import { shiftDays, todayISO } from "@/lib/dates";
import { rekeyDates } from "@/lib/rekey";
import { isAssetType } from "@/lib/savings";
import { convertToTransfer } from "@/server/services/transfers";

const { accounts, categories, expectedMatches, loanRevisions, loans, recurringRules, transactions } = schema;

export type ExpectedItem = {
  key: string;
  sourceKind: "loan" | "rule";
  sourceId: string;
  name: string;
  kind: "income" | "expense";
  dueOn: string;
  amountMinor: number;
  accountId: string | null;
  categoryId: string | null;
  pattern: string | null;
  /** Set for SIPs and recurring deposits: the payment moves money into this account rather than spending it. */
  transferToAccountId: string | null;
};
export type ExpectedRow = ExpectedItem & { status: "paid" | "overdue" | "upcoming"; actualMinor: number | null; transactionId: string | null };

const keyOf = (k: string, id: string, due: string) => `${k}:${id}:${due}`;

async function owns(table: typeof accounts | typeof categories, workspaceId: string, id: string | null) {
  if (!id) return;
  const [r] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.workspaceId, workspaceId)));
  if (!r) throw new Error("Not found");
}

/* ---------- loans ---------- */

export type NewLoan = {
  name: string; lender: string | null; emiMinor: number | null; firstDueOn: string; instalments: number;
  principalMinor: number | null; annualRatePct: number | null; matchPattern: string | null; accountId: string | null;
};

export async function createLoan(workspaceId: string, l: NewLoan) {
  await owns(accounts, workspaceId, l.accountId);
  // The lender's EMI is stored as given; it is only derived when you know principal and rate but not the EMI.
  const emi = l.emiMinor ?? (l.principalMinor && l.annualRatePct !== null ? pmt(l.principalMinor, l.annualRatePct, l.instalments) : null);
  if (!emi) throw new Error("Enter the EMI amount");
  const [cat] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.workspaceId, workspaceId), eq(categories.name, "EMI"), eq(categories.kind, "expense")));
  await db.insert(loans).values({
    workspaceId, name: l.name, lender: l.lender, emiMinor: emi, firstDueOn: l.firstDueOn, instalments: l.instalments,
    principalMinor: l.principalMinor, annualRatePct: l.annualRatePct === null ? null : String(l.annualRatePct),
    matchPattern: l.matchPattern, accountId: l.accountId, categoryId: cat?.id ?? null,
  });
  await autoMatch(workspaceId);
}

export const listLoans = (workspaceId: string) =>
  db.select().from(loans).where(and(eq(loans.workspaceId, workspaceId), isNull(loans.archivedAt))).orderBy(asc(loans.name));

export async function getLoan(workspaceId: string, id: string) {
  const [loan] = await db.select().from(loans).where(and(eq(loans.id, id), eq(loans.workspaceId, workspaceId)));
  if (!loan) return null;
  const revisions = await db.select().from(loanRevisions).where(eq(loanRevisions.loanId, id)).orderBy(asc(loanRevisions.effectiveOn));
  return { loan, revisions };
}

const toRevisionIn = (r: typeof loanRevisions.$inferSelect): RevisionIn | null =>
  r.kind === "emi" && r.emiMinor ? { effectiveOn: r.effectiveOn, kind: "emi", emiMinor: r.emiMinor }
  : r.kind === "rate" && r.ratePct !== null ? { effectiveOn: r.effectiveOn, kind: "rate", ratePct: Number(r.ratePct) }
  : r.kind === "prepayment" && r.amountMinor ? { effectiveOn: r.effectiveOn, kind: "prepayment", amountMinor: r.amountMinor }
  : null;

export function loanSchedule(loan: typeof loans.$inferSelect, revisions: (typeof loanRevisions.$inferSelect)[]) {
  return buildSchedule({
    firstDueOn: loan.firstDueOn, instalments: loan.instalments, emiMinor: loan.emiMinor, principalMinor: loan.principalMinor,
    annualRatePct: loan.annualRatePct === null ? null : Number(loan.annualRatePct),
    revisions: revisions.map(toRevisionIn).filter((r): r is RevisionIn => r !== null),
  });
}

export type NewRevision = { kind: "emi" | "rate" | "prepayment"; effectiveOn: string; emiMinor: number | null; ratePct: number | null; amountMinor: number | null; note: string | null };

export async function addRevision(workspaceId: string, loanId: string, r: NewRevision) {
  const found = await getLoan(workspaceId, loanId);
  if (!found) throw new Error("Loan not found");
  if ((r.kind === "rate" || r.kind === "prepayment") && found.loan.principalMinor === null) throw new Error("Add the outstanding balance to the loan first; rate and prepayment changes need it");
  await db.insert(loanRevisions).values({ workspaceId, loanId, effectiveOn: r.effectiveOn, kind: r.kind, emiMinor: r.emiMinor, ratePct: r.ratePct === null ? null : String(r.ratePct), amountMinor: r.amountMinor, note: r.note });
  await autoMatch(workspaceId);
}

export const deleteRevision = (workspaceId: string, id: string) => db.delete(loanRevisions).where(and(eq(loanRevisions.id, id), eq(loanRevisions.workspaceId, workspaceId)));
export const archiveLoan = (workspaceId: string, id: string) => db.update(loans).set({ archivedAt: new Date() }).where(and(eq(loans.id, id), eq(loans.workspaceId, workspaceId)));

/* ---------- recurring rules ---------- */

export type NewRule = {
  name: string; kind: "income" | "expense"; amountMinor: number; frequency: "weekly" | "monthly" | "yearly"; intervalCount: number;
  startOn: string; endOn: string | null; maxCount: number | null; matchPattern: string | null; accountId: string | null; categoryId: string | null;
  anchor: "start_day" | "month_end"; weekendShift: "none" | "sunday_back" | "weekend_back";
  transferToAccountId?: string | null;
};

export async function createRule(workspaceId: string, r: NewRule) {
  await owns(accounts, workspaceId, r.accountId);
  await owns(categories, workspaceId, r.categoryId);
  if (r.transferToAccountId) {
    const [dest] = await db.select({ type: accounts.type }).from(accounts).where(and(eq(accounts.id, r.transferToAccountId), eq(accounts.workspaceId, workspaceId)));
    if (!dest || !isAssetType(dest.type)) throw new Error("Pick a savings or investment account to move the money into");
    if (r.kind !== "expense") throw new Error("Only money going out can be saved into an account");
  }
  await db.insert(recurringRules).values({ workspaceId, ...r, transferToAccountId: r.transferToAccountId ?? null });
  await autoMatch(workspaceId);
}

export const listRecurring = (workspaceId: string) =>
  db.select().from(recurringRules).where(and(eq(recurringRules.workspaceId, workspaceId), isNull(recurringRules.archivedAt))).orderBy(asc(recurringRules.name));

export const archiveRule = (workspaceId: string, id: string) => db.update(recurringRules).set({ archivedAt: new Date() }).where(and(eq(recurringRules.id, id), eq(recurringRules.workspaceId, workspaceId)));

/** Moves paid links onto the new dates after an edit (see rekeyDates). */
async function rekeyMatches(workspaceId: string, sourceKind: "loan" | "rule", sourceId: string, dates: string[], tolerance: number) {
  const where = and(eq(expectedMatches.workspaceId, workspaceId), eq(expectedMatches.sourceKind, sourceKind), eq(expectedMatches.sourceId, sourceId));
  const rows = await db.select().from(expectedMatches).where(where);
  if (!rows.length) return;
  const to = rekeyDates(rows.map((r) => r.dueOn), dates, tolerance);
  if (rows.every((r) => to.get(r.dueOn) === r.dueOn)) return;
  const kept = rows.flatMap((r) => (to.get(r.dueOn) ? [{ workspaceId, sourceKind, sourceId, dueOn: to.get(r.dueOn)!, transactionId: r.transactionId }] : []));
  await db.transaction(async (tx) => {
    await tx.delete(expectedMatches).where(where);
    if (kept.length) await tx.insert(expectedMatches).values(kept);
  });
}

export async function updateRule(workspaceId: string, id: string, r: NewRule) {
  const [old] = await db.select({ id: recurringRules.id }).from(recurringRules).where(and(eq(recurringRules.id, id), eq(recurringRules.workspaceId, workspaceId)));
  if (!old) throw new Error("Not found");
  await owns(accounts, workspaceId, r.accountId);
  await owns(categories, workspaceId, r.categoryId);
  if (r.transferToAccountId) {
    const [dest] = await db.select({ type: accounts.type }).from(accounts).where(and(eq(accounts.id, r.transferToAccountId), eq(accounts.workspaceId, workspaceId)));
    if (!dest || !isAssetType(dest.type)) throw new Error("Pick a savings or investment account to move the money into");
    if (r.kind !== "expense") throw new Error("Only money going out can be saved into an account");
  }
  await db.update(recurringRules).set({ ...r, transferToAccountId: r.transferToAccountId ?? null }).where(eq(recurringRules.id, old.id));
  const today = todayISO();
  const dates = occurrences({ frequency: r.frequency, intervalCount: r.intervalCount, startOn: r.startOn, endOn: r.endOn, maxCount: r.maxCount, anchor: r.anchor, weekendShift: r.weekendShift }, shiftDays(today, -800), shiftDays(today, 400));
  await rekeyMatches(workspaceId, "rule", id, dates, r.frequency === "weekly" ? 3 : r.frequency === "monthly" ? 15 : 45);
  await autoMatch(workspaceId);
}

export async function updateLoan(workspaceId: string, id: string, l: NewLoan) {
  const [old] = await db.select({ id: loans.id }).from(loans).where(and(eq(loans.id, id), eq(loans.workspaceId, workspaceId)));
  if (!old) throw new Error("Loan not found");
  await owns(accounts, workspaceId, l.accountId);
  const emi = l.emiMinor ?? (l.principalMinor && l.annualRatePct !== null ? pmt(l.principalMinor, l.annualRatePct, l.instalments) : null);
  if (!emi) throw new Error("Enter the EMI amount");
  await db.update(loans).set({
    name: l.name, lender: l.lender, emiMinor: emi, firstDueOn: l.firstDueOn, instalments: l.instalments, principalMinor: l.principalMinor,
    annualRatePct: l.annualRatePct === null ? null : String(l.annualRatePct), matchPattern: l.matchPattern, accountId: l.accountId,
  }).where(eq(loans.id, old.id));
  const [row] = await db.select().from(loans).where(eq(loans.id, old.id));
  const revs = await db.select().from(loanRevisions).where(and(eq(loanRevisions.workspaceId, workspaceId), eq(loanRevisions.loanId, id)));
  await rekeyMatches(workspaceId, "loan", id, loanSchedule(row, revs).rows.map((x) => x.dueOn), 15);
  await autoMatch(workspaceId);
}

/* ---------- expected payments ---------- */

/** Everything the plan expects between two dates, from active loans and rules (computed, never stored). */
export async function expectedBetween(workspaceId: string, from: string, to: string): Promise<ExpectedItem[]> {
  const [ls, rs, revs] = await Promise.all([
    listLoans(workspaceId),
    listRecurring(workspaceId),
    db.select().from(loanRevisions).where(eq(loanRevisions.workspaceId, workspaceId)),
  ]);
  const out: ExpectedItem[] = [];
  for (const l of ls) {
    const { rows } = loanSchedule(l, revs.filter((r) => r.loanId === l.id));
    for (const r of rows) {
      if (r.dueOn < from || r.dueOn > to) continue;
      out.push({ key: keyOf("loan", l.id, r.dueOn), sourceKind: "loan", sourceId: l.id, name: l.name, kind: "expense", dueOn: r.dueOn, amountMinor: r.amountMinor, accountId: l.accountId, categoryId: l.categoryId, pattern: l.matchPattern, transferToAccountId: null });
    }
  }
  for (const r of rs) {
    for (const dueOn of occurrences({ frequency: r.frequency, intervalCount: r.intervalCount, startOn: r.startOn, endOn: r.endOn, maxCount: r.maxCount, anchor: r.anchor, weekendShift: r.weekendShift }, from, to)) {
      out.push({ key: keyOf("rule", r.id, dueOn), sourceKind: "rule", sourceId: r.id, name: r.name, kind: r.kind, dueOn, amountMinor: r.amountMinor, accountId: r.accountId, categoryId: r.categoryId, pattern: r.matchPattern, transferToAccountId: r.transferToAccountId });
    }
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));
}

export async function listExpected(workspaceId: string, from: string, to: string): Promise<ExpectedRow[]> {
  const [items, matches] = await Promise.all([
    expectedBetween(workspaceId, from, to),
    db.select({ sourceKind: expectedMatches.sourceKind, sourceId: expectedMatches.sourceId, dueOn: expectedMatches.dueOn, transactionId: expectedMatches.transactionId, amountMinor: transactions.amountMinor })
      .from(expectedMatches).innerJoin(transactions, eq(transactions.id, expectedMatches.transactionId))
      .where(and(eq(expectedMatches.workspaceId, workspaceId), gte(expectedMatches.dueOn, from), lte(expectedMatches.dueOn, to))),
  ]);
  const byKey = new Map(matches.map((m) => [keyOf(m.sourceKind, m.sourceId, m.dueOn), m]));
  const today = todayISO();
  return items.map((i) => {
    const m = byKey.get(i.key);
    return { ...i, status: m ? "paid" : i.dueOn < today ? "overdue" : "upcoming", actualMinor: m?.amountMinor ?? null, transactionId: m?.transactionId ?? null };
  });
}

/**
 * Pair recent unpaid expected payments with transactions. Runs from actions only (after imports, quick-add and
 * changes to loans or rules), never during render. One candidate query, matching in JS, one bulk write.
 */
export async function autoMatch(workspaceId: string) {
  const today = todayISO();
  const from = shiftDays(today, -75);
  const expected = await listExpected(workspaceId, from, shiftDays(today, 4));
  const open = expected.filter((e) => e.status !== "paid");
  if (!open.length) return 0;

  const rows = await db
    .select({ id: transactions.id, kind: transactions.kind, occurredOn: transactions.occurredOn, amountMinor: transactions.amountMinor, accountId: transactions.accountId, payee: transactions.payee, raw: transactions.rawNarration, note: transactions.note })
    .from(transactions)
    .where(and(
      eq(transactions.workspaceId, workspaceId), isNull(transactions.transferId),
      gte(transactions.occurredOn, shiftDays(from, -4)), lte(transactions.occurredOn, shiftDays(today, 4)),
      notExists(db.select({ x: sql`1` }).from(expectedMatches).where(eq(expectedMatches.transactionId, transactions.id))),
    ));
  const candidates: Candidate[] = rows.map((r) => ({ id: r.id, kind: r.kind, occurredOn: r.occurredOn, amountMinor: r.amountMinor, accountId: r.accountId, text: [r.payee, r.raw, r.note].filter(Boolean).join(" ") }));
  const pairs = matchExpected(open.map((e): Expected => ({ key: e.key, kind: e.kind, dueOn: e.dueOn, amountMinor: e.amountMinor, accountId: e.accountId, pattern: e.pattern })), candidates);
  if (!pairs.size) return 0;

  const byKey = new Map(open.map((e) => [e.key, e]));
  await db.insert(expectedMatches).values([...pairs].map(([key, transactionId]) => {
    const e = byKey.get(key)!;
    return { workspaceId, sourceKind: e.sourceKind, sourceId: e.sourceId, dueOn: e.dueOn, transactionId };
  })).onConflictDoNothing();

  // A SIP is money saved, not spent: pair the matched debit with a credit in the savings account so reports and budgets skip it.
  for (const [key, id] of pairs) {
    const e = byKey.get(key)!;
    if (!e.transferToAccountId) continue;
    try { await convertToTransfer(workspaceId, id, e.transferToAccountId); } catch (err) { console.error("could not link savings transfer", err); }
  }

  // A paid commitment is not a mystery: give uncategorised rows its category and take them out of the inbox.
  const byCategory = new Map<string, string[]>();
  for (const [key, id] of pairs) {
    const e = byKey.get(key)!;
    if (e.categoryId && !e.transferToAccountId) byCategory.set(e.categoryId, [...(byCategory.get(e.categoryId) ?? []), id]);
  }
  for (const [categoryId, ids] of byCategory) {
    await db.update(transactions).set({ categoryId, status: "confirmed" })
      .where(and(eq(transactions.workspaceId, workspaceId), isNull(transactions.categoryId), inArray(transactions.id, ids)));
  }
  return pairs.size;
}

/** Record an expected payment as paid now: creates the transaction on its due date and links it. */
export async function markPaid(workspaceId: string, sourceKind: "loan" | "rule", sourceId: string, dueOn: string) {
  const item = (await listExpected(workspaceId, dueOn, dueOn)).find((e) => e.sourceKind === sourceKind && e.sourceId === sourceId);
  if (!item) throw new Error("That payment is not in the plan");
  if (item.status === "paid") throw new Error("That payment is already recorded");
  const accts = await db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)).orderBy(asc(accounts.createdAt));
  const acct = accts.find((a) => a.id === item.accountId) ?? accts.find((a) => a.type === "bank") ?? accts[0];
  if (!acct) throw new Error("Add an account first");
  const [ws] = await db.select({ home: schema.workspaces.homeCurrency }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  if (acct.currency !== ws.home) throw new Error("Pick a home-currency account for this commitment");
  const transferId = item.transferToAccountId ? crypto.randomUUID() : null;
  await db.transaction(async (tx) => {
    const [t] = await tx.insert(transactions).values({
      workspaceId, accountId: acct.id, categoryId: transferId ? null : item.categoryId, kind: item.kind, amountMinor: item.amountMinor, currency: acct.currency,
      payee: item.name, occurredOn: item.dueOn, source: "manual", status: "confirmed", transferId,
    }).returning({ id: transactions.id });
    if (transferId && item.transferToAccountId) {
      await tx.insert(transactions).values({ workspaceId, accountId: item.transferToAccountId, kind: "income", amountMinor: item.amountMinor, currency: acct.currency, payee: item.name, occurredOn: item.dueOn, source: "manual", status: "confirmed", transferId });
    }
    await tx.insert(expectedMatches).values({ workspaceId, sourceKind, sourceId, dueOn, transactionId: t.id });
  });
}
