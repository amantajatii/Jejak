import pytest
from jsonschema import ValidationError

from conftest import validator_for


def test_money_requires_an_integer_string_and_explicit_scale(
    schema_documents,
    schema_registry,
    format_checker,
):
    validator = validator_for(
        "https://jejak.finance/schemas/common/money.schema.json",
        schema_documents,
        schema_registry,
        format_checker,
    )
    validator.validate({"amountMinor": "6400", "currency": "TIDR", "scale": 2})

    with pytest.raises(ValidationError):
        validator.validate({"amountMinor": 64.0, "currency": "TIDR", "scale": 2})

    with pytest.raises(ValidationError):
        validator.validate({"amountMinor": "64.00", "currency": "TIDR", "scale": 2})
