from conftest import FIXTURES_ROOT, load_json, validator_for


def test_all_eight_scenarios_validate_against_the_shared_schema(
    schema_documents,
    schema_registry,
    format_checker,
):
    validator = validator_for(
        "https://jejak.finance/schemas/fixtures/scenario.schema.json",
        schema_documents,
        schema_registry,
        format_checker,
    )
    paths = sorted(FIXTURES_ROOT.glob("*.json"))
    assert len(paths) == 8
    scenarios = set()
    for path in paths:
        fixture = load_json(path)
        validator.validate(fixture)
        assert fixture["sandbox"] is True
        scenarios.add(fixture["scenario"])
    assert len(scenarios) == 8
