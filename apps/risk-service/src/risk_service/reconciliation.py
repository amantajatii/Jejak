from __future__ import annotations

from datetime import datetime
from typing import Any


def reconciliation_reason_codes(
    events: list[dict[str, Any]],
    *,
    snapshot_cutoff_at: datetime,
    currency: str,
    scale: int,
) -> list[str]:
    """Classify unsafe settlement-stream inputs without fabricating a value."""
    seen: set[str] = set()
    reasons: set[str] = set()
    payout_seen = False
    for event in events:
        event_id = event.get("externalEventId")
        occurred_at = event.get("occurredAt")
        amount = event.get("amount")
        if not isinstance(event_id, str) or not event_id or event_id in seen:
            reasons.add("DATA_INCONSISTENT")
        else:
            seen.add(event_id)
        if not isinstance(occurred_at, datetime) or occurred_at.tzinfo is None or occurred_at > snapshot_cutoff_at:
            reasons.add("DATA_INCONSISTENT")
        if not isinstance(amount, dict) or amount.get("currency") != currency or amount.get("scale") != scale:
            reasons.add("DATA_INCONSISTENT")
        elif not isinstance(amount.get("amountMinor"), str) or not amount["amountMinor"].lstrip("-").isdigit():
            reasons.add("DATA_INCONSISTENT")
        if event.get("type") == "PAYOUT":
            payout_seen = True
    if not payout_seen:
        reasons.add("MISSING_PAYOUT_HISTORY")
    return sorted(reasons)
