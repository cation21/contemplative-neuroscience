#!/usr/bin/env python3
"""Compare encoders on held-out papers.

Tasks (all on papers excluded from fine-tuning):
  title->abstract   does a paper's title retrieve its own abstract among all test abstracts?
  half->half        does the first half of an abstract retrieve the second half?

    python clm/eval/evaluate.py                                   # base vs fine-tuned (if present)
    python clm/eval/evaluate.py --models sentence-transformers/all-MiniLM-L6-v2 allenai/specter2_base

Writes clm/eval/results.json and clm/eval/RESULTS.md.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from clm.common import BASE_MODEL, DATA_DIR, ROOT, read_jsonl  # noqa: E402
from clm.metrics import rank_of_target, retrieval_report  # noqa: E402
from clm.pairs import abstract_halves, split_ids  # noqa: E402

FINETUNED = ROOT / "clm" / "models" / "clm-neuro-minilm"


def encode(model, texts):
    return model.encode(texts, batch_size=64, normalize_embeddings=True, show_progress_bar=False,
                        convert_to_numpy=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*")
    args = ap.parse_args()
    from sentence_transformers import SentenceTransformer

    papers = [p for p in read_jsonl(DATA_DIR / "corpus.jsonl") if p.get("abstract")]
    ids_file = DATA_DIR / "test_ids.json"
    test_ids = set(json.loads(ids_file.read_text())) if ids_file.exists() else split_ids([p["id"] for p in papers])[1]
    test = [p for p in papers if p["id"] in test_ids]
    halves = [h for h in (abstract_halves(p["abstract"]) for p in test) if h]

    models = args.models or [BASE_MODEL] + ([str(FINETUNED)] if FINETUNED.exists() else [])
    results = {}
    for name in models:
        m = SentenceTransformer(name)
        t = encode(m, [p["title"] for p in test])
        a = encode(m, [p["abstract"] for p in test])
        r1 = retrieval_report(rank_of_target(t, a, np.arange(len(test))))
        h1 = encode(m, [x for x, _ in halves])
        h2 = encode(m, [y for _, y in halves])
        r2 = retrieval_report(rank_of_target(h1, h2, np.arange(len(halves))))
        results[Path(name).name] = {"title->abstract": r1, "half->half": r2}
        print(name, json.dumps(results[Path(name).name], indent=1))

    out = ROOT / "clm" / "eval"
    (out / "results.json").write_text(json.dumps(results, indent=1))
    rows = ["| Model | Task | R@1 | R@5 | R@10 | MRR | n |", "|---|---|---|---|---|---|---|"]
    for model, tasks in results.items():
        for task, r in tasks.items():
            rows.append(f"| {model} | {task} | {r['recall@1']:.3f} | {r['recall@5']:.3f} | {r['recall@10']:.3f} | {r['mrr']:.3f} | {r['n']} |")
    (out / "RESULTS.md").write_text("# Retrieval on held-out papers\n\n" + "\n".join(rows) + "\n")
    print("\n".join(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
