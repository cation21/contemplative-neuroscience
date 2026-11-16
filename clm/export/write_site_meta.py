#!/usr/bin/env python3
"""Publish the training run and its evaluation to the site as site/data/clm.json.

Reads clm/eval/training.json (written by finetune.py) and clm/eval/results.json (written by
evaluate.py). The "How it works" page shows these numbers, so nothing on the site is retyped.

    python clm/export/write_site_meta.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from clm.common import ROOT, SITE_DATA  # noqa: E402

EVAL = ROOT / "clm" / "eval"
LABELS = {
    "all-MiniLM-L6-v2": "Base MiniLM",
    "clm-neuro-minilm": "Fine-tuned (this site)",
    "specter2_base": "SPECTER2 base",
}
CAVEATS = [
    "The test tasks have the same shape as the training pairs, only on unseen papers, so part of the gain is "
    "the model getting better at exactly that task. A citation-based or human-judged test would be stronger evidence.",
    "SPECTER2 was run without its task adapter and with mean pooling, so its numbers understate it.",
    "One training run and one split: there are no error bars yet.",
]


def main() -> int:
    training = json.loads((EVAL / "training.json").read_text())
    results = json.loads((EVAL / "results.json").read_text())
    rounded = {m: {t: {k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for t, r in tasks.items()}
               for m, tasks in results.items()}
    out = {
        "training": training,
        "results": rounded,
        "finetuned": training.get("output", "clm-neuro-minilm"),
        "labels": LABELS,
        "caveats": CAVEATS,
    }
    path = SITE_DATA / "clm.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
