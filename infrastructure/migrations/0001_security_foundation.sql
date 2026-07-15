DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jejak_api') THEN
    CREATE ROLE jejak_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jejak_worker') THEN
    CREATE ROLE jejak_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA jejak FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA jejak FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA jejak TO jejak_api, jejak_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA jejak TO jejak_api;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA jejak TO jejak_worker;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON jejak.audit_events FROM jejak_api, jejak_worker;
--> statement-breakpoint
ALTER TABLE jejak.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE jejak.organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON jejak.organizations
  TO jejak_api, jejak_worker
  USING (id = NULLIF(current_setting('jejak.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('jejak.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE jejak.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jejak.user_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_profiles_actor_isolation ON jejak.user_profiles
  TO jejak_api, jejak_worker
  USING (id = NULLIF(current_setting('jejak.actor_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('jejak.actor_id', true), '')::uuid);
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT column1 FROM (VALUES
      ('organization_memberships'),
      ('membership_role_grants'),
      ('resource_assignments'),
      ('institutional_invitations'),
      ('workload_identities'),
      ('sellers'),
      ('marketplace_connections'),
      ('settlement_streams'),
      ('claims'),
      ('eligibility_attestations'),
      ('control_evidence'),
      ('financing_offers'),
      ('facility_positions'),
      ('settlement_events'),
      ('waterfall_results'),
      ('resolution_cases'),
      ('idempotency_records'),
      ('audit_events'),
      ('outbox_events'),
      ('operations'),
      ('operation_steps'),
      ('partner_attempts'),
      ('chain_submissions'),
      ('chain_event_checkpoints')
    ) AS tenant_tables
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
CREATE OR REPLACE FUNCTION jejak.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only' USING ERRCODE = '55000';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON jejak.audit_events
FOR EACH ROW EXECUTE FUNCTION jejak.reject_audit_mutation();
