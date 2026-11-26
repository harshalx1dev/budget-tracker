import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { listAccounts } from "@/server/services/ledger";
import { getLoan, listLoans, loanSchedule } from "@/server/services/commitments";
import { createTransfer } from "@/server/services/transfers";
import { ASSET_TYPES, emergencyStatus, fdMaturityEstimate, fdValue, isAssetType, netWorth } from "@/lib/savings";
import { addMonths, daysBetween, todayISO } from "@/lib/dates";
import { thisMonth } from "@/lib/dates";

const { accountValuations, accounts, categories, fixedDeposits, netWorthSnapshots, transactions, workspaces } = schema;

/* ---------- values of savings and investments ---------- */

export type AssetRow = { id: string; name: string; type: string; currency: string; investedMinor: number; valueMinor: number; gainMinor: number; valuedOn: string | null };

/**
 * Each savings or investment account: what went in (opening balance plus transfers) and what it is worth now,
 * from the latest value you entered, or for a fixed deposit its accrued value, or else what went in.
 */
export async function listAssets(workspaceId: string): Promise<AssetRow[]> {
  const accts = (await listAccounts(workspaceId)).filter((a) => isAssetType(a.type));
  if (!accts.length) return [];
  const ids = accts.map((a) => a.id);
  const [vals, deposits] = await Promise.all([
    db.select().from(accountValuations).where(and(eq(accountValuations.workspaceId, workspaceId), inArray(accountValuations.accountId, ids), lte(accountValuations.onDate, todayISO()))).orderBy(desc(accountValuations.onDate)),
    db.select().from(fixedDeposits).where(and(eq(fixedDeposits.workspaceId, workspaceId), isNull(fixedDeposits.archivedAt))),
  ]);
  const today = todayISO();
  return accts.filter((a) => !(a.type === "fd" && a.balanceMinor === 0 && !deposits.some((d) => d.accountId === a.id))).map((a) => {
    const latest = vals.find((v) => v.accountId === a.id);
    const fd = deposits.find((d) => d.accountId === a.id);
    const value = latest ? latest.valueMinor : fd ? fdValue(fd.principalMinor, Number(fd.annualRatePct), fd.startOn, today, fd.maturityOn) : a.balanceMinor;
    return { id: a.id, name: a.name, type: a.type, currency: a.currency, investedMinor: a.balanceMinor, valueMinor: value, gainMinor: value - a.balanceMinor, valuedOn: latest?.onDate ?? null };
  });
}

export async function addValuation(workspaceId: string, homeCurrency: string, accountId: string, onDate: string, valueMinor: number) {
  const [a] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)));
  if (!a || !isAssetType(a.type)) throw new Error("Pick a savings or investment account");
  await db.insert(accountValuations).values({ workspaceId, accountId, onDate, valueMinor }).onConflictDoUpdate({ target: [accountValuations.accountId, accountValuations.onDate], set: { valueMinor } });
  await snapshotNow(workspaceId, homeCurrency);
}

export async function createAsset(workspaceId: string, homeCurrency: string, a: { name: string; type: string; investedMinor: number; valueMinor: number | null }) {
  if (!isAssetType(a.type)) throw new Error("Pick a savings or investment type");
  const [row] = await db.insert(accounts).values({ workspaceId, name: a.name, type: a.type, currency: homeCurrency, openingBalanceMinor: a.investedMinor }).returning({ id: accounts.id });
  if (a.valueMinor !== null) await db.insert(accountValuations).values({ workspaceId, accountId: row.id, onDate: todayISO(), valueMinor: a.valueMinor });
  await snapshotNow(workspaceId, homeCurrency);
  return row.id;
}

/* ---------- fixed deposits ---------- */

export type NewDeposit = { name: string; principalMinor: number; annualRatePct: number; startOn: string; maturityOn: string; maturityMinor: number | null; payoutAccountId: string | null };

export async function createDeposit(workspaceId: string, homeCurrency: string, d: NewDeposit) {
  if (d.maturityOn <= d.startOn) throw new Error("Maturity must be after the start date");
  if (d.payoutAccountId) {
    const [p] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, d.payoutAccountId), eq(accounts.workspaceId, workspaceId)));
    if (!p) throw new Error("Payout account not found");
  }
  const maturity = d.maturityMinor ?? fdMaturityEstimate(d.principalMinor, d.annualRatePct, d.startOn, d.maturityOn);
  await db.transaction(async (tx) => {
    const [acct] = await tx.insert(accounts).values({ workspaceId, name: d.name, type: "fd", currency: homeCurrency, openingBalanceMinor: d.principalMinor }).returning({ id: accounts.id });
    await tx.insert(fixedDeposits).values({ workspaceId, accountId: acct.id, payoutAccountId: d.payoutAccountId, name: d.name, principalMinor: d.principalMinor, annualRatePct: String(d.annualRatePct), startOn: d.startOn, maturityOn: d.maturityOn, maturityMinor: maturity });
  });
  await snapshotNow(workspaceId, homeCurrency);
}

export async function listDeposits(workspaceId: string) {
  const rows = await db.select().from(fixedDeposits).where(and(eq(fixedDeposits.workspaceId, workspaceId), isNull(fixedDeposits.archivedAt))).orderBy(asc(fixedDeposits.maturityOn));
  const today = todayISO();
  return rows.map((d) => ({
    ...d,
    valueNowMinor: fdValue(d.principalMinor, Number(d.annualRatePct), d.startOn, today, d.maturityOn),
    daysLeft: Math.max(0, daysBetween(today, d.maturityOn)),
    matured: d.maturityOn <= today,
  }));
}

async function ensureCategory(workspaceId: string, name: string, kind: "income" | "expense") {
  await db.insert(categories).values({ workspaceId, name, kind }).onConflictDoNothing();
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.workspaceId, workspaceId), eq(categories.name, name), eq(categories.kind, kind)));
  return c.id;
}

/** A deposit has matured: book the interest as income, move the whole amount to the payout account, close it. */
export async function recordMaturity(workspaceId: string, homeCurrency: string, id: string) {
  const [d] = await db.select().from(fixedDeposits).where(and(eq(fixedDeposits.id, id), eq(fixedDeposits.workspaceId, workspaceId), isNull(fixedDeposits.archivedAt)));
  if (!d || !d.accountId) throw new Error("Deposit not found");
  if (d.maturityOn > todayISO()) throw new Error("This deposit has not matured yet");
  const payout = d.payoutAccountId ?? (await listAccounts(workspaceId)).find((a) => !isAssetType(a.type) && a.currency === homeCurrency && a.type !== "card")?.id;
  if (!payout) throw new Error("Add a bank account to receive the money first");
  const fdAcct = (await listAccounts(workspaceId)).find((a) => a.id === d.accountId);
  if (!fdAcct) throw new Error("Deposit account not found");
  const interest = d.maturityMinor - fdAcct.balanceMinor;
  if (interest > 0) {
    await db.insert(transactions).values({ workspaceId, accountId: d.accountId, categoryId: await ensureCategory(workspaceId, "Interest", "income"), kind: "income", amountMinor: interest, currency: homeCurrency, payee: d.name, note: "Fixed deposit interest", occurredOn: d.maturityOn, source: "manual", status: "confirmed" });
  }
  await createTransfer(workspaceId, d.accountId, payout, d.maturityMinor, d.maturityOn);
  await db.update(fixedDeposits).set({ archivedAt: new Date() }).where(eq(fixedDeposits.id, id));
  await snapshotNow(workspaceId, homeCurrency);
}

export const archiveDeposit = (workspaceId: string, id: string) => db.update(fixedDeposits).set({ archivedAt: new Date() }).where(and(eq(fixedDeposits.id, id), eq(fixedDeposits.workspaceId, workspaceId)));

/** Maturities still to come, for the forecast: money returning to the payout account on its date. */
export async function upcomingMaturities(workspaceId: string, from: string, to: string) {
  return db.select({ name: fixedDeposits.name, maturityOn: fixedDeposits.maturityOn, maturityMinor: fixedDeposits.maturityMinor })
    .from(fixedDeposits).where(and(eq(fixedDeposits.workspaceId, workspaceId), isNull(fixedDeposits.archivedAt), gte(fixedDeposits.maturityOn, from), lte(fixedDeposits.maturityOn, to)));
}

/* ---------- emergency fund ---------- */

export async function emergencyFund(workspaceId: string) {
  const [ws] = await db.select({ months: workspaces.emergencyMonths, accountId: workspaces.emergencyAccountId }).from(workspaces).where(eq(workspaces.id, workspaceId));
  const today = todayISO();
  const from = addMonths(`${thisMonth()}-01`, -3);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`.mapWith(Number), first: sql<string | null>`min(${transactions.occurredOn})` })
    .from(transactions).innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.kind, "expense"), isNull(transactions.transferId), eq(categories.essential, true), gte(transactions.occurredOn, from), lt(transactions.occurredOn, `${thisMonth()}-01`)));
  // Average over the months that actually have history, at most three.
  const months = row.first ? Math.min(3, Math.max(1, Math.round(daysBetween(row.first > from ? row.first : from, `${thisMonth()}-01`) / 30))) : 1;
  const essentialMonthlyMinor = Math.round(row.total / months);
  const assets = await listAssets(workspaceId);
  const linked = ws.accountId ? assets.find((a) => a.id === ws.accountId) : undefined;
  return { ...emergencyStatus({ essentialMonthlyMinor, months: ws.months, currentMinor: linked?.valueMinor ?? 0 }), months: ws.months, accountId: linked?.id ?? null, essentialMonthlyMinor, asOf: today };
}

export async function setEmergency(workspaceId: string, months: number, accountId: string | null) {
  if (accountId) {
    const [a] = await db.select({ type: accounts.type }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)));
    if (!a || !isAssetType(a.type)) throw new Error("Pick a savings or investment account to hold it");
  }
  await db.update(workspaces).set({ emergencyMonths: months, emergencyAccountId: accountId }).where(eq(workspaces.id, workspaceId));
}

/* ---------- net worth ---------- */

export async function netWorthNow(workspaceId: string, homeCurrency: string) {
  const [accts, assets, loans] = await Promise.all([listAccounts(workspaceId), listAssets(workspaceId), listLoans(workspaceId)]);
  const liquidMinor = accts.filter((a) => !isAssetType(a.type) && a.currency === homeCurrency).reduce((s, a) => s + a.balanceMinor, 0);
  const assetsMinor = assets.filter((a) => a.currency === homeCurrency).reduce((s, a) => s + a.valueMinor, 0);
  const today = todayISO();
  let liabilitiesMinor = 0;
  let loansWithoutBalance = 0;
  for (const l of loans) {
    if (l.principalMinor === null) { loansWithoutBalance++; continue; }
    const d = await getLoan(workspaceId, l.id);
    const rows = loanSchedule(l, d!.revisions).rows;
    const past = rows.filter((r) => r.dueOn < today);
    liabilitiesMinor += rows.length ? (past.at(-1)?.balanceAfterMinor ?? l.principalMinor) : 0;
  }
  return { liquidMinor, assetsMinor, liabilitiesMinor, netWorthMinor: netWorth({ liquidMinor, assetsMinor, liabilitiesMinor }), loansWithoutBalance };
}

export async function snapshotNow(workspaceId: string, homeCurrency: string) {
  const n = await netWorthNow(workspaceId, homeCurrency);
  await db.insert(netWorthSnapshots).values({ workspaceId, month: thisMonth(), liquidMinor: n.liquidMinor, assetsMinor: n.assetsMinor, liabilitiesMinor: n.liabilitiesMinor })
    .onConflictDoUpdate({ target: [netWorthSnapshots.workspaceId, netWorthSnapshots.month], set: { liquidMinor: n.liquidMinor, assetsMinor: n.assetsMinor, liabilitiesMinor: n.liabilitiesMinor, updatedAt: new Date() } });
  return n;
}

export const listSnapshots = (workspaceId: string, limit = 12) =>
  db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.workspaceId, workspaceId)).orderBy(desc(netWorthSnapshots.month)).limit(limit).then((r) => r.reverse());

/** The daily job: keep this month's snapshot current for everyone. */
export async function snapshotAll() {
  const all = await db.select({ id: workspaces.id, home: workspaces.homeCurrency }).from(workspaces);
  let n = 0;
  for (const w of all) { try { await snapshotNow(w.id, w.home); n++; } catch (e) { console.error("snapshot failed", w.id, e); } }
  return n;
}

export { ASSET_TYPES };
