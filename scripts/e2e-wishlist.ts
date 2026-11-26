// Service-level check of Phase 4 against the real database, using invented data only.
// Run: npm run check:wishlist. It deletes data, so it only touches the dedicated test account's workspace.
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createLoan, createRule } from "@/server/services/commitments";
import { setBuffer } from "@/server/services/planner";
import { addLink, addWish, affordability, listWishlist, setMaxEmiRatio, setWishStatus } from "@/server/services/wishlist";
import { shiftDays, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const ws = m.workspaceId;
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets, schema.goals, schema.wishlistItems, schema.fixedDeposits]) await db.delete(t).where(eq(t.workspaceId, ws));

  const today = todayISO();
  const accts = await db.select().from(schema.accounts).where(eq(schema.accounts.workspaceId, ws));
  for (const a of accts) await db.update(schema.accounts).set({ openingBalanceMinor: a.type === "cash" ? 0 : 3000000 }).where(eq(schema.accounts.id, a.id)); // ₹30,000
  await setBuffer(ws, 1000000); // ₹10,000
  await setMaxEmiRatio(ws, 40);

  // income ₹60,000 a month on the last day; an existing EMI of ₹10,000 for 3 more months
  await createRule(ws, { name: "Salary", kind: "income", amountMinor: 6000000, frequency: "monthly", intervalCount: 1, startOn: `${today.slice(0, 7)}-01`, endOn: null, maxCount: null, anchor: "month_end", weekendShift: "sunday_back", matchPattern: null, accountId: null, categoryId: null });
  await createLoan(ws, { name: "Phone EMI", lender: null, emiMinor: 1000000, firstDueOn: shiftDays(today, 3), instalments: 3, principalMinor: null, annualRatePct: null, matchPattern: null, accountId: null });

  const base = { notes: null, categoryId: null, targetDate: null };
  const laptop = await addWish(ws, { ...base, title: "Laptop", priceMinor: 4500000, type: "need", priority: 1, downPaymentMinor: null, emiTenureMonths: null, emiRatePct: null });
  const tv = await addWish(ws, { ...base, title: "TV", priceMinor: 6000000, type: "want", priority: 2, downPaymentMinor: 0, emiTenureMonths: 6, emiRatePct: 0 });
  const trip = await addWish(ws, { ...base, title: "Trip", priceMinor: 500000000, type: "desire", priority: 3, downPaymentMinor: null, emiTenureMonths: null, emiRatePct: null });
  await addLink(ws, tv, "https://example.com/tv", "example", 5900000);

  const a = await affordability(ws, "INR");
  const byId = new Map(a.order.map((o) => [o.id, o]));
  ok(byId.get(laptop)!.month !== null && a.order[0].id === laptop, "the need is planned first and has a month");
  ok(byId.get(trip)!.month === null, "an unaffordable desire is reported as not affordable");
  const tvPlan = byId.get(tv)!;
  ok(tvPlan.month !== null, `the TV gets a plan (${tvPlan.method} from ${tvPlan.month})`);
  ok(tvPlan.method === "emi" ? (tvPlan.emiMinor ?? 0) === 1000000 : true, "a no-cost 6-month EMI on ₹60,000 is ₹10,000 a month");
  ok(a.order.filter((o) => o.month).every((o) => o.month! >= today.slice(0, 7) && o.month! <= a.horizonEnd), "every planned month is inside the projection");

  // EMI share of income: existing EMI ₹10,000 + TV ₹10,000 = 33%; a 25% limit must push the TV past the existing EMI
  const tvItem = a.items.find((i) => i.id === tv)!;
  ok(tvItem.emi !== null || tvItem.outrightMonth !== null, "the TV shows an independent plan");
  await setMaxEmiRatio(ws, 25);
  const strict = await affordability(ws, "INR");
  const tvStrict = strict.items.find((i) => i.id === tv)!;
  ok(tvStrict.emi === null || tvStrict.emi.month > (tvItem.emi?.month ?? ""), "a lower EMI limit delays or blocks the TV on EMI");

  const list = await listWishlist(ws);
  ok(list.find((i) => i.id === tv)!.links.length === 1, "the link is stored with the item");
  await setWishStatus(ws, laptop, "bought", today);
  const after = await affordability(ws, "INR");
  ok(!after.order.some((o) => o.id === laptop), "a bought item leaves the plan");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
