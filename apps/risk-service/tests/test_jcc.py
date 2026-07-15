from __future__ import annotations

import base64
from copy import deepcopy
from datetime import timedelta
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import pytest

from risk_service.config import Settings
from risk_service.jcc import JccSigner, canonical_bytes
from risk_service.schemas import AttestationRequest


ROOT = Path(__file__).resolve().parents[3]


def test_public_vector_has_the_expected_canonical_signature():
    vector = json.loads((ROOT / "packages/domain/fixtures/vectors/jcc-jcs-ed25519-v1.json").read_text())
    key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(vector["testKey"]["seedHex"]))
    assert canonical_bytes(vector["payload"]).decode() == vector["canonicalUtf8Text"]
    assert key.sign(canonical_bytes(vector["payload"])).hex() == vector["expectedSignatureHex"]


def test_attestation_is_canonical_signed_and_verifiable(client, settings, evaluation_request):
    evaluation = client.post("/internal/v1/evaluations", json=evaluation_request).json()
    body = {
        "request": evaluation_request,
        "evaluation": evaluation,
        "attestationId": "0198a5ea-7c9c-7000-8000-000000000201",
        "issuedAt": "2026-07-15T00:00:00Z",
        "expiresAt": "2026-07-16T00:00:00Z",
    }
    response = client.post("/internal/v1/attestations", json=body)
    assert response.status_code == 200, response.text
    attestation = response.json()
    assert attestation["schema"] == "JEJAK_JCC_V1"
    assert base64.b64decode(attestation["signature"])
    assert JccSigner(settings).verify(__import__("risk_service.schemas", fromlist=["EligibilityAttestation"]).EligibilityAttestation.model_validate(attestation))

    mismatch = deepcopy(body)
    mismatch["evaluation"]["dataSnapshotHash"] = "e" * 64
    assert client.post("/internal/v1/attestations", json=mismatch).status_code == 422

    stale = deepcopy(body)
    stale["request"]["snapshotCutoffAt"] = "2026-07-13T00:00:00Z"
    assert client.post("/internal/v1/attestations", json=stale).status_code == 422


def test_vector_key_cannot_be_runtime_signing_key(settings):
    unsafe = Settings(domain_root=settings.domain_root, jcc_key_id="unsafe", jcc_private_key_hex="9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
    with pytest.raises(ValueError, match="cannot be used at runtime"):
        JccSigner(unsafe)._key("unsafe")


def test_keyring_supports_rotation_and_revocation(settings):
    rotated = Settings(
        domain_root=settings.domain_root,
        jcc_key_id="next",
        jcc_keys_json=json.dumps({
            "old": {"privateKeyHex": "2a" * 32, "status": "REVOKED"},
            "next": {"privateKeyHex": "1f" * 32, "status": "ACTIVE"},
        }),
        revoked_key_ids=("old",),
    )
    signer = JccSigner(rotated)
    assert signer.ready
    assert signer._key("next")
    with pytest.raises(ValueError, match="inactive, or revoked"):
        signer._key("old")
