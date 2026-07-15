from __future__ import annotations

from dataclasses import dataclass
import json
import os
from pathlib import Path


TEST_VECTOR_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"


@dataclass(frozen=True)
class Settings:
    domain_root: Path
    active_model: str = "transparent"
    max_snapshot_age_hours: int = 24
    jcc_key_id: str = ""
    jcc_signing_key_ref: str = ""
    jcc_private_key_hex: str = ""
    jcc_keys_json: str = ""
    revoked_key_ids: tuple[str, ...] = ()
    service_token: str = ""

    @classmethod
    def from_env(cls, domain_root: Path | None = None) -> "Settings":
        root = domain_root or Path(__file__).resolve().parents[4] / "packages" / "domain"
        revoked = tuple(
            item.strip() for item in os.getenv("RISK_JCC_REVOKED_KEY_IDS", "").split(",") if item.strip()
        )
        return cls(
            domain_root=root,
            active_model=os.getenv("RISK_ACTIVE_MODEL", "transparent").lower(),
            max_snapshot_age_hours=int(os.getenv("RISK_MAX_SNAPSHOT_AGE_HOURS", "24")),
            jcc_key_id=os.getenv("JCC_KEY_ID", ""),
            jcc_signing_key_ref=os.getenv("JCC_SIGNING_KEY_REF", ""),
            jcc_private_key_hex=os.getenv("RISK_JCC_PRIVATE_KEY_HEX", ""),
            jcc_keys_json=os.getenv("RISK_JCC_KEYS_JSON", ""),
            revoked_key_ids=revoked,
            service_token=os.getenv("RISK_SERVICE_TOKEN", ""),
        )

    def configured_keys(self) -> dict[str, dict[str, str]]:
        if self.jcc_signing_key_ref and self.jcc_signing_key_ref != "env://RISK_JCC_PRIVATE_KEY_HEX":
            raise ValueError("sandbox only supports JCC_SIGNING_KEY_REF=env://RISK_JCC_PRIVATE_KEY_HEX")
        keys: dict[str, dict[str, str]] = {}
        if self.jcc_key_id and self.jcc_private_key_hex:
            keys[self.jcc_key_id] = {"privateKeyHex": self.jcc_private_key_hex, "status": "ACTIVE"}
        if self.jcc_keys_json:
            parsed = json.loads(self.jcc_keys_json)
            if not isinstance(parsed, dict):
                raise ValueError("RISK_JCC_KEYS_JSON must be an object keyed by key ID.")
            for key_id, value in parsed.items():
                if not isinstance(key_id, str) or not isinstance(value, dict):
                    raise ValueError("RISK_JCC_KEYS_JSON contains an invalid key entry.")
                private_key = value.get("privateKeyHex")
                status = value.get("status", "ACTIVE")
                if not isinstance(private_key, str) or not isinstance(status, str):
                    raise ValueError("RISK_JCC_KEYS_JSON entries need privateKeyHex and status.")
                keys[key_id] = {"privateKeyHex": private_key, "status": status}
        return keys
