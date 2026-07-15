from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


class DomainSchemaValidator:
    def __init__(self, domain_root: Path):
        registry = Registry()
        documents: dict[str, dict[str, Any]] = {}
        for path in (domain_root / "schemas").rglob("*.schema.json"):
            document = json.loads(path.read_text(encoding="utf-8"))
            schema_id = document["$id"]
            documents[schema_id] = document
            registry = registry.with_resource(schema_id, Resource.from_contents(document))
        self._validators = {
            schema_id: Draft202012Validator(document, registry=registry, format_checker=FormatChecker())
            for schema_id, document in documents.items()
        }

    def validate(self, schema_id: str, value: Any) -> None:
        validator = self._validators[schema_id]
        errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
        if errors:
            raise ValueError("; ".join(error.message for error in errors[:3]))
