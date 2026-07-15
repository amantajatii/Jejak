DROP TRIGGER IF EXISTS audit_events_append_only ON jejak.audit_events;
DROP FUNCTION IF EXISTS jejak.reject_audit_mutation();
DO $$
DECLARE
  row record;
BEGIN
  FOR row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'jejak'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', row.policyname, row.schemaname, row.tablename);
  END LOOP;
END
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA jejak FROM jejak_api, jejak_worker;
REVOKE ALL ON SCHEMA jejak FROM jejak_api, jejak_worker;
DROP ROLE IF EXISTS jejak_api;
DROP ROLE IF EXISTS jejak_worker;
