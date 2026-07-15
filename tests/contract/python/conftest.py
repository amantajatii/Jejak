import json
import re
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DOMAIN_ROOT = REPOSITORY_ROOT / "packages" / "domain"
SCHEMAS_ROOT = DOMAIN_ROOT / "schemas"
FIXTURES_ROOT = DOMAIN_ROOT / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def schema_documents():
    documents = {}
    for path in sorted(SCHEMAS_ROOT.rglob("*.schema.json")):
        schema = load_json(path)
        documents[schema["$id"]] = schema
    return documents


@pytest.fixture(scope="session")
def schema_registry(schema_documents):
    return Registry().with_resources(
        (schema_id, Resource.from_contents(schema))
        for schema_id, schema in schema_documents.items()
    )


@pytest.fixture(scope="session")
def format_checker():
    checker = FormatChecker()

    @checker.checks("uuid-v7")
    def is_uuid_v7(value):
        return isinstance(value, str) and re.fullmatch(
            r"[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
            value,
        ) is not None

    @checker.checks("sha256-hex")
    def is_sha256_hex(value):
        return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None

    @checker.checks("utc-rfc3339")
    def is_utc_rfc3339(value):
        return isinstance(value, str) and re.fullmatch(
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z",
            value,
        ) is not None

    return checker


def validator_for(schema_id, schema_documents, schema_registry, format_checker):
    return Draft202012Validator(
        schema_documents[schema_id],
        registry=schema_registry,
        format_checker=format_checker,
    )
