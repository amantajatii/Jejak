DROP TRIGGER IF EXISTS settlement_streams_append_only ON jejak.settlement_streams;
DROP FUNCTION IF EXISTS jejak.reject_settlement_stream_immutable_mutation();
GRANT SELECT, INSERT, UPDATE, DELETE ON jejak.settlement_streams TO jejak_api;
GRANT SELECT, INSERT, UPDATE ON jejak.settlement_streams TO jejak_worker;

DROP TRIGGER IF EXISTS waterfall_results_append_only ON jejak.waterfall_results;
DROP TRIGGER IF EXISTS settlement_events_append_only ON jejak.settlement_events;
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
DROP INDEX IF EXISTS jejak.waterfall_results_settlement_event_fk_idx;
DROP INDEX IF EXISTS jejak.waterfall_results_claim_fk_idx;
DROP INDEX IF EXISTS jejak.waterfall_results_claim_page_idx;
DROP INDEX IF EXISTS jejak.waterfall_results_result_hash_uq;
DROP INDEX IF EXISTS jejak.settlement_events_claim_fk_idx;
DROP INDEX IF EXISTS jejak.settlement_events_claim_page_idx;
DROP INDEX IF EXISTS jejak.chain_events_waterfall_result_hash_idx;

GRANT SELECT, INSERT, UPDATE, DELETE ON jejak.settlement_events, jejak.waterfall_results TO jejak_api;
GRANT SELECT, INSERT, UPDATE ON jejak.settlement_events, jejak.waterfall_results TO jejak_worker;

DROP TABLE IF EXISTS jejak.chain_reconciliation_results;
DROP TABLE IF EXISTS jejak.chain_reconciliation_expectations;
DROP TABLE IF EXISTS jejak.chain_portfolio_positions;
DROP TABLE IF EXISTS jejak.chain_events;

ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS created_at;
ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS rpc_cursor;
ALTER TABLE jejak.chain_event_checkpoints DROP COLUMN IF EXISTS contract_name;
