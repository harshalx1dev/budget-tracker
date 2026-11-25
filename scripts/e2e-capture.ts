// Service-level check of Phase 1 against the real database. Run: npm run check:capture
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { importStatement, quickAdd, listPending, categorize, convertToTransfer, reconcileCash, pendingCount } from "@/server/services/capture";
import { listAccounts, monthSummary, deleteTransaction } from "@/server/services/ledger";
import { toStatementRows, findHeaderRow, guessMapping } from "@/lib/statement";

const ok = (c: unknown, m: string) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

async function main() {
const [m] = await db.select().from(schema.workspaceMembers).limit(1);
const ws = m.workspaceId;
// Clean slate so the script can be re-run: drop earlier test rows, batches and rules.
await db.delete(schema.transactions).where(eq(schema.transactions.workspaceId, ws));
await db.delete(schema.importBatches).where(eq(schema.importBatches.workspaceId, ws));
await db.delete(schema.categoryRules).where(eq(schema.categoryRules.workspaceId, ws));
const accts = await listAccounts(ws);
const bank = accts.find((a) => a.type === "bank") ?? (await (async () => { await db.insert(schema.accounts).values({ workspaceId: ws, name: "HDFC Test", type: "bank", aliases: ["upi"] }); return (await listAccounts(ws)).find((a) => a.name === "HDFC Test")!; })());
const cash = accts.find((a) => a.type === "cash")!;

const csv = [
  ["Statement of account"], [],
  ["Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
  ["05/11/26", "UPI-SWIGGY-swiggy@icici-412345678901-order", "412345678901", "450.00", "", "9550"],
  ["05/11/26", "UPI-CHAI POINT-chai@ybl-412345678902-tea", "412345678902", "20.00", "", "9530"],
  ["05/11/26", "UPI-CHAI POINT-chai@ybl-412345678903-tea", "412345678903", "20.00", "", "9510"],
  ["06/11/26", "ATM WDL SBI ATM 1234", "9988", "2000.00", "", "7510"],
  ["07/11/26", "NEFT CR ACME SALARY", "N1", "", "25000.00", "32510"],
];
const h = findHeaderRow(csv);
const rows = toStatementRows(csv, h, guessMapping(csv[h])!);
ok(rows.length === 5, "parsed 5 rows");

const first = await importStatement(ws, "INR", bank.id, "test.csv", rows);
ok(first.added === 5 && first.duplicates === 0, `first import added ${first.added}`);
const second = await importStatement(ws, "INR", bank.id, "test.csv", rows);
ok(second.added === 0 && second.duplicates === 5, `second import added ${second.added}, skipped ${second.duplicates}`);
const overlap = await importStatement(ws, "INR", bank.id, "overlap.csv", [...rows, { date: "2026-11-08", kind: "expense", amount: 99, narration: "UPI-NEW SHOP-shop@ybl-412345678909", ref: "412345678909" }]);
ok(overlap.added === 1, `overlap import added only ${overlap.added} new`);

const pend = await listPending(ws);
const swiggy = pend.find((p) => /swiggy/i.test(p.payee ?? ""))!;
ok(Boolean(swiggy), "swiggy is pending");
const food = (await db.select().from(schema.categories).where(eq(schema.categories.workspaceId, ws))).find((c) => c.name === "Food & dining")!;
const n = await categorize(ws, swiggy.id, food.id, true);
ok(n >= 1, `categorised ${n} (rule learned)`);
const again = await importStatement(ws, "INR", bank.id, "later.csv", [{ date: "2026-11-09", kind: "expense", amount: 300, narration: "UPI-SWIGGY-swiggy@icici-412345678910-dinner", ref: "412345678910" }]);
const afterRule = (await listPending(ws)).filter((p) => /swiggy/i.test(p.payee ?? ""));
ok(again.added === 1 && afterRule.length === 0, "learned rule auto-categorised the next swiggy row");

const atm = (await listPending(ws)).find((p) => /atm/i.test(p.rawNarration ?? ""))!;
const before = await monthSummary(ws, "INR", "2026-11");
const cashBefore = (await listAccounts(ws)).find((a) => a.id === cash.id)!.balanceMinor;
await convertToTransfer(ws, atm.id, cash.id);
const after = await monthSummary(ws, "INR", "2026-11");
ok(after.expense === before.expense - 200000, "ATM debit left expense totals once it became a transfer");
const cashNow = (await listAccounts(ws)).find((a) => a.id === cash.id)!;
ok(cashNow.balanceMinor === cashBefore + 200000, "cash account received the other leg");
await deleteTransaction(ws, atm.id);
const cashAfterDelete = (await listAccounts(ws)).find((a) => a.id === cash.id)!;
ok(cashAfterDelete.balanceMinor === cashNow.balanceMinor - 200000, "deleting one transfer leg removed both");

const rec = await reconcileCash(ws, cash.id, cashAfterDelete.balanceMinor - 5000, "2026-11-26");
ok(rec.diff === -5000, "reconcile booked untracked spending");

const q = await quickAdd(ws, "INR", "chai 20 cash yesterday");
ok(q.account === "Cash" && q.amountMinor === 2000, "quick-add parsed against real accounts");
console.log("pending now:", await pendingCount(ws));
}
main().then(() => process.exit(process.exitCode ?? 0), (e) => { console.error(e); process.exit(1); });
