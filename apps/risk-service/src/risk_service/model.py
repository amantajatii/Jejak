from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import math
from typing import Any, Protocol
import warnings

import polars as pl

from .data import FEATURE_COLUMNS, SyntheticDataset, build_synthetic_dataset, ground_truth
from .schemas import EvaluationRequest, REASON_CODES


@dataclass(frozen=True)
class Prediction:
    model_id: str
    model_version: str
    expected_dilution_bps: int
    tail_dilution_bps: int
    sds_bps: int
    decision: str
    reason_codes: list[str]


class RiskModel(Protocol):
    model_id: str
    model_version: str

    def predict(self, request: EvaluationRequest) -> Prediction: ...

    def metadata(self) -> dict[str, Any]: ...


def _feature_number(features: dict[str, object], name: str, default: int = 0) -> int:
    value = features.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"feature {name} must be a finite number")
    integer = int(value)
    if integer < 0 or integer > 10000:
        raise ValueError(f"feature {name} must be in 0..10000")
    return integer


def validate_feature_contract(request: EvaluationRequest, now: datetime, max_snapshot_age_hours: int) -> list[str]:
    features = request.features
    reasons: list[str] = []
    if not isinstance(features.get("missingPayoutHistory"), bool):
        reasons.extend(["MISSING_PAYOUT_HISTORY", "MANUAL_REVIEW_REQUIRED"])
    if not isinstance(features.get("refundRateBps"), (int, float)) or isinstance(features.get("refundRateBps"), bool):
        reasons.extend(["DATA_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"])
    else:
        _feature_number(features, "refundRateBps")
    for optional in ("rtoRateBps", "chargebackRateBps", "concentrationBps", "dataQualityScoreBps"):
        if optional in features and features[optional] is not None:
            _feature_number(features, optional)
    for optional in ("orderCount", "sellerTenureDays"):
        if optional in features and features[optional] is not None:
            value = features[optional]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
                raise ValueError(f"feature {optional} must be non-negative")
    if features.get("missingPayoutHistory") is True:
        reasons.extend(["MISSING_PAYOUT_HISTORY", "MANUAL_REVIEW_REQUIRED"])
    if features.get("accountHold") is True:
        reasons.extend(["ACCOUNT_HOLD", "MANUAL_REVIEW_REQUIRED"])
    if features.get("dataQualityScoreBps") is not None and _feature_number(features, "dataQualityScoreBps") < 8000:
        reasons.extend(["DATA_INCONSISTENT", "MANUAL_REVIEW_REQUIRED"])
    cutoff = request.snapshotCutoffAt
    if cutoff.tzinfo is None:
        raise ValueError("snapshotCutoffAt must have a timezone")
    age_seconds = (now - cutoff).total_seconds()
    if age_seconds > max_snapshot_age_hours * 3600 or age_seconds < -300:
        reasons.extend(["STALE_SNAPSHOT", "MANUAL_REVIEW_REQUIRED"])
    unknown_reasons = set(reasons).difference(REASON_CODES)
    if unknown_reasons:
        raise ValueError(f"unsupported reason codes: {unknown_reasons}")
    return sorted(set(reasons))


class TransparentSandboxModel:
    model_id = "transparent-sandbox-risk"
    model_version = "transparent-v1"

    def predict(self, request: EvaluationRequest) -> Prediction:
        features = request.features
        missing = features.get("missingPayoutHistory") is True
        refund = _feature_number(features, "refundRateBps")
        if missing:
            return Prediction(self.model_id, self.model_version, 10000, 10000, 10000, "REVIEW", ["MISSING_PAYOUT_HISTORY", "MANUAL_REVIEW_REQUIRED"])
        if refund >= 3000:
            return Prediction(self.model_id, self.model_version, 3000, 5000, 4400, "REVIEW", ["HIGH_REFUND_RATE"])
        return Prediction(self.model_id, self.model_version, 2000, 3000, 2000, "ELIGIBLE", [])

    def metadata(self) -> dict[str, Any]:
        return {
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "sandbox": True,
            "featureSchemaVersion": "JEJAK_RISK_FEATURES_V1",
            "evaluationSummary": {"type": "versioned transparent rules", "fixtureCompatible": True},
        }


class LightGbmSyntheticModel:
    model_id = "lightgbm-synthetic-risk"
    model_version = "lightgbm-synthetic-v1"

    def __init__(self, dataset: SyntheticDataset | None = None):
        import lightgbm as lgb
        import numpy as np
        from sklearn.metrics import mean_absolute_error, mean_pinball_loss
        from sklearn.model_selection import GroupKFold

        self.dataset = dataset or build_synthetic_dataset()
        self._numpy = np
        frame = ground_truth(self.dataset.frame)
        cutoff = self.dataset.training_start + (self.dataset.training_end - self.dataset.training_start) * 0.75
        train = frame.filter(pl.col("snapshotCutoffAt") < cutoff)
        test = frame.filter(pl.col("snapshotCutoffAt") >= cutoff)
        self._model = lgb.LGBMRegressor(
            n_estimators=80, learning_rate=0.06, max_depth=3, num_leaves=7,
            random_state=self.dataset.seed, n_jobs=1, verbosity=-1,
        )
        x_train = train.select(FEATURE_COLUMNS).to_numpy()
        y_train = train["realizedDilutionBps"].to_numpy()
        self._model.fit(x_train, y_train)
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            predicted = self._model.predict(test.select(FEATURE_COLUMNS).to_numpy())
        actual = test["realizedDilutionBps"].to_numpy()
        self._mae = float(mean_absolute_error(actual, predicted))
        self._pinball = float(mean_pinball_loss(actual, predicted, alpha=0.9))
        residuals = actual - predicted
        self._tail_buffer = max(1000, int(np.quantile(residuals, 0.9)))
        baseline = np.full_like(actual, 2000)
        self._baseline_mae = float(mean_absolute_error(actual, baseline))
        tail_limit = 5000
        candidate_accepted = (predicted + self._tail_buffer) <= tail_limit
        baseline_accepted = (baseline + 1000) <= tail_limit
        self._capital_comparison = {
            "tailRiskLimitBps": tail_limit,
            "candidateCapitalUnits": int(candidate_accepted.sum() * 10000),
            "baselineCapitalUnits": int(baseline_accepted.sum() * 10000),
            "candidateObservedTailLossBps": round(float(actual[candidate_accepted].mean()), 2) if candidate_accepted.any() else None,
            "baselineObservedTailLossBps": round(float(actual[baseline_accepted].mean()), 2) if baseline_accepted.any() else None,
        }
        groups = frame["sellerGroup"].to_numpy()
        group_train, group_test = next(GroupKFold(n_splits=4).split(frame.select(FEATURE_COLUMNS).to_numpy(), frame["realizedDilutionBps"].to_numpy(), groups))
        group_model = lgb.LGBMRegressor(
            n_estimators=80, learning_rate=0.06, max_depth=3, num_leaves=7,
            random_state=self.dataset.seed, n_jobs=1, verbosity=-1,
        )
        all_features = frame.select(FEATURE_COLUMNS).to_numpy()
        all_labels = frame["realizedDilutionBps"].to_numpy()
        group_model.fit(all_features[group_train], all_labels[group_train])
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            grouped_prediction = group_model.predict(all_features[group_test])
        self._grouped_mae = float(mean_absolute_error(all_labels[group_test], grouped_prediction))

    def predict(self, request: EvaluationRequest) -> Prediction:
        values = []
        for name in FEATURE_COLUMNS:
            default = 10000 if name == "dataQualityScoreBps" else 0
            values.append(_feature_number(request.features, name, default))
        expected = int(round(float(self._model.predict(self._numpy.array([values]))[0])))
        expected = min(10000, max(0, expected))
        tail = min(10000, expected + self._tail_buffer)
        reasons = ["HIGH_REFUND_RATE"] if values[0] >= 3000 else []
        decision = "REVIEW" if values[0] >= 3000 else "ELIGIBLE"
        return Prediction(self.model_id, self.model_version, expected, tail, expected, decision, reasons)

    def metadata(self) -> dict[str, Any]:
        return {
            "modelId": self.model_id,
            "modelVersion": self.model_version,
            "sandbox": True,
            "featureSchemaVersion": "JEJAK_RISK_FEATURES_V1",
            "trainingWindow": {
                "start": self.dataset.training_start.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
                "end": self.dataset.training_end.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
            },
            "evaluationSummary": {
                "split": "out-of-time and grouped seller holdout",
                "maeBps": round(self._mae, 2),
                "baselineMaeBps": round(self._baseline_mae, 2),
                "groupedMaeBps": round(self._grouped_mae, 2),
                "quantileLossP90": round(self._pinball, 2),
                "tailBufferBps": self._tail_buffer,
                "capitalAtFixedTailRisk": self._capital_comparison,
                "dataset": "synthetic-only",
            },
        }


def choose_model(name: str) -> RiskModel:
    if name == "transparent":
        return TransparentSandboxModel()
    if name == "lightgbm":
        return LightGbmSyntheticModel()
    raise ValueError("RISK_ACTIVE_MODEL must be transparent or lightgbm")


def deterministic_uuid_v7(request: EvaluationRequest) -> str:
    milliseconds = int(request.snapshotCutoffAt.timestamp() * 1000)
    digest = hashlib.sha256(f"{request.requestId}:{request.dataSnapshotHash}".encode()).digest()
    high = (milliseconds << 80) | (0x7 << 76) | (int.from_bytes(digest[:10], "big") & ((1 << 76) - 1))
    high &= ~((0b11) << 62)
    high |= 0b10 << 62
    raw = high.to_bytes(16, "big").hex()
    return f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"
