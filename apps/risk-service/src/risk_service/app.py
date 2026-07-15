from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Callable

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .config import Settings
from .domain_schema import DomainSchemaValidator
from .jcc import JccSigner
from .model import RiskModel, choose_model, deterministic_uuid_v7, validate_feature_contract
from .schemas import AttestationRequest, EvaluationRequest, EvaluationResponse, money_with_amount, response_to_json


REQUEST_SCHEMA = "https://jejak.finance/schemas/risk/evaluation-request.schema.json"
RESPONSE_SCHEMA = "https://jejak.finance/schemas/risk/evaluation-response.schema.json"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_app(settings: Settings | None = None, now: Callable[[], datetime] = utc_now) -> FastAPI:
    resolved = settings or Settings.from_env()
    domain_schemas = DomainSchemaValidator(resolved.domain_root)
    model: RiskModel = choose_model(resolved.active_model)
    signer = JccSigner(resolved)
    app = FastAPI(title="Jejak Risk Service", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.settings = resolved
    app.state.model = model
    app.state.signer = signer

    def authenticate(authorization: str | None = Header(default=None)) -> None:
        if not resolved.service_token:
            return
        if authorization != f"Bearer {resolved.service_token}":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal service token")

    @app.exception_handler(ValueError)
    async def value_error_handler(_: Request, error: ValueError):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    def ready() -> dict[str, object]:
        if not signer.ready:
            raise HTTPException(status_code=503, detail="JCC signing key is not configured")
        return {"status": "ready", "sandbox": True, "model": model.model_version}

    @app.get("/internal/v1/models/active", dependencies=[Depends(authenticate)])
    def active_model() -> dict[str, object]:
        metadata = model.metadata()
        metadata["keyId"] = resolved.jcc_key_id or None
        metadata["signingReady"] = signer.ready
        return metadata

    @app.get("/internal/v1/models/drift", dependencies=[Depends(authenticate)])
    def model_drift() -> dict[str, object]:
        return {
            "modelId": model.model_id,
            "modelVersion": model.model_version,
            "sandbox": True,
            "status": "NOT_AVAILABLE",
            "reason": "Synthetic sandbox data has no live production reference distribution.",
            "observedAt": now().isoformat().replace("+00:00", "Z"),
        }

    @app.post("/internal/v1/evaluations", response_model=EvaluationResponse, dependencies=[Depends(authenticate)])
    def evaluate(request: EvaluationRequest) -> EvaluationResponse:
        request_json = request.model_dump(mode="json", exclude_none=True)
        domain_schemas.validate(REQUEST_SCHEMA, request_json)
        reasons = validate_feature_contract(request, now(), resolved.max_snapshot_age_hours)
        if reasons:
            response = EvaluationResponse(
                requestId=request.requestId,
                claimId=request.claimId,
                dataSnapshotHash=request.dataSnapshotHash,
                policyVersion=request.policyVersion,
                evaluationId=deterministic_uuid_v7(request),
                modelId=model.model_id,
                modelVersion=model.model_version,
                decision="REVIEW",
                sdsBps=10000 if "MISSING_PAYOUT_HISTORY" in reasons else 0,
                expectedDilutionBps=10000 if "MISSING_PAYOUT_HISTORY" in reasons else 0,
                tailDilutionBps=10000 if "MISSING_PAYOUT_HISTORY" in reasons else 0,
                eligibleSettlementValue=money_with_amount(request.grossUnsettled, 0),
                maxAdvanceAmount=money_with_amount(request.grossUnsettled, 0),
                reasonCodes=reasons,
                featureSnapshotHash=request.featureSnapshotHash,
                evaluatedAt=request.snapshotCutoffAt,
            )
        else:
            predicted = model.predict(request)
            gross = int(request.grossUnsettled.amountMinor)
            eligible = (gross * (10000 - predicted.sds_bps)) // 10000
            advance = (eligible * 8000) // 10000 if predicted.decision == "ELIGIBLE" else 0
            response = EvaluationResponse(
                requestId=request.requestId,
                claimId=request.claimId,
                dataSnapshotHash=request.dataSnapshotHash,
                policyVersion=request.policyVersion,
                evaluationId=deterministic_uuid_v7(request),
                modelId=predicted.model_id,
                modelVersion=predicted.model_version,
                decision=predicted.decision,
                sdsBps=predicted.sds_bps,
                expectedDilutionBps=predicted.expected_dilution_bps,
                tailDilutionBps=predicted.tail_dilution_bps,
                eligibleSettlementValue=money_with_amount(request.grossUnsettled, eligible),
                maxAdvanceAmount=money_with_amount(request.grossUnsettled, advance),
                reasonCodes=predicted.reason_codes,
                featureSnapshotHash=request.featureSnapshotHash,
                evaluatedAt=request.snapshotCutoffAt,
            )
        domain_schemas.validate(RESPONSE_SCHEMA, response_to_json(response))
        return response

    @app.post("/internal/v1/attestations", dependencies=[Depends(authenticate)])
    def attest(input: AttestationRequest):
        domain_schemas.validate(REQUEST_SCHEMA, input.request.model_dump(mode="json", exclude_none=True))
        domain_schemas.validate(RESPONSE_SCHEMA, response_to_json(input.evaluation))
        if (now() - input.request.snapshotCutoffAt).total_seconds() > resolved.max_snapshot_age_hours * 3600:
            raise ValueError("refusing to attest a stale decision snapshot")
        return signer.sign(input, now()).model_dump(by_alias=True, mode="json", exclude_none=True)

    return app


app = create_app()
