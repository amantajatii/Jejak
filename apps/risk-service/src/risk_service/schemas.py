from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


UUID_V7 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
INTEGER = re.compile(r"^-?(0|[1-9][0-9]*)$")
CURRENCY = re.compile(r"^[A-Z0-9]{3,12}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Money(StrictModel):
    amountMinor: str
    currency: str
    scale: int = Field(ge=0, le=18)
    issuer: str | None = None

    @field_validator("amountMinor")
    @classmethod
    def valid_minor_units(cls, value: str) -> str:
        if not INTEGER.fullmatch(value):
            raise ValueError("amountMinor must be a signed base-10 integer string")
        return value

    @field_validator("currency")
    @classmethod
    def valid_currency(cls, value: str) -> str:
        if not CURRENCY.fullmatch(value):
            raise ValueError("currency must be an uppercase ISO or asset code")
        return value


FeatureValue = str | int | float | bool | None


class EvaluationRequest(StrictModel):
    requestId: str = Field(min_length=1, max_length=128)
    claimId: str
    claimKey: str
    sellerSubjectHash: str
    settlementStreamId: str
    dataSnapshotHash: str
    snapshotCutoffAt: datetime
    sourceCurrency: str
    features: dict[str, FeatureValue] = Field(max_length=256)
    featureSnapshotHash: str
    grossUnsettled: Money
    policyVersion: str = Field(min_length=1, max_length=64)

    @field_validator("claimId", "settlementStreamId")
    @classmethod
    def valid_uuid_v7(cls, value: str) -> str:
        if not UUID_V7.fullmatch(value):
            raise ValueError("must be a UUIDv7")
        return value

    @field_validator("claimKey", "sellerSubjectHash", "dataSnapshotHash", "featureSnapshotHash")
    @classmethod
    def valid_hash(cls, value: str) -> str:
        if not SHA256.fullmatch(value):
            raise ValueError("must be lowercase SHA-256 hex")
        return value

    @field_validator("sourceCurrency")
    @classmethod
    def valid_source_currency(cls, value: str) -> str:
        if not CURRENCY.fullmatch(value):
            raise ValueError("sourceCurrency is invalid")
        return value

    @model_validator(mode="after")
    def matching_money_currency(self) -> "EvaluationRequest":
        if self.grossUnsettled.currency != self.sourceCurrency:
            raise ValueError("grossUnsettled currency must match sourceCurrency")
        return self


class EvaluationResponse(StrictModel):
    requestId: str
    claimId: str
    dataSnapshotHash: str
    policyVersion: str
    evaluationId: str
    modelId: str
    modelVersion: str
    decision: Literal["ELIGIBLE", "REVIEW", "INELIGIBLE"]
    sdsBps: int = Field(ge=0, le=10000)
    expectedDilutionBps: int = Field(ge=0, le=10000)
    tailDilutionBps: int = Field(ge=0, le=10000)
    eligibleSettlementValue: Money
    maxAdvanceAmount: Money
    reasonCodes: list[str] = Field(default_factory=list)
    featureSnapshotHash: str
    evaluatedAt: datetime


class AttestationRequest(StrictModel):
    request: EvaluationRequest
    evaluation: EvaluationResponse
    attestationId: str
    issuedAt: datetime
    expiresAt: datetime

    @field_validator("attestationId")
    @classmethod
    def valid_attestation_id(cls, value: str) -> str:
        if not UUID_V7.fullmatch(value):
            raise ValueError("attestationId must be a UUIDv7")
        return value


class EligibilityAttestation(StrictModel):
    schema_: Literal["JEJAK_JCC_V1"] = Field(alias="schema")
    id: str
    attestationKey: str
    claimId: str
    claimKey: str
    sellerSubjectHash: str
    settlementStreamId: str
    dataSnapshotHash: str
    modelId: str
    modelVersion: str
    policyVersion: str
    decision: Literal["ELIGIBLE", "REVIEW", "INELIGIBLE"]
    sdsBps: int = Field(ge=0, le=10000)
    grossUnsettled: Money
    eligibleSettlementValue: Money
    maxAdvanceAmount: Money
    reasonCodes: list[str]
    issuedAt: datetime
    expiresAt: datetime
    status: Literal["ACTIVE", "SUPERSEDED", "REVOKED", "EXPIRED"]
    keyId: str
    signature: str

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


REASON_CODES = {
    "HIGH_REFUND_RATE", "HIGH_RTO_RATE", "CHARGEBACK_SPIKE", "ACCOUNT_HOLD",
    "MISSING_PAYOUT_HISTORY", "DATA_INCONSISTENT", "CONCENTRATION_HIGH",
    "STALE_SNAPSHOT", "CONTROL_NOT_VERIFIED", "POLICY_LIMIT", "MODEL_UNAVAILABLE",
    "MANUAL_REVIEW_REQUIRED", "SETTLEMENT_SHORTFALL", "PARTNER_UNAVAILABLE",
}


def money_with_amount(money: Money, amount_minor: int) -> Money:
    return Money(amountMinor=str(amount_minor), currency=money.currency, scale=money.scale, issuer=money.issuer)


def response_to_json(response: EvaluationResponse) -> dict[str, Any]:
    return response.model_dump(mode="json", exclude_none=True)
