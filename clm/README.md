# CLM paper finder

Paste an abstract or a rough idea and get the closest papers. Ranking uses a contrastive
language model: a small sentence encoder trained so that related texts produce nearby vectors.
Queries are embedded in the browser, so nothing typed into the site leaves the device.

```
clm/
├── common.py               shared text format, DOI/licence helpers
├── encoders.py             one Encoder interface: PyTorch (training) or ONNX (CI, same weights as the site)
├── pairs.py                training pairs and train/test split
├── metrics.py              recall@k, MRR
├── corpus/
│   ├── queries.yaml        what to fetch
│   └── build_corpus.py     curated seed + Europe PMC + arXiv (+ OpenAlex citations)
├── train/finetune.py       contrastive fine-tuning (MultipleNegativesRankingLoss)
├── eval/evaluate.py        base vs fine-tuned on held-out papers
├── kaggle/
│   └── clm_finetune_kaggle.ipynb   fine-tune + evaluate on a free Kaggle GPU
├── export/
│   ├── embed_corpus.py     vectors (int8) + 2D map for the site
│   ├── export_onnx.py      ONNX + int8 model for Transformers.js
│   └── write_site_meta.py  training + evaluation numbers -> site/data/clm.json
└── tests/
```

## Quick start

```bash
pip install -r clm/requirements.txt

python clm/corpus/build_corpus.py --scale 0.1     # small test corpus (~1k papers)
python clm/export/embed_corpus.py                 # vectors + map for site/
python -m http.server -d site 8000                # open http://localhost:8000/#find
```

Without `embed_corpus.py`, the site still works: it embeds the corpus on the visitor's device
on first load and caches the vectors in IndexedDB. That is fine for a few hundred papers;
precompute for anything larger.

## Fine-tuning your own encoder

The base model (all-MiniLM-L6-v2) works out of the box. Fine-tuning on this field's papers is
what turns the finder into a research artefact: you can report how much a domain-tuned encoder
improves retrieval over the base model.

```bash
python clm/corpus/build_corpus.py                  # full corpus (~10k papers)
OPENALEX_API_KEY=... python clm/corpus/build_corpus.py --citations   # optional citation pairs
python clm/train/finetune.py                       # ~10–20 min on a free Colab T4
python clm/eval/evaluate.py                        # writes clm/eval/RESULTS.md
```

Training pairs come from the papers themselves, so no labelling is needed:

| Pair | Signal |
|---|---|
| title → its own abstract | what a paper is about |
| first half of abstract → second half | topical coherence when titles are vague |
| paper → a paper it cites (both in corpus) | relatedness as researchers judge it (the idea behind SPECTER) |

The split is by paper, and `evaluate.py` only scores papers held out from training. Compare
against SPECTER2 too: `python clm/eval/evaluate.py --models sentence-transformers/all-MiniLM-L6-v2 clm/models/clm-neuro-minilm allenai/specter2_base`.

### Shipping the fine-tuned model to the site

```bash
pip install "optimum[onnxruntime]"
python clm/export/export_onnx.py --model clm/models/clm-neuro-minilm
python clm/export/embed_corpus.py --model clm/models/clm-neuro-minilm --browser-model ./models/clm-neuro-minilm
python clm/export/write_site_meta.py   # numbers for the "How it works" page
# then set "model": "./models/clm-neuro-minilm" in site/data/config.json
```

Corpus and queries must use the same encoder. The site checks `browser_model` in
`embeddings.meta.json` and falls back to on-device embedding if they differ.

## Live search

With *Also search Europe PMC* ticked, the site extracts a few keywords from the text, sends
only those to Europe PMC (no key needed), fetches up to 50 papers with abstracts, embeds them
locally and merges them into the ranking. The keywords sent are shown above the results.
OpenAlex is used too if the visitor enters their own free key; since February 2026 OpenAlex
requires a key for API use.

## Licensing

- `clm/data/` (gitignored) holds the full working corpus, including all abstracts, for
  training and embedding.
- `site/data/corpus.json` is public. It carries metadata for every paper but abstract text
  only where the licence allows redistribution (CC0, CC BY, CC BY-SA; arXiv metadata is CC0).
  Other papers are represented by their title and their embedding, and link to the source.
- Curated summaries come from `knowledge/papers.yaml` and are CC BY 4.0.
