from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import random

import polars as pl


FEATURE_COLUMNS = [
    "refundRateBps", "rtoRateBps", "chargebackRateBps", "dataQualityScoreBps",
    "orderCount", "sellerTenureDays", "concentrationBps",
]


@dataclass(frozen=True)
class SyntheticDataset:
    frame: pl.DataFrame
    seed: int
    training_start: datetime
    training_end: datetime


def build_synthetic_dataset(seed: int = 20260715, weeks: int = 52, sellers: int = 24) -> SyntheticDataset:
    """Create only sandbox records; labels are generated after the decision cutoff."""
    randomizer = random.Random(seed)
    # Polars operates on naive UTC timestamps here so the sandbox does not rely
    # on the host's optional IANA timezone database (often absent on Windows).
    start = datetime(2025, 7, 14)
    records: list[dict[str, int | str]] = []
    for seller_index in range(sellers):
        seller = f"sandbox-seller-{seller_index:03d}"
        tenure = 30 + seller_index * 19
        for week in range(weeks):
            cutoff = start + timedelta(days=week * 7)
            refund = randomizer.randint(0, 3600)
            rto = randomizer.randint(0, 2200)
            chargeback = randomizer.randint(0, 1000)
            quality = randomizer.randint(7600, 10000)
            orders = randomizer.randint(8, 600)
            concentration = randomizer.randint(500, 9000)
            noise = randomizer.randint(-350, 350)
            realized = min(10000, max(0, 600 + refund // 2 + rto // 4 + chargeback + (10000 - quality) // 2 + noise))
            records.append({
                "sellerGroup": seller,
                "snapshotCutoffAt": cutoff.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "refundRateBps": refund,
                "rtoRateBps": rto,
                "chargebackRateBps": chargeback,
                "dataQualityScoreBps": quality,
                "orderCount": orders,
                "sellerTenureDays": tenure + week * 7,
                "concentrationBps": concentration,
                "realizedDilutionBps": realized,
            })
    frame = pl.DataFrame(records).with_columns(
        pl.col("snapshotCutoffAt").str.to_datetime(
            format="%Y-%m-%dT%H:%M:%SZ",
        )
    )
    return SyntheticDataset(frame=frame, seed=seed, training_start=start, training_end=start + timedelta(days=(weeks - 1) * 7))


def ground_truth(frame: pl.DataFrame) -> pl.DataFrame:
    """Expose only post-cutoff realized dilution as the label."""
    required = set(FEATURE_COLUMNS + ["sellerGroup", "snapshotCutoffAt", "realizedDilutionBps"])
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"ground truth input misses columns: {sorted(missing)}")
    return frame.select(["sellerGroup", "snapshotCutoffAt", *FEATURE_COLUMNS, "realizedDilutionBps"])
