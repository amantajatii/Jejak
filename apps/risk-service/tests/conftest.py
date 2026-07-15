from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from risk_service.app import create_app
from risk_service.config import Settings


ROOT = Path(__file__).resolve().parents[3]
DOMAIN_ROOT = ROOT / "packages" / "domain"
NOW = datetime(2026, 7, 15, 0, 5, tzinfo=timezone.utc)
PRIVATE_KEY = "1f" * 32


@pytest.fixture()
def settings() -> Settings:
    return Settings(domain_root=DOMAIN_ROOT, jcc_key_id="local-test", jcc_private_key_hex=PRIVATE_KEY)


@pytest.fixture()
def client(settings: Settings) -> TestClient:
    with TestClient(create_app(settings, now=lambda: NOW)) as test_client:
        yield test_client


@pytest.fixture()
def evaluation_request() -> dict[str, object]:
    return {
        "requestId": "request-001",
        "claimId": "0198a5ea-7c9c-7000-8000-000000000101",
        "claimKey": "a" * 64,
        "sellerSubjectHash": "b" * 64,
        "settlementStreamId": "0198a5ea-7c9c-7000-8000-000000000301",
        "dataSnapshotHash": "c" * 64,
        "snapshotCutoffAt": "2026-07-15T00:00:00Z",
        "sourceCurrency": "TIDR",
        "features": {"missingPayoutHistory": False, "refundRateBps": 0},
        "featureSnapshotHash": "d" * 64,
        "grossUnsettled": {"amountMinor": "10000", "currency": "TIDR", "scale": 2},
        "policyVersion": "sandbox-policy-v1",
    }
