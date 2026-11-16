"""Retrieval metrics (numpy only)."""
from __future__ import annotations

import numpy as np


def rank_of_target(queries: np.ndarray, docs: np.ndarray, targets: np.ndarray) -> np.ndarray:
    """1-based rank of docs[targets[i]] for queries[i] under cosine similarity (inputs L2-normalised)."""
    sims = queries @ docs.T
    target_scores = sims[np.arange(len(queries)), targets][:, None]
    return (sims > target_scores).sum(axis=1) + 1


def retrieval_report(ranks: np.ndarray, ks=(1, 5, 10)) -> dict:
    out = {f"recall@{k}": float((ranks <= k).mean()) for k in ks}
    out["mrr"] = float((1.0 / ranks).mean())
    out["median_rank"] = float(np.median(ranks))
    out["n"] = int(len(ranks))
    return out
