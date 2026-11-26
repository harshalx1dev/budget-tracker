ALTER TYPE "public"."account_type" ADD VALUE 'savings';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'fd';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'mutual_fund';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'stocks';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'retirement';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'gold';--> statement-breakpoint
ALTER TYPE "public"."account_type" ADD VALUE 'other_asset';--> statement-breakpoint
CREATE TABLE "account_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text NOT NULL,
	"on_date" date NOT NULL,
	"value_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text,
	"payout_account_id" text,
	"name" text NOT NULL,
	"principal_minor" bigint NOT NULL,
	"annual_rate_pct" numeric(7, 4) NOT NULL,
	"start_on" date NOT NULL,
	"maturity_on" date NOT NULL,
	"maturity_minor" bigint NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"month" text NOT NULL,
	"liquid_minor" bigint NOT NULL,
	"assets_minor" bigint NOT NULL,
	"liabilities_minor" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "essential" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "goals" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "transfer_to_account_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "emergency_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "emergency_account_id" text;--> statement-breakpoint
ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_valuations" ADD CONSTRAINT "account_valuations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_deposits" ADD CONSTRAINT "fixed_deposits_payout_account_id_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_valuations_uq" ON "account_valuations" USING btree ("account_id","on_date");--> statement-breakpoint
CREATE INDEX "fixed_deposits_workspace_idx" ON "fixed_deposits" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_snapshots_uq" ON "net_worth_snapshots" USING btree ("workspace_id","month");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_transfer_to_account_id_accounts_id_fk" FOREIGN KEY ("transfer_to_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "categories" SET "essential" = true WHERE "kind" = 'expense' AND "name" IN ('Groceries', 'Transport', 'Rent', 'Bills & utilities', 'EMI', 'Health');
--> statement-breakpoint
INSERT INTO "categories" ("id", "workspace_id", "name", "kind") SELECT gen_random_uuid()::text, "id", 'Interest', 'income' FROM "workspaces" ON CONFLICT DO NOTHING;
