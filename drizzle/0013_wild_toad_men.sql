ALTER TABLE "workspaces" ADD COLUMN "auto_emi" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "auto_emi_over_minor" bigint DEFAULT 5000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "auto_emi_months" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "auto_emi_rate_pct" numeric(7, 4) DEFAULT '18' NOT NULL;