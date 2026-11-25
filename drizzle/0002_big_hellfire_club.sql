CREATE TYPE "public"."expected_source" AS ENUM('loan', 'rule');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."revision_kind" AS ENUM('emi', 'rate', 'prepayment');--> statement-breakpoint
CREATE TABLE "expected_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_kind" "expected_source" NOT NULL,
	"source_id" text NOT NULL,
	"due_on" date NOT NULL,
	"transaction_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"loan_id" text NOT NULL,
	"effective_on" date NOT NULL,
	"kind" "revision_kind" NOT NULL,
	"emi_minor" bigint,
	"rate_pct" numeric(7, 4),
	"amount_minor" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text,
	"category_id" text,
	"name" text NOT NULL,
	"lender" text,
	"emi_minor" bigint NOT NULL,
	"first_due_on" date NOT NULL,
	"instalments" integer NOT NULL,
	"principal_minor" bigint,
	"annual_rate_pct" numeric(7, 4),
	"match_pattern" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text,
	"category_id" text,
	"name" text NOT NULL,
	"kind" "tx_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"frequency" "frequency" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"max_count" integer,
	"match_pattern" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expected_matches" ADD CONSTRAINT "expected_matches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_matches" ADD CONSTRAINT "expected_matches_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_revisions" ADD CONSTRAINT "loan_revisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_revisions" ADD CONSTRAINT "loan_revisions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expected_matches_occurrence_uq" ON "expected_matches" USING btree ("source_kind","source_id","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "expected_matches_tx_uq" ON "expected_matches" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "loan_revisions_loan_idx" ON "loan_revisions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loans_workspace_idx" ON "loans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_workspace_idx" ON "recurring_rules" USING btree ("workspace_id");
--> statement-breakpoint
INSERT INTO "categories" ("id", "workspace_id", "name", "kind") SELECT gen_random_uuid()::text, "id", 'Investments', 'expense' FROM "workspaces" ON CONFLICT DO NOTHING;
