#!/usr/bin/env python3
"""Embed the public corpus for the browser and compute the 2D map.

Reads   site/data/corpus.json (+ clm/data/corpus.jsonl for abstracts that can't be published)
Writes  site/data/embeddings.i8.bin        int8 vectors, row-major, count x dim
        site/data/embeddings.scale.f32.bin float32 per-row scale (v = int8 * scale)
        site/data/embeddings.meta.json     model, dim, ids, text format
        site/data/map.json                 2D coordinates + cluster labels

The browser must embed queries with the same model, so --browser-model must name what
site/data/config.json loads. Three ways to run it:

    python clm/export/embed_corpus.py                                    # base model (PyTorch)
    python clm/export/embed_corpus.py --model clm/models/clm-neuro-minilm --browser-model ./models/clm-neuro-minilm
    python clm/export/embed_corpus.py --onnx site/models/clm-neuro-minilm --browser-model ./models/clm-neuro-minilm

The --onnx form uses the exact int8 weights the site ships and needs no PyTorch, so CI uses it.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from clm.common import BASE_MODEL, BROWSER_MODEL, DATA_DIR, SITE_DATA, paper_text, read_jsonl  # noqa: E402
from clm.encoders import load_encoder  # noqa: E402

STOP = set("""a an the of in on for and or to with by from as at is are was were be been this that these those
using use based study studies effect effects during among between into via its their our we toward towards
meditation mindfulness meditators meditative practice training brain neural""".split())


def quantize(x: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    scale = np.abs(x).max(axis=1, keepdims=True) / 127.0
    scale[scale == 0] = 1.0
    q = np.clip(np.round(x / scale), -127, 127).astype(np.int8)
    return q, scale[:, 0].astype(np.float32)


def pca_2d(x: np.ndarray) -> np.ndarray:
    xc = x - x.mean(axis=0)
    _, _, vt = np.linalg.svd(xc, full_matrices=False)
    return xc @ vt[:2].T


def kmeans(x: np.ndarray, k: int, iters: int = 50, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    centers = x[rng.choice(len(x), size=k, replace=False)]
    for _ in range(iters):
        labels = np.argmax(x @ centers.T, axis=1)  # cosine k-means on normalised vectors
        new = np.stack([x[labels == j].mean(axis=0) if (labels == j).any() else centers[j] for j in range(k)])
        new /= np.linalg.norm(new, axis=1, keepdims=True) + 1e-9
        if np.allclose(new, centers):
            break
        centers = new
    return labels


def label_clusters(titles: list[str], labels: np.ndarray, k: int) -> list[str]:
    words = [Counter(w for w in re.findall(r"[a-z][a-z\-]{2,}", t.lower()) if w not in STOP) for t in titles]
    total = Counter()
    for c in words:
        total.update(set(c))
    names = []
    for j in range(k):
        cnt = Counter()
        members = np.where(labels == j)[0]
        for i in members:
            cnt.update(set(words[i]))
        scored = sorted(cnt, key=lambda w: cnt[w] * np.log(len(titles) / (1 + total[w])), reverse=True)
        names.append(", ".join(scored[:3]) or f"cluster {j + 1}")
    return names


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=BASE_MODEL)
    ap.add_argument("--browser-model", default=BROWSER_MODEL, help="model id/path the site loads")
    ap.add_argument("--onnx", default=None, help="folder of an exported browser model; overrides --model")
    ap.add_argument("--clusters", type=int, default=0, help="0 = choose automatically")
    args = ap.parse_args()

    corpus = json.loads((SITE_DATA / "corpus.json").read_text(encoding="utf-8"))
    papers = corpus["papers"]
    private = {p["id"]: p for p in read_jsonl(DATA_DIR / "corpus.jsonl")} if (DATA_DIR / "corpus.jsonl").exists() else {}
    texts = []
    for p in papers:
        body = (private.get(p["id"], {}).get("abstract") or p.get("abstract") or p.get("summary") or "")
        texts.append(paper_text(p["title"], body))

    encoder = load_encoder(args.model, args.onnx)
    emb = encoder.encode(texts)
    q, scale = quantize(emb)
    q.tofile(SITE_DATA / "embeddings.i8.bin")
    scale.tofile(SITE_DATA / "embeddings.scale.f32.bin")
    (SITE_DATA / "embeddings.meta.json").write_text(json.dumps({
        "model": encoder.name, "browser_model": args.browser_model, "dim": int(emb.shape[1]),
        "count": int(emb.shape[0]), "dtype": "int8+scale", "pooling": "mean", "normalized": True,
        "text_format": "title. abstract (or curated summary)", "corpus_version": corpus.get("version"),
        "ids": [p["id"] for p in papers]}) + "\n")

    try:
        import umap  # optional, nicer layout
        xy = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=0).fit_transform(emb)
        method = "umap"
    except ImportError:
        xy = pca_2d(emb)
        method = "pca"
    k = args.clusters or int(np.clip(round(np.sqrt(len(papers) / 8)), 3, 14))
    labels = kmeans(emb, k)
    names = label_clusters([p["title"] for p in papers], labels, k)
    xy = (xy - xy.min(axis=0)) / (np.ptp(xy, axis=0) + 1e-9)
    (SITE_DATA / "map.json").write_text(json.dumps({
        "method": method, "clusters": names,
        "points": {p["id"]: [round(float(a), 4), round(float(b), 4), int(c)] for p, (a, b), c in zip(papers, xy, labels)}}) + "\n")
    corpus["embeddings"] = "embeddings.meta.json"
    (SITE_DATA / "corpus.json").write_text(json.dumps(corpus, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"embedded {len(papers)} papers ({emb.shape[1]}d), map via {method}, {k} clusters")
    return 0


if __name__ == "__main__":
    sys.exit(main())
