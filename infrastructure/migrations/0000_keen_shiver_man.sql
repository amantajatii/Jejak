CREATE SCHEMA "jejak";
--> statement-breakpoint
CREATE TYPE "jejak"."actor_role" AS ENUM('SELLER', 'ORIGINATOR', 'ISSUER', 'FACILITY', 'SERVICER', 'RESOLVER', 'ORACLE', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "jejak"."delivery_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "jejak"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "jejak"."membership_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "jejak"."record_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "jejak"."claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seller_id" uuid NOT NULL,
	"settlement_stream_id" uuid NOT NULL,
	"claim_key" text NOT NULL,
	"state" text NOT NULL,
	"eligible_amount_minor" numeric(38, 0) NOT NULL,
	"eligible_currency" text NOT NULL,
	"eligible_scale" smallint NOT NULL,
	"eligible_issuer" text,
	CONSTRAINT "claims_eligible_scale" CHECK ("jejak"."claims"."eligible_scale" between 0 and 18)
);
--> statement-breakpoint
CREATE TABLE "jejak"."control_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_hash" text NOT NULL,
	"document_secret_ref" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jejak"."eligibility_attestations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"signer_key_id" text NOT NULL,
	"envelope_hash" text NOT NULL,
	"status" text NOT NULL,
	"sds_bps" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eligibility_attestations_sds_bps" CHECK ("jejak"."eligibility_attestations"."sds_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "jejak"."facility_positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"financing_offer_id" uuid,
	"status" text NOT NULL,
	"chain_reference" text,
	"outstanding_amount_minor" numeric(38, 0) NOT NULL,
	"outstanding_currency" text NOT NULL,
	"outstanding_scale" smallint NOT NULL,
	"outstanding_issuer" text
);
--> statement-breakpoint
CREATE TABLE "jejak"."financing_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"status" text NOT NULL,
	"principal_amount_minor" numeric(38, 0) NOT NULL,
	"principal_currency" text NOT NULL,
	"principal_scale" smallint NOT NULL,
	"principal_issuer" text,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "financing_offers_principal_scale" CHECK ("jejak"."financing_offers"."principal_scale" between 0 and 18)
);
--> statement-breakpoint
CREATE TABLE "jejak"."marketplace_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seller_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"credential_secret_ref" text,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."resolution_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"resolver_membership_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"status" text NOT NULL,
	"evidence_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."sellers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seller_subject" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."settlement_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"event_hash" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."settlement_streams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"seller_id" uuid NOT NULL,
	"marketplace_connection_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"expected_settlement_amount_minor" numeric(38, 0) NOT NULL,
	"expected_settlement_currency" text NOT NULL,
	"expected_settlement_issuer" text,
	"expected_settlement_scale" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."waterfall_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"canonical_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"claim_id" uuid NOT NULL,
	"settlement_event_id" uuid NOT NULL,
	"result_hash" text NOT NULL,
	"allocation_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."institutional_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"inviter_membership_id" uuid NOT NULL,
	"requested_roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "jejak"."invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_user_profile_id" uuid,
	"accepted_membership_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."membership_role_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" "jejak"."actor_role" NOT NULL,
	"granted_by_membership_id" uuid,
	"reason" text NOT NULL,
	"status" "jejak"."record_status" DEFAULT 'ACTIVE' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "membership_role_grants_human_role" CHECK ("jejak"."membership_role_grants"."role" not in ('ORACLE', 'SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "jejak"."organization_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_profile_id" uuid NOT NULL,
	"status" "jejak"."membership_status" DEFAULT 'INVITED' NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"organization_type" text NOT NULL,
	"seller_subject_salt_ref" text NOT NULL,
	"status" "jejak"."record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."resource_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"status" "jejak"."record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"auth_subject" uuid NOT NULL,
	"status" "jejak"."record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."workload_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "jejak"."actor_role" NOT NULL,
	"key_id" text,
	"verifier" text,
	"secret_ref" text,
	"status" "jejak"."record_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "workload_identities_machine_role" CHECK ("jejak"."workload_identities"."role" in ('ORACLE', 'SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "jejak"."audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"membership_id" uuid,
	"role_grant_id" uuid,
	"request_id" uuid NOT NULL,
	"correlation_id" uuid,
	"idempotency_key" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"before_version" integer,
	"after_version" integer,
	"reason_code" text,
	"payload_hash" text,
	"result" text NOT NULL,
	"references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."chain_event_checkpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"network" text NOT NULL,
	"contract_id" text NOT NULL,
	"last_ledger" integer NOT NULL,
	"last_event_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."chain_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_id" uuid,
	"network" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"envelope_hash" text NOT NULL,
	"transaction_hash" text,
	"ledger_sequence" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."idempotency_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"response_status" integer,
	"response_body" jsonb,
	"response_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."operation_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"safe_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"correlation_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jejak"."outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"correlation_id" uuid,
	"causation_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "jejak"."delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"lease_owner" text,
	"last_error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jejak"."partner_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation_id" uuid,
	"partner" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"safe_error_class" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "jejak"."claims" ADD CONSTRAINT "claims_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."claims" ADD CONSTRAINT "claims_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "jejak"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."claims" ADD CONSTRAINT "claims_settlement_stream_id_settlement_streams_id_fk" FOREIGN KEY ("settlement_stream_id") REFERENCES "jejak"."settlement_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."control_evidence" ADD CONSTRAINT "control_evidence_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."control_evidence" ADD CONSTRAINT "control_evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."eligibility_attestations" ADD CONSTRAINT "eligibility_attestations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."eligibility_attestations" ADD CONSTRAINT "eligibility_attestations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."facility_positions" ADD CONSTRAINT "facility_positions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."facility_positions" ADD CONSTRAINT "facility_positions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."facility_positions" ADD CONSTRAINT "facility_positions_financing_offer_id_financing_offers_id_fk" FOREIGN KEY ("financing_offer_id") REFERENCES "jejak"."financing_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."financing_offers" ADD CONSTRAINT "financing_offers_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."financing_offers" ADD CONSTRAINT "financing_offers_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_connections" ADD CONSTRAINT "marketplace_connections_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."marketplace_connections" ADD CONSTRAINT "marketplace_connections_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "jejak"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."resolution_cases" ADD CONSTRAINT "resolution_cases_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."resolution_cases" ADD CONSTRAINT "resolution_cases_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."sellers" ADD CONSTRAINT "sellers_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."settlement_events" ADD CONSTRAINT "settlement_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."settlement_events" ADD CONSTRAINT "settlement_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."settlement_streams" ADD CONSTRAINT "settlement_streams_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."settlement_streams" ADD CONSTRAINT "settlement_streams_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "jejak"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."settlement_streams" ADD CONSTRAINT "settlement_streams_marketplace_connection_id_marketplace_connections_id_fk" FOREIGN KEY ("marketplace_connection_id") REFERENCES "jejak"."marketplace_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."waterfall_results" ADD CONSTRAINT "waterfall_results_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."waterfall_results" ADD CONSTRAINT "waterfall_results_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "jejak"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."waterfall_results" ADD CONSTRAINT "waterfall_results_settlement_event_id_settlement_events_id_fk" FOREIGN KEY ("settlement_event_id") REFERENCES "jejak"."settlement_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."institutional_invitations" ADD CONSTRAINT "institutional_invitations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."institutional_invitations" ADD CONSTRAINT "institutional_invitations_inviter_membership_id_organization_memberships_id_fk" FOREIGN KEY ("inviter_membership_id") REFERENCES "jejak"."organization_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."membership_role_grants" ADD CONSTRAINT "membership_role_grants_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."membership_role_grants" ADD CONSTRAINT "membership_role_grants_membership_id_organization_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "jejak"."organization_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."organization_memberships" ADD CONSTRAINT "organization_memberships_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."organization_memberships" ADD CONSTRAINT "organization_memberships_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "jejak"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."resource_assignments" ADD CONSTRAINT "resource_assignments_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."resource_assignments" ADD CONSTRAINT "resource_assignments_membership_id_organization_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "jejak"."organization_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."workload_identities" ADD CONSTRAINT "workload_identities_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."audit_events" ADD CONSTRAINT "audit_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_event_checkpoints" ADD CONSTRAINT "chain_event_checkpoints_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_submissions" ADD CONSTRAINT "chain_submissions_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."chain_submissions" ADD CONSTRAINT "chain_submissions_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "jejak"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."operation_steps" ADD CONSTRAINT "operation_steps_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."operation_steps" ADD CONSTRAINT "operation_steps_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "jejak"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."operations" ADD CONSTRAINT "operations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."partner_attempts" ADD CONSTRAINT "partner_attempts_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "jejak"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jejak"."partner_attempts" ADD CONSTRAINT "partner_attempts_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "jejak"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_claim_key_uq" ON "jejak"."claims" USING btree ("tenant_id","claim_key");--> statement-breakpoint
CREATE UNIQUE INDEX "control_evidence_hash_uq" ON "jejak"."control_evidence" USING btree ("tenant_id","evidence_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "eligibility_attestations_envelope_uq" ON "jejak"."eligibility_attestations" USING btree ("tenant_id","envelope_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "facility_positions_active_claim_uq" ON "jejak"."facility_positions" USING btree ("tenant_id","claim_id") WHERE "jejak"."facility_positions"."status" not in ('CLOSED', 'WRITTEN_OFF');--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_connections_external_uq" ON "jejak"."marketplace_connections" USING btree ("tenant_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resolution_cases_active_claim_uq" ON "jejak"."resolution_cases" USING btree ("tenant_id","claim_id") WHERE "jejak"."resolution_cases"."status" in ('OPEN', 'RECOVERING');--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_tenant_subject_uq" ON "jejak"."sellers" USING btree ("tenant_id","seller_subject");--> statement-breakpoint
CREATE INDEX "sellers_tenant_idx" ON "jejak"."sellers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_events_external_uq" ON "jejak"."settlement_events" USING btree ("tenant_id","source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_events_hash_uq" ON "jejak"."settlement_events" USING btree ("tenant_id","event_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_streams_source_hash_uq" ON "jejak"."settlement_streams" USING btree ("tenant_id","source_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "waterfall_results_event_uq" ON "jejak"."waterfall_results" USING btree ("tenant_id","settlement_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_invitations_token_hash_uq" ON "jejak"."institutional_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "institutional_invitations_pending_email_uq" ON "jejak"."institutional_invitations" USING btree ("tenant_id","email_hash") WHERE "jejak"."institutional_invitations"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_role_grants_active_uq" ON "jejak"."membership_role_grants" USING btree ("tenant_id","membership_id","role") WHERE "jejak"."membership_role_grants"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_tenant_profile_uq" ON "jejak"."organization_memberships" USING btree ("tenant_id","user_profile_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_tenant_status_idx" ON "jejak"."organization_memberships" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "jejak"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_assignments_active_uq" ON "jejak"."resource_assignments" USING btree ("tenant_id","membership_id","resource_type","resource_id","capability") WHERE "jejak"."resource_assignments"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_auth_subject_uq" ON "jejak"."user_profiles" USING btree ("auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "workload_identities_tenant_name_uq" ON "jejak"."workload_identities" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_created_idx" ON "jejak"."audit_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_event_checkpoints_scope_uq" ON "jejak"."chain_event_checkpoints" USING btree ("tenant_id","network","contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_uq" ON "jejak"."idempotency_records" USING btree ("tenant_id","actor_id","operation_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_idempotency_uq" ON "jejak"."outbox_events" USING btree ("tenant_id","event_type","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbox_events_claim_idx" ON "jejak"."outbox_events" USING btree ("status","next_attempt_at","leased_until");