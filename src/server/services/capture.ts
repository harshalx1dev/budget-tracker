import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { listAccounts } from "@/server/services/ledger";
import { matchRule, type Rule } from "@/lib/categorize";
import { normalizePayee, readNarration } from "@/lib/narration";
import { parseQuickAdd } from "@/lib/quick-add";
import { exponent } from "@/lib/money";
import { daysBetween, shiftDays, todayISO } from "@/lib/dates";
import { autoMatch } from "@/server/services/commitments";
import type { StatementRow } from "@/lib/statement";

const { accounts, categories, categoryRules, importBatches, transactions } = schema;

/* ---------- categories and rules ---------- */

export async function listRules(workspaceId: string) {
  return db
    .select({ id: categoryRules.id, pattern: categoryRules.pattern, categoryId: categoryRules.categoryId, source: categoryRules.source, category: categories.name })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(eq(categoryRules.workspaceId, workspaceId))
    .orderBy(categoryRules.pattern);
}

const rulesFor = (workspaceId: string): Promise<Rule[]> =>
  db.select({ pattern: categoryRules.pattern, categoryId: categoryRules.categoryId }).from(categoryRules).where(eq(categoryRules.workspaceId, workspaceId));

async function ownsCategory(workspaceId: string, id: string) {
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, id), eq(categories.workspaceId, workspaceId)));
  return Boolean(c);
}

export async function addRule(workspaceId: string, pattern: string, categoryId: string, source: "manual" | "learned" = "manual") {
  const p = normalizePayee(pattern);
  if (p.length < 3) throw new Error("pattern needs at least 3 letters");
  if (!(await ownsCategory(workspaceId, categoryId))) throw new Error("category not found");
  await db.insert(categoryRules).values({ workspaceId, pattern: p, categoryId, source }).onConflictDoUpdate({ target: [categoryRules.workspaceId, categoryRules.pattern], set: { categoryId, source } });
}

export const deleteRule = (workspaceId: string, id: string) => db.delete(categoryRules).where(and(eq(categoryRules.id, id), eq(categoryRules.workspaceId, workspaceId)));

export async function addCategory(workspaceId: string, name: string, kind: "income" | "expense") {
  await db.insert(categories).values({ workspaceId, name, kind }).onConflictDoNothing();
}

export const deleteCategory = (workspaceId: string, id: string) => db.delete(categories).where(and(eq(categories.id, id), eq(categories.workspaceId, workspaceId)));

async function ensureCategory(workspaceId: string, name: string, kind: "income" | "expense") {
  await addCategory(workspaceId, name, kind);
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.workspaceId, workspaceId), eq(categories.name, name), eq(categories.kind, kind)));
  return c.id;
}

/* ---------- quick add ---------- */

/** Thrown when the local parser finds no amount, so the caller can fall back to the AI parser if a key is set. */
export class NoAmountError extends Error {
  constructor() { super("no amount found, try: chai 20 cash"); }
}

export type QuickParsed = { amount: number | null; kind: "income" | "expense"; accountId: string | null; date: string; text: string };

export async function quickAdd(workspaceId: string, homeCurrency: string, input: string, override?: QuickParsed) {
  const accts = await listAccounts(workspaceId);
  const parsed = override ?? parseQuickAdd(input, accts.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases })), todayISO());
  if (!parsed.amount) throw new NoAmountError();
  const acct = accts.find((a) => a.id === parsed.accountId) ?? accts.find((a) => a.type === "cash") ?? accts[0];
  if (!acct) throw new Error("add an account first");
  if (acct.currency !== homeCurrency) throw new Error("quick-add works for home-currency accounts; use the full form");
  const amountMinor = Math.round(parsed.amount * 10 ** exponent(acct.currency));
  const categoryId = matchRule(await rulesFor(workspaceId), parsed.text);
  await db.insert(transactions).values({
    workspaceId, accountId: acct.id, categoryId, kind: parsed.kind, amountMinor, currency: acct.currency,
    payee: parsed.text || null, occurredOn: parsed.date, source: "quick", status: categoryId ? "confirmed" : "pending",
  });
  await autoMatch(workspaceId);
  return { amountMinor, currency: acct.currency, account: acct.name, date: parsed.date, text: parsed.text, categorised: Boolean(categoryId) };
}

/* ---------- statement import ---------- */

export async function importStatement(workspaceId: string, homeCurrency: string, accountId: string, filename: string, rows: StatementRow[]) {
  const [acct] = await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)));
  if (!acct) throw new Error("account not found");
  if (acct.currency !== homeCurrency) throw new Error("statement import works for home-currency accounts for now");
  if (!rows.length) throw new Error("no transactions found in that file");

  const rules = await rulesFor(workspaceId);
  const exp = exponent(acct.currency);
  const seen = new Map<string, number>();
  const values = rows.map((r) => {
    const amountMinor = Math.round(r.amount * 10 ** exp);
    const n = normalizePayee(r.narration);
    // Identical lines on one day get an occurrence index, so two real ₹20 chais both survive
    // while re-importing an overlapping statement still matches line for line.
    const key = [r.date, r.kind, amountMinor, r.ref || n].join("|");
    const occ = seen.get(key) ?? 0;
    seen.set(key, occ + 1);
    const nar = readNarration(r.narration);
    const categoryId = matchRule(rules, r.narration, nar.payee);
    return {
      workspaceId, accountId, categoryId, kind: r.kind, amountMinor, currency: acct.currency,
      payee: nar.payee || null, rawNarration: r.narration, occurredOn: r.date, source: "import" as const,
      status: categoryId ? ("confirmed" as const) : ("pending" as const),
      importHash: createHash("sha256").update(`${key}|${occ}`).digest("hex"),
    };
  });

  // 1) Lines already imported (same hash) are skipped, which makes re-imports and overlaps safe.
  const hashes = values.map((v) => v.importHash);
  const have = new Set(
    (await db.select({ h: transactions.importHash }).from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.accountId, accountId), inArray(transactions.importHash, hashes)))).map((r) => r.h),
  );
  const fresh = values.filter((v) => !have.has(v.importHash));

  // 2) A statement line may be the same spend you already quick-added: pair it with that row (same kind and
  //    amount, within 3 days) and enrich it in place, so it is neither duplicated nor loses your category.
  const merges: { id: string; v: (typeof values)[number] }[] = [];
  let toInsert = fresh;
  if (fresh.length) {
    const dates = fresh.map((v) => v.occurredOn).sort();
    const loose = await db.select({ id: transactions.id, kind: transactions.kind, amountMinor: transactions.amountMinor, occurredOn: transactions.occurredOn })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.accountId, accountId), isNull(transactions.importHash), isNull(transactions.transferId),
        inArray(transactions.source, ["manual", "quick"]), gte(transactions.occurredOn, shiftDays(dates[0], -3)), lte(transactions.occurredOn, shiftDays(dates.at(-1)!, 3))));
    const used = new Set<string>();
    toInsert = [];
    for (const v of fresh) {
      let best: { id: string; gap: number } | null = null;
      for (const c of loose) {
        if (used.has(c.id) || c.kind !== v.kind || c.amountMinor !== v.amountMinor) continue;
        const gap = Math.abs(daysBetween(v.occurredOn, c.occurredOn));
        if (gap <= 3 && (!best || gap < best.gap)) best = { id: c.id, gap };
      }
      if (best) { used.add(best.id); merges.push({ id: best.id, v }); } else toInsert.push(v);
    }
  }

  const [batch] = await db.insert(importBatches).values({ workspaceId, accountId, filename: filename.slice(0, 120), rowCount: rows.length, addedCount: 0, duplicateCount: 0 }).returning();
  if (merges.length) {
    const vals = sql.join(merges.map(({ id, v }) => sql`(${id}, ${v.importHash}, ${v.rawNarration}, ${v.categoryId}::text)`), sql`, `);
    await db.execute(sql`
      update transactions t set import_hash = m.h, raw_narration = m.r, import_batch_id = ${batch.id}, category_id = coalesce(t.category_id, m.c),
        status = case when coalesce(t.category_id, m.c) is not null then 'confirmed'::tx_status else t.status end
      from (values ${vals}) as m(id, h, r, c) where t.id = m.id and t.workspace_id = ${workspaceId}`);
  }
  let added = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const res = await db.insert(transactions).values(toInsert.slice(i, i + 500).map((v) => ({ ...v, importBatchId: batch.id }))).onConflictDoNothing().returning({ id: transactions.id });
    added += res.length;
  }
  const duplicates = rows.length - added - merges.length;
  await db.update(importBatches).set({ addedCount: added, duplicateCount: duplicates }).where(eq(importBatches.id, batch.id));
  await autoMatch(workspaceId);
  return { total: rows.length, added, merged: merges.length, duplicates };
}

/* ---------- review inbox ---------- */

export function listPending(workspaceId: string) {
  return db
    .select({ id: transactions.id, kind: transactions.kind, amountMinor: transactions.amountMinor, currency: transactions.currency, payee: transactions.payee, rawNarration: transactions.rawNarration, occurredOn: transactions.occurredOn, accountId: transactions.accountId, account: accounts.name })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.status, "pending"), isNull(transactions.transferId)))
    .orderBy(sql`${transactions.occurredOn} desc`, transactions.createdAt)
    .limit(300);
}

export async function pendingCount(workspaceId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(transactions).where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.status, "pending"), isNull(transactions.transferId)));
  return r.n;
}

/** Categorise one row; with `remember`, learn a rule from its payee and apply it to similar pending rows. */
export async function categorize(workspaceId: string, id: string, categoryId: string, remember: boolean) {
  if (!(await ownsCategory(workspaceId, categoryId))) throw new Error("category not found");
  const [tx] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)));
  if (!tx) throw new Error("entry not found");
  const ids = [id];
  if (remember) {
    const pattern = normalizePayee(tx.payee ?? "");
    if (pattern.length >= 3) {
      await addRule(workspaceId, pattern, categoryId, "learned");
      const pending = await db.select({ id: transactions.id, payee: transactions.payee, raw: transactions.rawNarration, kind: transactions.kind })
        .from(transactions).where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.status, "pending"), isNull(transactions.transferId)));
      for (const p of pending) if (p.kind === tx.kind && p.id !== id && normalizePayee(`${p.payee ?? ""} ${p.raw ?? ""}`).includes(pattern)) ids.push(p.id);
    }
  }
  await db.update(transactions).set({ categoryId, status: "confirmed" }).where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.id, ids)));
  return ids.length;
}

/* ---------- transfers and cash ---------- */

/** Pair an existing entry with a mirror leg in another account (e.g. an ATM debit becomes cash). */
export async function convertToTransfer(workspaceId: string, id: string, otherAccountId: string) {
  const [tx] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)));
  const [other] = await db.select().from(accounts).where(and(eq(accounts.id, otherAccountId), eq(accounts.workspaceId, workspaceId)));
  if (!tx || !other) throw new Error("not found");
  if (other.currency !== tx.currency) throw new Error("accounts use different currencies; add both legs by hand");
  if (other.id === tx.accountId) throw new Error("pick a different account");
  const transferId = crypto.randomUUID();
  await db.transaction(async (t) => {
    await t.update(transactions).set({ transferId, categoryId: null, status: "confirmed" }).where(eq(transactions.id, id));
    await t.insert(transactions).values({
      workspaceId, accountId: other.id, kind: tx.kind === "expense" ? "income" : "expense", amountMinor: tx.amountMinor, currency: tx.currency,
      payee: "transfer", occurredOn: tx.occurredOn, transferId, source: tx.source, status: "confirmed",
    });
  });
}

export async function createTransfer(workspaceId: string, fromId: string, toId: string, amountMinor: number, date: string) {
  const accts = await db.select().from(accounts).where(and(eq(accounts.workspaceId, workspaceId), inArray(accounts.id, [fromId, toId])));
  const from = accts.find((a) => a.id === fromId);
  const to = accts.find((a) => a.id === toId);
  if (!from || !to || fromId === toId) throw new Error("pick two different accounts");
  if (from.currency !== to.currency) throw new Error("accounts use different currencies; add both legs by hand");
  const transferId = crypto.randomUUID();
  const base = { workspaceId, amountMinor, currency: from.currency, occurredOn: date, transferId, payee: "transfer", status: "confirmed" as const };
  await db.insert(transactions).values([{ ...base, accountId: fromId, kind: "expense" }, { ...base, accountId: toId, kind: "income" }]);
}

/** Book the gap between the computed balance and the cash actually in hand. */
export async function reconcileCash(workspaceId: string, accountId: string, actualMinor: number, date: string) {
  const acct = (await listAccounts(workspaceId)).find((a) => a.id === accountId);
  if (!acct) throw new Error("account not found");
  const diff = actualMinor - acct.balanceMinor;
  if (diff === 0) return { diff: 0, currency: acct.currency };
  const kind = diff < 0 ? "expense" : "income";
  const categoryId = await ensureCategory(workspaceId, kind === "expense" ? "Untracked cash" : "Other income", kind);
  await db.insert(transactions).values({
    workspaceId, accountId, categoryId, kind, amountMinor: Math.abs(diff), currency: acct.currency,
    payee: "cash reconciliation", occurredOn: date, source: "reconcile", status: "confirmed",
  });
  return { diff, currency: acct.currency };
}
