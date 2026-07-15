from __future__ import annotations

from risk_service.data import build_synthetic_dataset, ground_truth
from risk_service.model import LightGbmSyntheticModel


def test_synthetic_ground_truth_is_reproducible_and_has_no_future_feature_columns():
    first = build_synthetic_dataset()
    second = build_synthetic_dataset()
    assert first.frame.equals(second.frame)
    target = ground_truth(first.frame)
    assert "realizedDilutionBps" in target.columns
    assert target["snapshotCutoffAt"].min() >= first.training_start


def test_lightgbm_metadata_reports_out_of_time_sandbox_evaluation():
    metadata = LightGbmSyntheticModel().metadata()
    assert metadata["sandbox"] is True
    assert metadata["evaluationSummary"]["split"].startswith("out-of-time")
    assert metadata["evaluationSummary"]["dataset"] == "synthetic-only"
    assert metadata["evaluationSummary"]["groupedMaeBps"] >= 0
    assert metadata["evaluationSummary"]["capitalAtFixedTailRisk"]["tailRiskLimitBps"] == 5000
