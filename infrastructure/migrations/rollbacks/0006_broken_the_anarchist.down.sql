DROP TRIGGER IF EXISTS chain_reconciliation_results_append_only ON jejak.chain_reconciliation_results;
DROP TRIGGER IF EXISTS chain_reconciliation_expectations_append_only ON jejak.chain_reconciliation_expectations;
DROP TRIGGER IF EXISTS chain_events_append_only ON jejak.chain_events;
DROP FUNCTION IF EXISTS jejak.reject_chain_immutable_mutation();

DROP POLICY IF EXISTS chain_reconciliation_results_tenant_isolation ON jejak.chain_reconciliation_results;
DROP POLICY IF EXISTS chain_reconciliation_expectations_tenant_isolation ON jejak.chain_reconciliation_expectations;
DROP POLICY IF EXISTS chain_portfolio_positions_tenant_isolation ON jejak.chain_portfolio_positions;
DROP POLICY IF EXISTS chain_events_tenant_isolation ON jejak.chain_events;

DROP INDEX IF EXISTS jejak.audit_events_resource_page_idx;
DROP INDEX IF EXISTS jejak.audit_events_action_page_idx;
DROP INDEX IF EXISTS jejak.audit_events_tenant_page_idx;

DROP TABLE IF EXISTS jejak.chain_reconciliation_results;
DROP TABLE IF EXISTS jejak.chain_reconciliation_expectations;
DROP TABLE IF EXISTS jejak.chain_portfolio_positions;
DROP TABLE IF EXISTS jejak.chain_events;

ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS created_at;
ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS rpc_cursor;
ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS contract_name;
