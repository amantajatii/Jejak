# Python contract consumer

This suite proves that the RISK/Python boundary consumes the canonical JSON Schemas, scenario fixtures, and byte vectors directly from `packages/domain`. It intentionally creates no copied Python models.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r tests/contract/python/requirements.txt
.venv/bin/python -m pytest tests/contract/python -q
```

The JCC test checks the canonical bytes and parses the fixed signature vector. The RISK workstream remains responsible for independent RFC 8785 canonicalization and Ed25519 signing verification.
