CREATE TABLE "jejak"."chain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"network" text NOT NULL,
	"contract_name" text NOT NULL,
	"contract_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"ledger_sequence" integer NOT NULL,
	"transaction_hash" text NOT NULL,
	"transaction_index" integer NOT NULL,
	"operation_index" integer NOT NULL,
	"rpc_cursor" text NOT NULL,
	"claim_key" text,
	"actor_address" text NOT NULL,
	"safe_payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"ledger_closed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_events_ledger_positive" CHECK ("jejak"."chain_events"."ledger_sequence" > 0),
	CONSTRAINT "chain_events_hash_lengths" CHECK (char_length("jejak"."chain_events"."transaction_hash") = 64 and char_length("jejak"."chain_events"."payload_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "jejak"."chain_portfolio_positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid,
	"claim_key" text NOT NULL,
	"network" text NOT NULL,
	"state" text DEFAULT 'ELIGIBLE' NOT NULL,
	"currency" text NOT NULL,
	"scale" smallint NOT NULL,
	"issuer" text,
	"approved_principal_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"issued_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"principal_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"outstanding_principal_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"repaid_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"settlement_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"servicing_fee_paid_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"financing_fee_paid_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"first_loss_funded_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"first_loss_consumed_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"senior_loss_base_units" numeric(38, 0) DEFAULT '0' NOT NULL,
	"last_ledger" integer NOT NULL,
	"last_event_id" text NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_portfolio_positions_scale" CHECK ("jejak"."chain_portfolio_positions"."scale" between 0 and 18),
	CONSTRAINT "chain_portfolio_positions_nonnegative" CHECK ("jejak"."chain_portfolio_positions"."approved_principal_base_units" >= 0 and "jejak"."chain_portfolio_positions"."issued_base_units" >= 0
        and "jejak"."chain_portfolio_positions"."principal_base_units" >= 0 and "jejak"."chain_portfolio_positions"."outstanding_principal_base_units" >= 0
        and "jejak"."chain_portfolio_positions"."repaid_base_units" >= 0 and "jejak"."chain_portfolio_positions"."settlement_base_units" >= 0
        and "jejak"."chain_portfolio_positions"."servicing_fee_paid_base_units" >= 0 and "jejak"."chain_portfolio_positions"."financing_fee_paid_base_units" >= 0
        and "jejak"."chain_portfolio_positions"."first_loss_funded_base_units" >= 0 and "jejak"."chain_portfolio_positions"."first_loss_consumed_base_units" >= 0
        and "jejak"."chain_portfolio_positions"."senior_loss_base_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jejak"."chain_reconciliation_expectations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chain_submission_id" uuid NOT NULL,
	"claim_key" text,
	"expected_event_type" text NOT NULL,
	"expected_amount" numeric(38, 0),
	"expected_result_hash" text,
	"expected_claim_state" text,
	"approved_principal_base_units" numeric(38, 0),
	"expected_servicing_fee_paid" numeric(38, 0),
	"expected_financing_fee_paid" numeric(38, 0),
	"expected_final_settlement" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_reconciliation_expectations_nonnegative" CHECK (("jejak"."chain_reconciliation_expectations"."expected_amount" is null or "jejak"."chain_reconciliation_expectations"."expected_amount" >= 0)
        and ("jejak"."chain_reconciliation_expectations"."approved_principal_base_units" is null or "jejak"."chain_reconciliation_expectations"."approved_principal_base_units" >= 0)
        and ("jejak"."chain_reconciliation_expectations"."expected_servicing_fee_paid" is null or "jejak"."chain_reconciliation_expectations"."expected_servicing_fee_paid" >= 0)
        and ("jejak"."chain_reconciliation_expectations"."expected_financing_fee_paid" is null or "jejak"."chain_reconciliation_expectations"."expected_financing_fee_paid" >= 0))
);
--> statement-breakpoint
CREATE TABLE "jejak"."chain_reconciliation_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"expectation_id" uuid,
	"chain_event_id" uuid,
	"claim_key" text,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"message" text NOT NULL,
	"retryable" boolean NOT NULL,
	"safe_expected" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safe_actual" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_reconciliation_results_outcome" CHECK ("jejak"."chain_reconciliation_results"."outcome" in ('RECONCILED', 'MISMATCH'))
);
--> statement-breakpoint
ALTER TABLE "jejak"."chain_event_checkpoints" ADD COLUMN "contract_name" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "jejak"."chain_event_checkpoints" ALTER COLUMN "contract_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "jejak"."chain_event_checkpoints" ADD COLUMN "rpc_cursor" text;--> statement-breakpoint
ALTER TABLE "jejak"."chain_event_checkpoints" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jejak"."chain_events" ADD CONSTRAINT "chain_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_portfolio_positions" ADD CONSTRAINT "chain_portfolio_positions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_portfolio_positions" ADD CONSTRAINT "chain_portfolio_positions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_reconciliation_expectations" ADD CONSTRAINT "chain_reconciliation_expectations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_reconciliation_expectations" ADD CONSTRAINT "chain_reconciliation_expectations_chain_submission_id_chain_submissions_id_fk" FOREIGN KEY ("chain_submission_id") REFERENCES "jejak"."chain_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_reconciliation_results" ADD CONSTRAINT "chain_reconciliation_results_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_reconciliation_results" ADD CONSTRAINT "chain_reconciliation_results_expectation_id_chain_reconciliation_expectations_id_fk" FOREIGN KEY ("expectation_id") REFERENCES "jejak"."chain_reconciliation_expectations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_reconciliation_results" ADD CONSTRAINT "chain_reconciliation_results_chain_event_id_chain_events_id_fk" FOREIGN KEY ("chain_event_id") REFERENCES "jejak"."chain_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_identity_uq" ON "jejak"."chain_events" USING btree ("tenant_id","network","contract_id","event_id");--> statement-breakpoint
CREATE INDEX "chain_events_transaction_idx" ON "jejak"."chain_events" USING btree ("tenant_id","transaction_hash","event_type");--> statement-breakpoint
CREATE INDEX "chain_events_claim_idx" ON "jejak"."chain_events" USING btree ("tenant_id","claim_key","ledger_sequence","event_id");--> statement-breakpoint
CREATE INDEX "chain_events_audit_page_idx" ON "jejak"."chain_events" USING btree ("tenant_id","ledger_closed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_portfolio_positions_claim_uq" ON "jejak"."chain_portfolio_positions" USING btree ("tenant_id","network","claim_key");--> statement-breakpoint
CREATE INDEX "chain_portfolio_positions_summary_idx" ON "jejak"."chain_portfolio_positions" USING btree ("tenant_id","currency","scale","issuer","state");--> statement-breakpoint
CREATE INDEX "chain_portfolio_positions_claim_fk_idx" ON "jejak"."chain_portfolio_positions" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_reconciliation_expectations_submission_uq" ON "jejak"."chain_reconciliation_expectations" USING btree ("tenant_id","chain_submission_id");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_expectations_claim_idx" ON "jejak"."chain_reconciliation_expectations" USING btree ("tenant_id","claim_key","created_at");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_results_expectation_idx" ON "jejak"."chain_reconciliation_results" USING btree ("tenant_id","expectation_id","created_at");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_results_open_idx" ON "jejak"."chain_reconciliation_results" USING btree ("tenant_id","outcome","kind","created_at");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_results_event_idx" ON "jejak"."chain_reconciliation_results" USING btree ("chain_event_id");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_expectations_submission_fk_idx" ON "jejak"."chain_reconciliation_expectations" USING btree ("chain_submission_id");--> statement-breakpoint
CREATE INDEX "chain_reconciliation_results_expectation_fk_idx" ON "jejak"."chain_reconciliation_results" USING btree ("expectation_id");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_page_idx" ON "jejak"."audit_events" USING btree ("tenant_id", "created_at" DESC, "id" DESC);--> statement-breakpoint
CREATE INDEX "audit_events_action_page_idx" ON "jejak"."audit_events" USING btree ("tenant_id", "action", "created_at" DESC, "id" DESC);--> statement-breakpoint
CREATE INDEX "audit_events_resource_page_idx" ON "jejak"."audit_events" USING btree ("tenant_id", "resource_type", "created_at" DESC, "id" DESC);--> statement-breakpoint
CREATE INDEX "chain_events_waterfall_result_hash_idx" ON "jejak"."chain_events" USING btree
  ("tenant_id", (("safe_payload" ->> 'resultHash')))
  WHERE "event_type" = 'waterfall.executed';--> statement-breakpoint
CREATE INDEX "settlement_events_claim_page_idx" ON "jejak"."settlement_events" USING btree
  ("tenant_id", "claim_id", "occurred_at" DESC, "id" DESC);--> statement-breakpoint
CREATE INDEX "settlement_events_claim_fk_idx" ON "jejak"."settlement_events" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waterfall_results_result_hash_uq" ON "jejak"."waterfall_results" USING btree ("tenant_id", "result_hash");--> statement-breakpoint
CREATE INDEX "waterfall_results_claim_page_idx" ON "jejak"."waterfall_results" USING btree
  ("tenant_id", "claim_id", "created_at" DESC, "id" DESC);--> statement-breakpoint
CREATE INDEX "waterfall_results_claim_fk_idx" ON "jejak"."waterfall_results" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "waterfall_results_settlement_event_fk_idx" ON "jejak"."waterfall_results" USING btree ("settlement_event_id");--> statement-breakpoint
REVOKE ALL ON jejak.chain_events, jejak.chain_portfolio_positions,
  jejak.chain_reconciliation_expectations, jejak.chain_reconciliation_results
  FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON jejak.chain_events TO jejak_worker;--> statement-breakpoint
GRANT SELECT, INSERT ON jejak.chain_reconciliation_expectations TO jejak_api, jejak_worker;--> statement-breakpoint
GRANT SELECT, INSERT ON jejak.chain_reconciliation_results TO jejak_worker;
GRANT SELECT ON jejak.chain_reconciliation_results TO jejak_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON jejak.chain_portfolio_positions TO jejak_worker;
GRANT SELECT ON jejak.chain_portfolio_positions TO jejak_api;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON jejak.chain_events,
  jejak.chain_reconciliation_expectations, jejak.chain_reconciliation_results
  FROM jejak_api, jejak_worker;--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON jejak.chain_portfolio_positions FROM jejak_api, jejak_worker;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON jejak.settlement_events, jejak.waterfall_results
  FROM jejak_api, jejak_worker;--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT column1 FROM (VALUES
      ('chain_events'),
      ('chain_portfolio_positions'),
      ('chain_reconciliation_expectations'),
      ('chain_reconciliation_results')
    ) AS chain_tenant_tables
  LOOP
    EXECUTE format('ALTER TABLE jejak.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE jejak.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON jejak.%I TO jejak_api, jejak_worker USING (tenant_id = NULLIF(current_setting(''jejak.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''jejak.tenant_id'', true), '''')::uuid)',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION jejak.reject_chain_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canonical chain and settlement records are append-only' USING ERRCODE = '55000';
END
$$;--> statement-breakpoint
CREATE TRIGGER chain_events_append_only
BEFORE UPDATE OR DELETE ON jejak.chain_events
FOR EACH ROW EXECUTE FUNCTION jejak.reject_chain_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER chain_reconciliation_expectations_append_only
BEFORE UPDATE OR DELETE ON jejak.chain_reconciliation_expectations
FOR EACH ROW EXECUTE FUNCTION jejak.reject_chain_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER chain_reconciliation_results_append_only
BEFORE UPDATE OR DELETE ON jejak.chain_reconciliation_results
FOR EACH ROW EXECUTE FUNCTION jejak.reject_chain_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER settlement_events_append_only
BEFORE UPDATE OR DELETE ON jejak.settlement_events
FOR EACH ROW EXECUTE FUNCTION jejak.reject_chain_immutable_mutation();--> statement-breakpoint
CREATE TRIGGER waterfall_results_append_only
BEFORE UPDATE OR DELETE ON jejak.waterfall_results
FOR EACH ROW EXECUTE FUNCTION jejak.reject_chain_immutable_mutation();
