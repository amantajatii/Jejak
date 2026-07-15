from jsonschema import Draft202012Validator

from conftest import SCHEMAS_ROOT, load_json


def test_every_schema_is_draft_2020_12_and_has_a_unique_id(schema_documents):
    paths = sorted(SCHEMAS_ROOT.rglob("*.schema.json"))
    assert len(paths) == 31
    assert len(schema_documents) == len(paths)
    for path in paths:
        schema = load_json(path)
        assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
        assert schema["title"]
        Draft202012Validator.check_schema(schema)
