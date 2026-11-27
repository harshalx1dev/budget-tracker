ALTER TABLE "wishlist_items" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "bought_count" integer DEFAULT 0 NOT NULL;