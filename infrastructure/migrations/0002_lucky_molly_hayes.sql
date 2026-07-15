CREATE TABLE "jejak"."data_quality_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"blocks_automation" boolean NOT NULL,
	"row_number" integer,
	"field_name" text,
	"safe_detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."decision_snapshot_metadata" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"settlement_stream_id" uuid NOT NULL,
	"predecessor_settlement_stream_id" uuid,
	"ledger_high_water_mark" text,
	"included_event_hashes" jsonb NOT NULL,
	"quality_report_hash" text NOT NULL,
	"snapshot_schema_version" text NOT NULL,
	"feature_schema_version" text NOT NULL,
	"blocks_automation" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."ingestion_quality_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"report_hash" text NOT NULL,
	"report_payload" jsonb NOT NULL,
	"blocks_automation" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."ingestion_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"marketplace_connection_id" uuid,
	"source_namespace" text NOT NULL,
	"format_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_unique_rows" integer DEFAULT 0 NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"rejected_rows" integer DEFAULT 0 NOT NULL,
	"quality_score_bps" integer DEFAULT 0 NOT NULL,
	"safe_failure_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ingestion_runs_quality_bps" CHECK ("jejak"."ingestion_runs"."quality_score_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "jejak"."ingestion_source_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"object_secret_ref" text NOT NULL,
	"byte_hash" text NOT NULL,
	"byte_count" bigint NOT NULL,
	"media_type" text DEFAULT 'text/csv' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."marketplace_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ingestion_run_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"marketplace_connection_id" uuid,
	"source_namespace" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_minor" numeric(38, 0) NOT NULL,
	"currency" text NOT NULL,
	"scale" smallint NOT NULL,
	"issuer" text,
	"order_reference" text,
	"payout_reference" text,
	"source_status" text,
	"source_row_hash" text NOT NULL,
	"source_row_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_events_scale" CHECK ("jejak"."marketplace_events"."scale" between 0 and 18)
);
--> statement-breakpoint
CREATE TABLE "jejak"."risk_evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"settlement_stream_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"data_snapshot_hash" text NOT NULL,
	"feature_snapshot_hash" text NOT NULL,
	"policy_version" text NOT NULL,
	"model_id" text NOT NULL,
	"model_version" text NOT NULL,
	"decision" text NOT NULL,
	"sds_bps" integer NOT NULL,
	"expected_dilution_bps" integer NOT NULL,
	"tail_dilution_bps" integer NOT NULL,
	"eligible_amount_minor" numeric(38, 0) NOT NULL,
	"eligible_currency" text NOT NULL,
	"eligible_scale" smallint NOT NULL,
	"eligible_issuer" text,
	"max_advance_amount_minor" numeric(38, 0) NOT NULL,
	"max_advance_currency" text NOT NULL,
	"max_advance_scale" smallint NOT NULL,
	"max_advance_issuer" text,
	"reason_codes" jsonb NOT NULL,
	"response_hash" text NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_evaluations_sds_bps" CHECK ("jejak"."risk_evaluations"."sds_bps" between 0 and 10000),
	CONSTRAINT "risk_evaluations_expected_dilution_bps" CHECK ("jejak"."risk_evaluations"."expected_dilution_bps" between 0 and 10000),
	CONSTRAINT "risk_evaluations_tail_dilution_bps" CHECK ("jejak"."risk_evaluations"."tail_dilution_bps" between 0 and 10000),
	CONSTRAINT "risk_evaluations_eligible_scale" CHECK ("jejak"."risk_evaluations"."eligible_scale" between 0 and 18),
	CONSTRAINT "risk_evaluations_max_advance_scale" CHECK ("jejak"."risk_evaluations"."max_advance_scale" between 0 and 18)
);
--> statement-breakpoint
ALTER TABLE "jejak"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."data_quality_issues" ADD CONSTRAINT "data_quality_issues_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "jejak"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."decision_snapshot_metadata" ADD CONSTRAINT "decision_snapshot_metadata_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."decision_snapshot_metadata" ADD CONSTRAINT "decision_snapshot_metadata_settlement_stream_id_settlement_streams_id_fk" FOREIGN KEY ("settlement_stream_id") REFERENCES "jejak"."settlement_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."decision_snapshot_metadata" ADD CONSTRAINT "decision_snapshot_metadata_predecessor_settlement_stream_id_settlement_streams_id_fk" FOREIGN KEY ("predecessor_settlement_stream_id") REFERENCES "jejak"."settlement_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_quality_reports" ADD CONSTRAINT "ingestion_quality_reports_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_quality_reports" ADD CONSTRAINT "ingestion_quality_reports_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "jejak"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "jejak"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_marketplace_connection_id_marketplace_connections_id_fk" FOREIGN KEY ("marketplace_connection_id") REFERENCES "jejak"."marketplace_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_source_files" ADD CONSTRAINT "ingestion_source_files_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."ingestion_source_files" ADD CONSTRAINT "ingestion_source_files_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "jejak"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_events" ADD CONSTRAINT "marketplace_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_events" ADD CONSTRAINT "marketplace_events_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "jejak"."ingestion_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_events" ADD CONSTRAINT "marketplace_events_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "jejak"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_events" ADD CONSTRAINT "marketplace_events_marketplace_connection_id_marketplace_connections_id_fk" FOREIGN KEY ("marketplace_connection_id") REFERENCES "jejak"."marketplace_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."risk_evaluations" ADD CONSTRAINT "risk_evaluations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."risk_evaluations" ADD CONSTRAINT "risk_evaluations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."risk_evaluations" ADD CONSTRAINT "risk_evaluations_settlement_stream_id_settlement_streams_id_fk" FOREIGN KEY ("settlement_stream_id") REFERENCES "jejak"."settlement_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_quality_issues_run_idx" ON "jejak"."data_quality_issues" USING btree ("tenant_id","ingestion_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_snapshot_metadata_stream_uq" ON "jejak"."decision_snapshot_metadata" USING btree ("tenant_id","settlement_stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_quality_reports_run_uq" ON "jejak"."ingestion_quality_reports" USING btree ("tenant_id","ingestion_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_runs_content_uq" ON "jejak"."ingestion_runs" USING btree ("tenant_id","seller_id","content_hash");--> statement-breakpoint
CREATE INDEX "ingestion_runs_tenant_status_idx" ON "jejak"."ingestion_runs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_source_files_run_uq" ON "jejak"."ingestion_source_files" USING btree ("tenant_id","ingestion_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_events_external_uq" ON "jejak"."marketplace_events" USING btree ("tenant_id","source_namespace","external_event_id");--> statement-breakpoint
CREATE INDEX "marketplace_events_snapshot_idx" ON "jejak"."marketplace_events" USING btree ("tenant_id","seller_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_evaluations_request_uq" ON "jejak"."risk_evaluations" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE INDEX "risk_evaluations_claim_idx" ON "jejak"."risk_evaluations" USING btree ("tenant_id","claim_id","evaluated_at");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON
  jejak.ingestion_runs,
  jejak.ingestion_source_files,
  jejak.marketplace_events,
  jejak.data_quality_issues,
  jejak.ingestion_quality_reports,
  jejak.decision_snapshot_metadata,
  jejak.risk_evaluations
TO jejak_api;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON
  jejak.ingestion_runs,
  jejak.ingestion_source_files,
  jejak.marketplace_events,
  jejak.data_quality_issues,
  jejak.ingestion_quality_reports,
  jejak.decision_snapshot_metadata,
  jejak.risk_evaluations
TO jejak_worker;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT column1 FROM (VALUES
      ('ingestion_runs'),
      ('ingestion_source_files'),
      ('marketplace_events'),
      ('data_quality_issues'),
      ('ingestion_quality_reports'),
      ('decision_snapshot_metadata'),
      ('risk_evaluations')
    ) AS lifecycle_tables
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
$$;
--> statement-breakpoint
CREATE FUNCTION jejak.reject_lifecycle_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable lifecycle records cannot be updated or deleted' USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT column1 FROM (VALUES
      ('ingestion_source_files'),
      ('marketplace_events'),
      ('data_quality_issues'),
      ('ingestion_quality_reports'),
      ('decision_snapshot_metadata'),
      ('risk_evaluations')
    ) AS immutable_tables
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON jejak.%I FOR EACH ROW EXECUTE FUNCTION jejak.reject_lifecycle_immutable_mutation()',
      table_name || '_append_only',
      table_name
    );
  END LOOP;
END
$$;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON
  jejak.ingestion_source_files,
  jejak.marketplace_events,
  jejak.data_quality_issues,
  jejak.ingestion_quality_reports,
  jejak.decision_snapshot_metadata,
  jejak.risk_evaluations
FROM jejak_api, jejak_worker;
