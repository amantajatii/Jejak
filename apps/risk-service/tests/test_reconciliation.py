from __future__ import annotations

from datetime import datetime, timezone

from risk_service.reconciliation import reconciliation_reason_codes


def test_reconciliation_flags_duplicate_missing_and_inconsistent_events():
    cutoff = datetime(2026, 7, 15, tzinfo=timezone.utc)
    reasons = reconciliation_reason_codes(
        [
            {"externalEventId": "payout-1", "type": "PAYOUT", "occurredAt": cutoff, "amount": {"amountMinor": "100", "currency": "TIDR", "scale": 2}},
            {"externalEventId": "payout-1", "type": "REFUND", "occurredAt": cutoff, "amount": {"amountMinor": "10", "currency": "USD", "scale": 2}},
        ],
        snapshot_cutoff_at=cutoff,
        currency="TIDR",
        scale=2,
    )
    assert reasons == ["DATA_INCONSISTENT"]


def test_reconciliation_requires_a_payout_history():
    reasons = reconciliation_reason_codes(
        [],
        snapshot_cutoff_at=datetime(2026, 7, 15, tzinfo=timezone.utc),
        currency="TIDR",
        scale=2,
    )
    assert reasons == ["MISSING_PAYOUT_HISTORY"]
