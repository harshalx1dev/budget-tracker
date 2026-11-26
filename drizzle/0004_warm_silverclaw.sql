CREATE TYPE "public"."wish_status" AS ENUM('wanted', 'planned', 'bought', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."wish_type" AS ENUM('need', 'want', 'desire');--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"category_id" text,
	"title" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"type" "wish_type" DEFAULT 'want' NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"target_date" date,
	"notes" text,
	"status" "wish_status" DEFAULT 'wanted' NOT NULL,
	"down_payment_minor" bigint,
	"emi_tenure_months" integer,
	"emi_rate_pct" numeric(7, 4),
	"bought_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"item_id" text NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"price_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "max_emi_ratio_pct" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_links" ADD CONSTRAINT "wishlist_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_links" ADD CONSTRAINT "wishlist_links_item_id_wishlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wishlist_items_workspace_idx" ON "wishlist_items" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "wishlist_links_item_idx" ON "wishlist_links" USING btree ("item_id");