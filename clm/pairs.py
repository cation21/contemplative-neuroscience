"""Training-pair construction and train/test splitting. No heavy dependencies, so it is unit-tested."""
from __future__ import annotations

import random
import re
from collections import defaultdict


def split_ids(ids: list[str], test_frac: float = 0.1, seed: int = 13) -> tuple[set[str], set[str]]:
    """Deterministic split by paper id, so no paper appears on both sides."""
    rng = random.Random(seed)
    ids = sorted(ids)
    rng.shuffle(ids)
    n_test = max(1, int(len(ids) * test_frac)) if len(ids) > 1 else 0
    return set(ids[n_test:]), set(ids[:n_test])


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def abstract_halves(abstract: str, min_sentences: int = 4) -> tuple[str, str] | None:
    sents = sentences(abstract)
    if len(sents) < min_sentences:
        return None
    mid = len(sents) // 2
    return " ".join(sents[:mid]), " ".join(sents[mid:])


def build_pairs(papers: list[dict], citations: list[dict] | None = None,
                allowed: set[str] | None = None, max_cites_per_paper: int = 5,
                seed: int = 13) -> list[tuple[str, str, str]]:
    """Return (anchor, positive, kind) pairs.

    kinds:
      title-abstract   title -> its own abstract (the main signal)
      halves           first half of abstract -> second half
      citation         paper text -> a paper it cites (both inside the corpus)
    In-batch negatives come for free with MultipleNegativesRankingLoss.
    """
    rng = random.Random(seed)
    by_id = {p["id"]: p for p in papers if allowed is None or p["id"] in allowed}
    pairs: list[tuple[str, str, str]] = []
    for p in by_id.values():
        abstract = p.get("abstract") or p.get("summary") or ""
        if not abstract:
            continue
        pairs.append((p["title"], abstract, "title-abstract"))
        halves = abstract_halves(abstract)
        if halves:
            pairs.append((halves[0], halves[1], "halves"))

    if citations:
        grouped = defaultdict(list)
        for c in citations:
            if c["paper"] in by_id and c["cites"] in by_id:
                grouped[c["paper"]].append(c["cites"])
        for src, cited in grouped.items():
            rng.shuffle(cited)
            a = by_id[src]
            for cid in cited[:max_cites_per_paper]:
                b = by_id[cid]
                pairs.append((f"{a['title']}. {a.get('abstract', '')}".strip(),
                              f"{b['title']}. {b.get('abstract', '')}".strip(), "citation"))
    rng.shuffle(pairs)
    return pairs
