// Service-level check of savings and investments against the real database, using invented data only.
// Run: npm run check:savings. It deletes data, so it only touches the dedicated test account's workspace.
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { importStatement } from "@/server/services/capture";
import { createLoan, createRule, listExpected, markPaid } from "@/server/services/commitments";
import { addGoal, forecast, listGoals, safeToSpend } from "@/server/services/planner";
import { addValuation, createAsset, createDeposit, emergencyFund, listAssets, listDeposits, listSnapshots, netWorthNow, recordMaturity, setEmergency, snapshotNow } from "@/server/services/savings";
import { listAccounts, monthSummary } from "@/server/services/ledger";
import { monthlyTotals } from "@/server/services/reports";
import { ASSET_TYPES } from "@/lib/savings";
import { shiftDays, thisMonth, todayISO } from "@/lib/dates";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
  const TEST_EMAIL = "tester@budget.test";
  const [m] = await db.select({ workspaceId: schema.workspaceMembers.workspaceId }).from(schema.workspaceMembers)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMembers.userId)).where(eq(schema.user.email, TEST_EMAIL));
  if (!m) { console.error(`no ${TEST_EMAIL} account; sign up that test user first. Refusing to run.`); process.exit(1); }
  const ws = m.workspaceId;
  for (const t of [schema.transactions, schema.importBatches, schema.loans, schema.recurringRules, schema.budgets, schema.goals, schema.fixedDeposits, schema.netWorthSnapshots, schema.accountValuations]) await db.delete(t).where(eq(t.workspaceId, ws));
  await db.delete(schema.accounts).where(and(eq(schema.accounts.workspaceId, ws), inArray(schema.accounts.type, [...ASSET_TYPES])));
  await db.update(schema.workspaces).set({ emergencyAccountId: null, emergencyMonths: 6, bufferMinor: 0 }).where(eq(schema.workspaces.id, ws));

  const today = todayISO();
  let accts = await listAccounts(ws);
  let bank = accts.find((a) => a.type === "bank");
  if (!bank) { await db.insert(schema.accounts).values({ workspaceId: ws, name: "Test Bank", type: "bank" }); accts = await listAccounts(ws); bank = accts.find((a) => a.type === "bank")!; }
  for (const a of accts.filter((x) => x.type === "cash" || x.type === "bank")) await db.update(schema.accounts).set({ openingBalanceMinor: a.type === "bank" ? 5000000 : 0 }).where(eq(schema.accounts.id, a.id)); // ₹50,000

  // a mutual fund, valued by hand
  const fundId = await createAsset(ws, "INR", { name: "Index fund", type: "mutual_fund", investedMinor: 1000000, valueMinor: 1200000 });
  const assets = await listAssets(ws);
  const fund = assets.find((a) => a.id === fundId)!;
  ok(fund.investedMinor === 1000000 && fund.valueMinor === 1200000 && fund.gainMinor === 200000, "an investment shows what went in, what it is worth and the gain");
  await addValuation(ws, "INR", fundId, today, 1300000);
  ok((await listAssets(ws)).find((a) => a.id === fundId)!.valueMinor === 1300000, "a newer value replaces the older one");

  // savings never count as spendable money
  const sts = await safeToSpend(ws, "INR");
  ok(sts.balance === 5000000, "safe-to-spend counts spending accounts only, not the fund");

  // a SIP is a transfer into the fund, matched from the statement
  const due = shiftDays(today, -2);
  await createRule(ws, { name: "Index SIP", kind: "expense", amountMinor: 500000, frequency: "monthly", intervalCount: 1, startOn: due, endOn: null, maxCount: 12, matchPattern: "sipmandate1", accountId: null, categoryId: null, anchor: "start_day", weekendShift: "none", transferToAccountId: fundId });
  await db.insert(schema.transactions).values({ workspaceId: ws, accountId: bank.id, kind: "income", amountMinor: 6000000, currency: "INR", payee: "Salary", occurredOn: today, source: "manual", status: "confirmed" });
  await importStatement(ws, "INR", bank.id, "sip.csv", [{ date: due, kind: "expense", amount: 5000, narration: "NACH-MUT-DR-INDIAN CLEARING CORP-SIPMANDATE1", ref: "NACH1" }]);
  const legs = await db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, ws));
  const sipOut = legs.find((t) => t.kind === "expense")!;
  ok(sipOut.transferId !== null && sipOut.categoryId === null, "the matched SIP debit became a transfer, not spending");
  ok(legs.some((t) => t.transferId === sipOut.transferId && t.kind === "income" && t.accountId === fundId && t.amountMinor === 500000), "the fund received the other leg");
  ok((await monthSummary(ws, "INR", thisMonth())).expense === 0, "a SIP does not count as spending");
  ok((await listAssets(ws)).find((a) => a.id === fundId)!.investedMinor === 1500000, "invested money in the fund went up by the SIP");
  const tot = (await monthlyTotals(ws, "INR", thisMonth(), 1))[0];
  ok(tot.saved === 500000 && Math.round((tot.saved / tot.income) * 100) === 8, "the month shows ₹5,000 saved, about 8% of income");

  // marking a future SIP paid records both legs
  const sip2 = (await listExpected(ws, shiftDays(today, 25), shiftDays(today, 40))).find((e) => e.name === "Index SIP");
  if (sip2) { await markPaid(ws, "rule", sip2.sourceId, sip2.dueOn); const all = await db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, ws)); ok(all.filter((t) => t.payee === "Index SIP" && t.transferId).length === 2, "marking a SIP paid records both legs"); }

  // fixed deposits: accrued value, forecast inflow, and a matured one paid out
  await createDeposit(ws, "INR", { name: "Future FD", principalMinor: 10000000, annualRatePct: 7, startOn: shiftDays(today, -30), maturityOn: shiftDays(today, 40), maturityMinor: null, payoutAccountId: bank.id });
  const fdNow = (await listDeposits(ws)).find((d) => d.name === "Future FD")!;
  ok(fdNow.valueNowMinor > 10000000 && fdNow.maturityMinor > 10000000 && !fdNow.matured, "a deposit accrues interest and shows its estimated maturity");
  const fc = await forecast(ws, "INR", 4);
  ok(fc.maturities.length === 1 && fc.rows.some((r) => r.income >= fdNow.maturityMinor), "the forecast counts the maturity as money coming back");
  await createDeposit(ws, "INR", { name: "Old FD", principalMinor: 5000000, annualRatePct: 6, startOn: shiftDays(today, -400), maturityOn: shiftDays(today, -1), maturityMinor: 5300000, payoutAccountId: bank.id });
  const before = (await listAccounts(ws)).find((a) => a.id === bank!.id)!.balanceMinor;
  const old = (await listDeposits(ws)).find((d) => d.name === "Old FD")!;
  ok(old.matured, "a deposit past its date is marked matured");
  await recordMaturity(ws, "INR", old.id);
  const after = (await listAccounts(ws)).find((a) => a.id === bank!.id)!.balanceMinor;
  ok(after === before + 5300000, "recording the payout moves the full maturity amount into the bank");
  const interest = (await db.select().from(schema.transactions).where(eq(schema.transactions.workspaceId, ws))).find((t) => t.payee === "Old FD" && t.kind === "income" && !t.transferId);
  ok(interest?.amountMinor === 300000, "the interest earned is booked as income");
  ok(!(await listDeposits(ws)).some((d) => d.name === "Old FD"), "the paid-out deposit is closed");

  // emergency fund from essential spending
  const rent = (await db.select().from(schema.categories).where(and(eq(schema.categories.workspaceId, ws), eq(schema.categories.name, "Rent"))))[0];
  await db.insert(schema.transactions).values({ workspaceId: ws, accountId: bank.id, categoryId: rent.id, kind: "expense", amountMinor: 2000000, currency: "INR", payee: "Rent", occurredOn: shiftDays(`${thisMonth()}-01`, -5), source: "manual", status: "confirmed" });
  await setEmergency(ws, 6, fundId);
  const ef = await emergencyFund(ws);
  ok(ef.known && ef.essentialMonthlyMinor > 0 && ef.targetMinor === ef.essentialMonthlyMinor * 6, "the emergency target is months of essential spending");
  ok(ef.accountId === fundId && ef.coveredMonths !== null && ef.coveredMonths > 0, "progress comes from the linked account");
  let rejected = false;
  try { await setEmergency(ws, 6, bank.id); } catch { rejected = true; }
  ok(rejected, "a spending account cannot hold the emergency fund");

  // goals can follow an account
  await addGoal(ws, "Retirement pot", 50000000, null, fundId);
  const goal = (await listGoals(ws)).find((g) => g.name === "Retirement pot")!;
  ok(goal.saved === (await listAssets(ws)).find((a) => a.id === fundId)!.valueMinor, "a linked goal's progress is the account's value");

  // net worth and its history
  await createLoan(ws, { name: "Test loan", lender: null, emiMinor: 1000000, firstDueOn: shiftDays(today, 10), instalments: 6, principalMinor: 6000000, annualRatePct: 0, matchPattern: null, accountId: null });
  const nw = await netWorthNow(ws, "INR");
  const liquid = (await listAccounts(ws)).filter((a) => ["cash", "bank"].includes(a.type)).reduce((s, a) => s + a.balanceMinor, 0);
  ok(nw.liquidMinor === liquid && nw.liabilitiesMinor === 6000000 && nw.netWorthMinor === nw.liquidMinor + nw.assetsMinor - 6000000, "net worth is accounts plus savings minus loans owed");
  await snapshotNow(ws, "INR");
  ok((await listSnapshots(ws, 12)).some((s) => s.month === thisMonth() && s.assetsMinor === nw.assetsMinor), "this month's net worth is saved to the history");
}

main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
