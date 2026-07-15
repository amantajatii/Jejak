import hashlib
import json

from conftest import FIXTURES_ROOT, load_json

VECTORS_ROOT = FIXTURES_ROOT / "vectors"


def test_utf8_hash_vectors_match_python_bytes():
    for name in (
        "claim-key-v1.json",
        "attestation-key-v1.json",
        "content-hash-v1.json",
    ):
        vector = load_json(VECTORS_ROOT / name)
        data = vector["input"]["utf8Text"].encode("utf-8")
        assert list(data) == vector["input"]["utf8Bytes"]
        assert hashlib.sha256(data).hexdigest() == vector["expected"]["sha256Hex"]


def test_salted_seller_subject_vector_matches_python_bytes():
    vector = load_json(VECTORS_ROOT / "seller-subject-v1.json")
    data = bytes.fromhex(vector["input"]["tenantSaltHex"]) + vector["input"]["sellerId"].encode()
    assert list(data) == vector["input"]["concatenatedBytes"]
    assert hashlib.sha256(data).hexdigest() == vector["expected"]["sha256Hex"]


def test_money_vectors_are_integer_strings():
    vector = load_json(VECTORS_ROOT / "money-base-units-v1.json")
    for case in vector["cases"]:
        assert case["expectedAmountMinor"].lstrip("-").isdigit()


def test_jcc_vector_bytes_parse_without_copying_or_resigning():
    vector = load_json(VECTORS_ROOT / "jcc-jcs-ed25519-v1.json")
    canonical_bytes = bytes.fromhex(vector["canonicalUtf8Hex"])
    assert canonical_bytes.decode("utf-8") == vector["canonicalUtf8Text"]
    assert json.loads(canonical_bytes) == vector["payload"]
    assert len(bytes.fromhex(vector["expectedSignatureHex"])) == 64
