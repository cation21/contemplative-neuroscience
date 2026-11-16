#!/usr/bin/env python3
"""Contrastively fine-tune a small sentence encoder on the neuroscience corpus.

Loss: MultipleNegativesRankingLoss (InfoNCE with in-batch negatives). Every other positive in
the batch acts as a negative, so larger batches give a harder, better signal.

    python clm/train/finetune.py                         # defaults: MiniLM, 3 epochs, batch 64
    python clm/train/finetune.py --epochs 1 --limit 2000  # quick smoke run

Runs on a free Colab T4 in roughly 10–20 minutes for ~10k papers. Writes the model to
clm/models/clm-neuro-minilm and the held-out ids to clm/data/test_ids.json so that
evaluate.py measures papers the model never saw.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from clm.common import BASE_MODEL, DATA_DIR, ROOT, read_jsonl  # noqa: E402
from clm.pairs import build_pairs, split_ids  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=BASE_MODEL)
    ap.add_argument("--out", default=str(ROOT / "clm" / "models" / "clm-neuro-minilm"))
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--max-seq", type=int, default=256)
    ap.add_argument("--test-frac", type=float, default=0.1)
    ap.add_argument("--limit", type=int, default=0, help="use only the first N papers (debugging)")
    args = ap.parse_args()

    from sentence_transformers import InputExample, SentenceTransformer, losses
    from torch.utils.data import DataLoader

    papers = [p for p in read_jsonl(DATA_DIR / "corpus.jsonl") if p.get("abstract")]
    if args.limit:
        papers = papers[: args.limit]
    cites_path = DATA_DIR / "citation_pairs.jsonl"
    citations = list(read_jsonl(cites_path)) if cites_path.exists() else None

    train_ids, test_ids = split_ids([p["id"] for p in papers], args.test_frac)
    (DATA_DIR / "test_ids.json").write_text(json.dumps(sorted(test_ids)))
    pairs = build_pairs(papers, citations, allowed=train_ids)
    print(f"papers: {len(papers)}  train: {len(train_ids)}  test: {len(test_ids)}")
    print("pairs:", dict(Counter(k for *_, k in pairs)))

    model = SentenceTransformer(args.base)
    model.max_seq_length = args.max_seq
    examples = [InputExample(texts=[a, b]) for a, b, _ in pairs]
    loader = DataLoader(examples, shuffle=True, batch_size=args.batch, drop_last=True)
    loss = losses.MultipleNegativesRankingLoss(model)
    started = time.time()
    model.fit(train_objectives=[(loader, loss)], epochs=args.epochs,
              warmup_steps=int(0.1 * len(loader) * args.epochs),
              optimizer_params={"lr": args.lr}, show_progress_bar=True)
    model.save(args.out)
    write_training_meta(args, papers, train_ids, test_ids, pairs, time.time() - started)
    print(f"saved {args.out}")
    return 0


def write_training_meta(args, papers, train_ids, test_ids, pairs, seconds: float) -> None:
    """Record what was trained, so the site and the docs report the run instead of retyping it."""
    import torch
    import sentence_transformers
    gpus = torch.cuda.device_count()
    meta = {
        "base_model": args.base, "output": Path(args.out).name,
        "loss": "MultipleNegativesRankingLoss (InfoNCE), scale 20",
        "epochs": args.epochs, "batch": f"{args.batch} per GPU ({gpus} GPU{'s' if gpus != 1 else ''})" if gpus else str(args.batch),
        "lr": f"{args.lr:g}", "warmup": "10% of steps", "max_seq_length": args.max_seq,
        "papers": len(papers), "train_papers": len(train_ids), "test_papers": len(test_ids), "pairs": len(pairs),
        "pair_kinds": dict(Counter(k for *_, k in pairs)),
        "hardware": ", ".join(torch.cuda.get_device_name(i) for i in range(gpus)) or "CPU",
        "runtime_s": round(seconds, 1),
        "software": f"torch {torch.__version__}, sentence-transformers {sentence_transformers.__version__}",
        "date": time.strftime("%Y-%m-%d"),
    }
    out = ROOT / "clm" / "eval" / "training.json"
    out.write_text(json.dumps(meta, indent=1) + "\n")
    (Path(args.out) / "training.json").write_text(json.dumps(meta, indent=1) + "\n")


if __name__ == "__main__":
    sys.exit(main())
