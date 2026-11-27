import { bigint, boolean, date, index, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
// Money: integer minor units (paise, cents) as bigint, with an ISO 4217 currency code beside it.
const money = (name: string) => bigint(name, { mode: "number" });

/* Auth (Better Auth) */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // "user" | "admin". Set only by the server (ADMIN_EMAILS), never from a sign-up form.
  role: text("role").notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* Tenancy: every domain row carries workspace_id. One personal workspace per user for now. */
export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  homeCurrency: text("home_currency").notNull().default("INR"),
  // Money to keep untouched; safe-to-spend and affordability treat it as spent.
  bufferMinor: bigint("buffer_minor", { mode: "number" }).notNull().default(0),
  // Largest share of monthly income that all EMIs together may take when judging a new one.
  maxEmiRatioPct: integer("max_emi_ratio_pct").notNull().default(40),
  // Emergency fund: how many months of essential spending to hold, and the account that holds it.
  emergencyMonths: integer("emergency_months").notNull().default(6),
  emergencyAccountId: text("emergency_account_id"),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("owner"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)]);

/* Ledger */
// Spendable accounts first; the rest hold savings and investments and never count toward safe-to-spend.
export const accountType = pgEnum("account_type", ["cash", "bank", "card", "wallet", "savings", "fd", "mutual_fund", "stocks", "retirement", "gold", "other_asset"]);
export const txKind = pgEnum("tx_kind", ["income", "expense"]);
// pending = imported or quick-added without a trusted category; shows in the review inbox.
export const txStatus = pgEnum("tx_status", ["pending", "confirmed"]);
export const txSource = pgEnum("tx_source", ["manual", "quick", "import", "reconcile", "mcp"]);

export const accounts = pgTable("accounts", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  currency: text("currency").notNull().default("INR"),
  // Words that route quick-add entries here, e.g. ["upi", "gpay"].
  aliases: text("aliases").array().notNull().default([]),
  openingBalanceMinor: money("opening_balance_minor").notNull().default(0),
  // Credit cards only: the day of the month the bill is made and the day it must be paid.
  statementDay: integer("statement_day"),
  dueDay: integer("due_day"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("accounts_workspace_idx").on(t.workspaceId)]);

export const categories = pgTable("categories", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: txKind("kind").notNull(),
  // Essential spending (rent, groceries, EMIs...) sizes the emergency fund.
  essential: boolean("essential").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("categories_workspace_name_kind_uq").on(t.workspaceId, t.name, t.kind)]);

export const transactions = pgTable("transactions", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  kind: txKind("kind").notNull(),
  amountMinor: money("amount_minor").notNull(), // always positive; kind gives the sign
  currency: text("currency").notNull(),
  // Rate to the workspace home currency at entry time; null when currency is the home currency.
  fxRateToHome: numeric("fx_rate_to_home", { precision: 20, scale: 10 }),
  payee: text("payee"),
  note: text("note"),
  occurredOn: date("occurred_on").notNull(),
  status: txStatus("status").notNull().default("confirmed"),
  source: txSource("source").notNull().default("manual"),
  tags: text("tags").array().notNull().default([]),
  // Both legs of a transfer share one transfer_id; transfers are excluded from income/expense totals.
  transferId: text("transfer_id"),
  importBatchId: text("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
  importHash: text("import_hash"),
  rawNarration: text("raw_narration"),
  // Idempotency key from the client or an agent: the same key never creates a second entry.
  clientRef: text("client_ref"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("transactions_client_ref_uq").on(t.workspaceId, t.clientRef),
  index("transactions_workspace_date_idx").on(t.workspaceId, t.occurredOn),
  index("transactions_transfer_idx").on(t.transferId),
  index("transactions_status_idx").on(t.workspaceId, t.status),
  uniqueIndex("transactions_import_hash_uq").on(t.workspaceId, t.accountId, t.importHash),
]);

export const importBatches = pgTable("import_batches", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  rowCount: integer("row_count").notNull(),
  addedCount: integer("added_count").notNull(),
  duplicateCount: integer("duplicate_count").notNull(),
  createdAt: createdAt(),
});

// A rule maps text found in payee or narration to a category. "learned" rules come from corrections.
export const ruleSource = pgEnum("rule_source", ["manual", "learned"]);
export const categoryRules = pgTable("category_rules", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(), // lowercase, matched as a substring
  categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  source: ruleSource("source").notNull().default("manual"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("category_rules_pattern_uq").on(t.workspaceId, t.pattern)]);

/* Commitments: loans/EMIs and recurring rules. Expected payments are computed, not stored; only matches are. */
export const frequency = pgEnum("frequency", ["weekly", "monthly", "yearly"]);
export const revisionKind = pgEnum("revision_kind", ["emi", "rate", "prepayment"]);
export const expectedSource = pgEnum("expected_source", ["loan", "rule"]);
export const ruleAnchor = pgEnum("rule_anchor", ["start_day", "month_end"]);
export const weekendShift = pgEnum("weekend_shift", ["none", "sunday_back", "weekend_back"]);

export const loans = pgTable("loans", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  lender: text("lender"),
  emiMinor: money("emi_minor").notNull(), // the lender's figure as given
  firstDueOn: date("first_due_on").notNull(),
  instalments: integer("instalments").notNull(), // remaining, counted from first_due_on
  principalMinor: money("principal_minor"), // optional: balance before the first listed instalment
  annualRatePct: numeric("annual_rate_pct", { precision: 7, scale: 4 }),
  matchPattern: text("match_pattern"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("loans_workspace_idx").on(t.workspaceId)]);

export const loanRevisions = pgTable("loan_revisions", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  loanId: text("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
  effectiveOn: date("effective_on").notNull(),
  kind: revisionKind("kind").notNull(),
  emiMinor: money("emi_minor"),
  ratePct: numeric("rate_pct", { precision: 7, scale: 4 }),
  amountMinor: money("amount_minor"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("loan_revisions_loan_idx").on(t.loanId)]);

export const recurringRules = pgTable("recurring_rules", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  kind: txKind("kind").notNull(),
  amountMinor: money("amount_minor").notNull(),
  frequency: frequency("frequency").notNull(),
  intervalCount: integer("interval_count").notNull().default(1),
  startOn: date("start_on").notNull(),
  endOn: date("end_on"),
  maxCount: integer("max_count"),
  // SIPs and recurring deposits: the money moves into this savings or investment account instead of being spent.
  transferToAccountId: text("transfer_to_account_id").references(() => accounts.id, { onDelete: "set null" }),
  anchor: ruleAnchor("anchor").notNull().default("start_day"),
  weekendShift: weekendShift("weekend_shift").notNull().default("none"),
  matchPattern: text("match_pattern"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("recurring_rules_workspace_idx").on(t.workspaceId)]);

// One expected payment pairs with at most one transaction, and a transaction pays at most one occurrence.
export const expectedMatches = pgTable("expected_matches", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sourceKind: expectedSource("source_kind").notNull(),
  sourceId: text("source_id").notNull(),
  dueOn: date("due_on").notNull(),
  transactionId: text("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("expected_matches_occurrence_uq").on(t.sourceKind, t.sourceId, t.dueOn),
  uniqueIndex("expected_matches_tx_uq").on(t.transactionId),
]);

/* Planner */
export const budgets = pgTable("budgets", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  amountMinor: money("amount_minor").notNull(), // monthly limit
  rollover: boolean("rollover").notNull().default(false),
  startMonth: text("start_month").notNull(), // YYYY-MM; rollover counts from here
  createdAt: createdAt(),
}, (t) => [uniqueIndex("budgets_workspace_category_uq").on(t.workspaceId, t.categoryId)]);

export const goals = pgTable("goals", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetMinor: money("target_minor").notNull(),
  targetDate: date("target_date"),
  // When set, progress is that account's value instead of hand-entered contributions.
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  // Fixed: the monthly amount is held back from free-to-spend like a bill. Flexible: only money actually put aside is.
  fixed: boolean("fixed").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("goals_workspace_idx").on(t.workspaceId)]);

export const goalContributions = pgTable("goal_contributions", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  amountMinor: money("amount_minor").notNull(), // negative = withdrawn
  madeOn: date("made_on").notNull(),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("goal_contributions_goal_idx").on(t.goalId)]);

/* Wishlist */
export const wishType = pgEnum("wish_type", ["need", "want", "desire"]);
export const wishStatus = pgEnum("wish_status", ["wanted", "planned", "bought", "dropped"]);

export const wishlistItems = pgTable("wishlist_items", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  priceMinor: money("price_minor").notNull(), // workspace home currency
  type: wishType("type").notNull().default("want"),
  priority: integer("priority").notNull().default(2), // 1 high, 2 medium, 3 low
  targetDate: date("target_date"),
  notes: text("notes"),
  status: wishStatus("status").notNull().default("wanted"),
  // Optional EMI option. A rate of 0 means a no-cost EMI.
  downPaymentMinor: money("down_payment_minor"),
  emiTenureMonths: integer("emi_tenure_months"),
  emiRatePct: numeric("emi_rate_pct", { precision: 7, scale: 4 }),
  boughtOn: date("bought_on"),
  createdAt: createdAt(),
}, (t) => [index("wishlist_items_workspace_idx").on(t.workspaceId, t.status)]);

export const wishlistLinks = pgTable("wishlist_links", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => wishlistItems.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  priceMinor: money("price_minor"), // price at that store, if you noted it
  createdAt: createdAt(),
}, (t) => [index("wishlist_links_item_idx").on(t.itemId)]);

/* AI (bring your own key) */
export const aiCredentials = pgTable("ai_credentials", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("google"),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  last4: text("last4").notNull(),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** One row per AI call: the usage log and the rate limiter's source of truth. */
export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  keySource: text("key_source").notNull().default("user"), // "user" = their own key, "admin" = the app key
  model: text("model").notNull(),
  ok: boolean("ok").notNull(),
  error: text("error"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
}, (t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt)]);

/** Saved AI write-ups (monthly summary, wishlist advice) so a page view never spends a request. */
export const aiSummaries = pgTable("ai_summaries", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "month" | "wishlist"
  key: text("key").notNull(), // YYYY-MM for months, "current" for the wishlist
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("ai_summaries_uq").on(t.workspaceId, t.kind, t.key)]);

/* MCP: personal access tokens (only the SHA-256 hash is stored) and a call log for rate limiting and audit */
export const mcpTokens = pgTable("mcp_tokens", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default(["read"]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("mcp_tokens_user_idx").on(t.userId)]);

export const mcpCalls = pgTable("mcp_calls", {
  id: id(),
  tokenId: text("token_id").notNull().references(() => mcpTokens.id, { onDelete: "cascade" }),
  tool: text("tool").notNull(),
  ok: boolean("ok").notNull(),
  createdAt: createdAt(),
}, (t) => [index("mcp_calls_token_time_idx").on(t.tokenId, t.createdAt)]);

/* Web push: bill reminders */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
}, (t) => [index("push_subscriptions_user_idx").on(t.userId)]);

// One row per reminder actually sent, so a cron that runs twice in a day never sends twice.
export const pushSent = pgTable("push_sent", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  reminderKey: text("reminder_key").notNull(),
  day: date("day").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("push_sent_uq").on(t.userId, t.reminderKey, t.day)]);

/* Savings and investments */
// What an investment is worth on a date, entered by hand. Invested money is what was transferred in.
export const accountValuations = pgTable("account_valuations", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  onDate: date("on_date").notNull(),
  valueMinor: money("value_minor").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("account_valuations_uq").on(t.accountId, t.onDate)]);

export const fixedDeposits = pgTable("fixed_deposits", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }), // the FD's own asset account
  payoutAccountId: text("payout_account_id").references(() => accounts.id, { onDelete: "set null" }), // where it pays out
  name: text("name").notNull(),
  principalMinor: money("principal_minor").notNull(),
  annualRatePct: numeric("annual_rate_pct", { precision: 7, scale: 4 }).notNull(),
  startOn: date("start_on").notNull(),
  maturityOn: date("maturity_on").notNull(),
  maturityMinor: money("maturity_minor").notNull(), // as the bank states it, or estimated with quarterly compounding
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("fixed_deposits_workspace_idx").on(t.workspaceId)]);

// One row per month (the latest values that month), so net worth has a history. Written by actions and a daily job.
export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  liquidMinor: money("liquid_minor").notNull(),
  assetsMinor: money("assets_minor").notNull(),
  liabilitiesMinor: money("liabilities_minor").notNull(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("net_worth_snapshots_uq").on(t.workspaceId, t.month)]);
