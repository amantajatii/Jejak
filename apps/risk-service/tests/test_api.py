from __future__ import annotations

from copy import deepcopy


def test_health_ready_and_fixture_compatible_evaluation(client, evaluation_request):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").status_code == 200
    response = client.post("/internal/v1/evaluations", json=evaluation_request)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["decision"] == "ELIGIBLE"
    assert data["sdsBps"] == 2000
    assert data["eligibleSettlementValue"]["amountMinor"] == "8000"
    assert data["maxAdvanceAmount"]["amountMinor"] == "6400"
    assert client.post("/internal/v1/evaluations", json=evaluation_request).json() == data
    drift = client.get("/internal/v1/models/drift")
    assert drift.status_code == 200
    assert drift.json()["status"] == "NOT_AVAILABLE"


def test_refund_and_missing_data_abstain_safely(client, evaluation_request):
    refund = deepcopy(evaluation_request)
    refund["features"]["refundRateBps"] = 3000
    response = client.post("/internal/v1/evaluations", json=refund)
    assert response.status_code == 200
    assert response.json()["decision"] == "REVIEW"
    assert response.json()["sdsBps"] == 4400
    assert response.json()["eligibleSettlementValue"]["amountMinor"] == "5600"
    assert response.json()["maxAdvanceAmount"]["amountMinor"] == "0"

    missing = deepcopy(evaluation_request)
    missing["features"] = {"missingPayoutHistory": True, "refundRateBps": 0}
    response = client.post("/internal/v1/evaluations", json=missing)
    assert response.status_code == 200
    assert response.json()["decision"] == "REVIEW"
    assert "MISSING_PAYOUT_HISTORY" in response.json()["reasonCodes"]


def test_stale_and_bad_contract_are_rejected_or_reviewed(client, evaluation_request):
    stale = deepcopy(evaluation_request)
    stale["snapshotCutoffAt"] = "2026-07-13T00:00:00Z"
    response = client.post("/internal/v1/evaluations", json=stale)
    assert response.status_code == 200
    assert "STALE_SNAPSHOT" in response.json()["reasonCodes"]

    broken = deepcopy(evaluation_request)
    broken["featureSnapshotHash"] = "not-a-hash"
    assert client.post("/internal/v1/evaluations", json=broken).status_code == 422
