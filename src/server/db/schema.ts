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
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("owner"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)]);

/* Ledger */
export const accountType = pgEnum("account_type", ["cash", "bank", "card", "wallet"]);
export const txKind = pgEnum("tx_kind", ["income", "expense"]);
// pending = imported or quick-added without a trusted category; shows in the review inbox.
export const txStatus = pgEnum("tx_status", ["pending", "confirmed"]);
export const txSource = pgEnum("tx_source", ["manual", "quick", "import", "reconcile"]);

export const accounts = pgTable("accounts", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  currency: text("currency").notNull().default("INR"),
  // Words that route quick-add entries here, e.g. ["upi", "gpay"].
  aliases: text("aliases").array().notNull().default([]),
  openingBalanceMinor: money("opening_balance_minor").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("accounts_workspace_idx").on(t.workspaceId)]);

export const categories = pgTable("categories", {
  id: id(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: txKind("kind").notNull(),
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
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
