from __future__ import annotations

import base64
from datetime import datetime
import hashlib
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
import rfc8785

from .config import Settings, TEST_VECTOR_SEED
from .schemas import AttestationRequest, EligibilityAttestation


def canonical_bytes(payload: dict[str, Any]) -> bytes:
    return rfc8785.dumps(payload)


def attestation_key(attestation_id: str) -> str:
    return hashlib.sha256(f"JEJAK:JCC:v1:{attestation_id}".encode("utf-8")).hexdigest()


class JccSigner:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._keys = settings.configured_keys()

    @property
    def ready(self) -> bool:
        return bool(self._settings.jcc_key_id and self._settings.jcc_key_id in self._keys)

    def _key(self, key_id: str) -> Ed25519PrivateKey:
        entry = self._keys.get(key_id)
        if entry is None or entry["status"] != "ACTIVE" or key_id in self._settings.revoked_key_ids:
            raise ValueError("JCC signing key is unavailable, inactive, or revoked")
        seed = entry["privateKeyHex"]
        if seed == TEST_VECTOR_SEED:
            raise ValueError("The public JCC vector key cannot be used at runtime")
        try:
            raw = bytes.fromhex(seed)
        except ValueError as error:
            raise ValueError("JCC private key is not hexadecimal") from error
        if len(raw) != 32:
            raise ValueError("JCC private key must be a 32-byte Ed25519 seed")
        return Ed25519PrivateKey.from_private_bytes(raw)

    def sign(self, input: AttestationRequest, now: datetime) -> EligibilityAttestation:
        request, evaluation = input.request, input.evaluation
        if input.expiresAt <= input.issuedAt or input.issuedAt > now:
            raise ValueError("attestation timestamps are invalid")
        for name in ("requestId", "claimId", "dataSnapshotHash", "policyVersion", "featureSnapshotHash"):
            request_value = getattr(request, name)
            evaluation_value = getattr(evaluation, name)
            if request_value != evaluation_value:
                raise ValueError(f"evaluation {name} does not match immutable request")
        key = self._key(self._settings.jcc_key_id)
        unsigned = {
            "schema": "JEJAK_JCC_V1",
            "id": input.attestationId,
            "attestationKey": attestation_key(input.attestationId),
            "claimId": request.claimId,
            "claimKey": request.claimKey,
            "sellerSubjectHash": request.sellerSubjectHash,
            "settlementStreamId": request.settlementStreamId,
            "dataSnapshotHash": request.dataSnapshotHash,
            "modelId": evaluation.modelId,
            "modelVersion": evaluation.modelVersion,
            "policyVersion": request.policyVersion,
            "decision": evaluation.decision,
            "sdsBps": evaluation.sdsBps,
            "grossUnsettled": request.grossUnsettled.model_dump(exclude_none=True),
            "eligibleSettlementValue": evaluation.eligibleSettlementValue.model_dump(exclude_none=True),
            "maxAdvanceAmount": evaluation.maxAdvanceAmount.model_dump(exclude_none=True),
            "reasonCodes": evaluation.reasonCodes,
            "issuedAt": input.issuedAt.isoformat().replace("+00:00", "Z"),
            "expiresAt": input.expiresAt.isoformat().replace("+00:00", "Z"),
            "status": "ACTIVE",
            "keyId": self._settings.jcc_key_id,
        }
        signature = base64.b64encode(key.sign(canonical_bytes(unsigned))).decode("ascii")
        return EligibilityAttestation.model_validate({**unsigned, "signature": signature})

    def sign_signing_request(self, body: dict[str, Any]) -> dict[str, Any]:
        """Sign a canonical JCC signing request produced by the API.

        The API sends the exact RFC 8785 JCS `canonicalPayload`; we sign those
        bytes verbatim so the API's public verifier (which verifies over the same
        string) accepts the signature. We never re-derive the payload for signing.
        """
        if body.get("domain") != "JEJAK_JCC_V1":
            raise ValueError("unsupported JCC signing domain")
        attestation_id = body.get("attestationId")
        canonical_payload = body.get("canonicalPayload")
        payload_hash = body.get("payloadHash")
        payload = body.get("payload")
        if not isinstance(attestation_id, str) or not attestation_id:
            raise ValueError("JCC signing request is missing attestationId")
        if not isinstance(canonical_payload, str) or not canonical_payload:
            raise ValueError("JCC signing request is missing canonicalPayload")
        if not isinstance(payload, dict):
            raise ValueError("JCC signing request is missing payload")
        computed_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
        if computed_hash != payload_hash:
            raise ValueError("payloadHash does not match canonicalPayload")
        if payload.get("id") != attestation_id:
            raise ValueError("attestationId does not match payload id")
        key_id = self._settings.jcc_key_id
        key = self._key(key_id)
        signature = base64.b64encode(key.sign(canonical_payload.encode("utf-8"))).decode("ascii")
        attestation = {**payload, "keyId": key_id, "signature": signature}
        envelope_hash = hashlib.sha256(canonical_bytes({"domain": "JEJAK_JCC_V1", "attestation": attestation})).hexdigest()
        return {
            "attestationId": attestation_id,
            "envelopeHash": envelope_hash,
            "keyId": key_id,
            "payloadHash": payload_hash,
            "signature": signature,
        }

    def verify(self, attestation: EligibilityAttestation) -> bool:
        if attestation.keyId in self._settings.revoked_key_ids:
            return False
        key = self._key(attestation.keyId)
        public: Ed25519PublicKey = key.public_key()
        payload = attestation.model_dump(
            by_alias=True,
            mode="json",
            exclude={"signature"},
            exclude_none=True,
        )
        try:
            public.verify(base64.b64decode(attestation.signature), canonical_bytes(payload))
        except Exception:
            return False
        return True
