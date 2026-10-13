ALTER TABLE "user" ADD COLUMN "consent_errors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "consent_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "consent_updated_at" timestamp with time zone;