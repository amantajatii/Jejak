CREATE TABLE "jejak"."anchor_payout_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"partner_idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"partner_reference" text NOT NULL,
	"receipt_hash" text NOT NULL,
	"adapter_mode" text NOT NULL,
	"sandbox" boolean NOT NULL,
	"status" text NOT NULL,
	"resolution" text NOT NULL,
	"source_amount_minor" numeric(38, 0) NOT NULL,
	"source_currency" text NOT NULL,
	"source_scale" smallint NOT NULL,
	"source_issuer" text,
	"target_gross_amount_minor" numeric(38, 0) NOT NULL,
	"target_gross_currency" text NOT NULL,
	"target_gross_scale" smallint NOT NULL,
	"target_gross_issuer" text,
	"fee_amount_minor" numeric(38, 0) NOT NULL,
	"fee_currency" text NOT NULL,
	"fee_scale" smallint NOT NULL,
	"fee_issuer" text,
	"target_net_amount_minor" numeric(38, 0) NOT NULL,
	"target_net_currency" text NOT NULL,
	"target_net_scale" smallint NOT NULL,
	"target_net_issuer" text,
	"rate_numerator" numeric(38, 0) NOT NULL,
	"rate_denominator" numeric(38, 0) NOT NULL,
	"fee_bps" integer NOT NULL,
	"rounding_mode" text NOT NULL,
	"partner_completed_at" timestamp with time zone NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "anchor_payout_receipts_source_positive" CHECK ("jejak"."anchor_payout_receipts"."source_amount_minor" > 0),
	CONSTRAINT "anchor_payout_receipts_gross_positive" CHECK ("jejak"."anchor_payout_receipts"."target_gross_amount_minor" > 0),
	CONSTRAINT "anchor_payout_receipts_fee_nonnegative" CHECK ("jejak"."anchor_payout_receipts"."fee_amount_minor" >= 0),
	CONSTRAINT "anchor_payout_receipts_net_positive" CHECK ("jejak"."anchor_payout_receipts"."target_net_amount_minor" > 0),
	CONSTRAINT "anchor_payout_receipts_balanced" CHECK ("jejak"."anchor_payout_receipts"."target_gross_amount_minor" = "jejak"."anchor_payout_receipts"."fee_amount_minor" + "jejak"."anchor_payout_receipts"."target_net_amount_minor"),
	CONSTRAINT "anchor_payout_receipts_scales" CHECK ("jejak"."anchor_payout_receipts"."source_scale" between 0 and 18 and "jejak"."anchor_payout_receipts"."target_gross_scale" between 0 and 18 and "jejak"."anchor_payout_receipts"."fee_scale" between 0 and 18 and "jejak"."anchor_payout_receipts"."target_net_scale" between 0 and 18),
	CONSTRAINT "anchor_payout_receipts_target_units" CHECK ("jejak"."anchor_payout_receipts"."target_gross_currency" = "jejak"."anchor_payout_receipts"."fee_currency" and "jejak"."anchor_payout_receipts"."target_gross_currency" = "jejak"."anchor_payout_receipts"."target_net_currency" and "jejak"."anchor_payout_receipts"."target_gross_scale" = "jejak"."anchor_payout_receipts"."fee_scale" and "jejak"."anchor_payout_receipts"."target_gross_scale" = "jejak"."anchor_payout_receipts"."target_net_scale" and "jejak"."anchor_payout_receipts"."target_gross_issuer" is not distinct from "jejak"."anchor_payout_receipts"."fee_issuer" and "jejak"."anchor_payout_receipts"."target_gross_issuer" is not distinct from "jejak"."anchor_payout_receipts"."target_net_issuer"),
	CONSTRAINT "anchor_payout_receipts_rate_positive" CHECK ("jejak"."anchor_payout_receipts"."rate_numerator" > 0 and "jejak"."anchor_payout_receipts"."rate_denominator" > 0),
	CONSTRAINT "anchor_payout_receipts_fee_bps" CHECK ("jejak"."anchor_payout_receipts"."fee_bps" between 0 and 10000),
	CONSTRAINT "anchor_payout_receipts_rounding" CHECK ("jejak"."anchor_payout_receipts"."rounding_mode" = 'DOWN'),
	CONSTRAINT "anchor_payout_receipts_status" CHECK ("jejak"."anchor_payout_receipts"."status" = 'PAID'),
	CONSTRAINT "anchor_payout_receipts_resolution" CHECK ("jejak"."anchor_payout_receipts"."resolution" in ('DIRECT', 'RECONCILED')),
	CONSTRAINT "anchor_payout_receipts_mode" CHECK ("jejak"."anchor_payout_receipts"."adapter_mode" in ('SANDBOX', 'PRODUCTION')),
	CONSTRAINT "anchor_payout_receipts_sandbox_label" CHECK ("jejak"."anchor_payout_receipts"."sandbox" = ("jejak"."anchor_payout_receipts"."adapter_mode" = 'SANDBOX')),
	CONSTRAINT "anchor_payout_receipts_hash_lengths" CHECK (char_length("jejak"."anchor_payout_receipts"."request_hash") = 64 and char_length("jejak"."anchor_payout_receipts"."receipt_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "jejak"."anchor_payout_receipts" ADD CONSTRAINT "anchor_payout_receipts_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."anchor_payout_receipts" ADD CONSTRAINT "anchor_payout_receipts_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "jejak"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_payout_receipts_idempotency_uq" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","partner_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_payout_receipts_partner_uq" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","partner_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "anchor_payout_receipts_hash_uq" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","receipt_hash");--> statement-breakpoint
CREATE INDEX "anchor_payout_receipts_operation_idx" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","operation_id");--> statement-breakpoint
CREATE INDEX "anchor_payout_receipts_aggregate_idx" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","aggregate_id");--> statement-breakpoint
CREATE INDEX "anchor_payout_receipts_status_idx" ON "jejak"."anchor_payout_receipts" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
REVOKE ALL ON jejak.anchor_payout_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON jejak.anchor_payout_receipts TO jejak_api, jejak_worker;
REVOKE UPDATE, DELETE, TRUNCATE ON jejak.anchor_payout_receipts FROM jejak_api, jejak_worker;
--> statement-breakpoint
ALTER TABLE jejak.anchor_payout_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jejak.anchor_payout_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY anchor_payout_receipts_tenant_isolation
  ON jejak.anchor_payout_receipts
  TO jejak_api, jejak_worker
  USING (tenant_id = NULLIF(current_setting('jejak.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('jejak.tenant_id', true), '')::uuid);
