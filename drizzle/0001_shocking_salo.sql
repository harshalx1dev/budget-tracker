CREATE TYPE "public"."rule_source" AS ENUM('manual', 'learned');--> statement-breakpoint
CREATE TYPE "public"."tx_source" AS ENUM('manual', 'quick', 'import', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pattern" text NOT NULL,
	"category_id" text NOT NULL,
	"source" "rule_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer NOT NULL,
	"added_count" integer NOT NULL,
	"duplicate_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "aliases" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" "tx_status" DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "source" "tx_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "transfer_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_hash" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "raw_narration" text;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_rules_pattern_uq" ON "category_rules" USING btree ("workspace_id","pattern");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_transfer_idx" ON "transactions" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_import_hash_uq" ON "transactions" USING btree ("workspace_id","account_id","import_hash");