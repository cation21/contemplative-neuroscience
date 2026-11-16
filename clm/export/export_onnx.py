#!/usr/bin/env python3
"""Export a fine-tuned sentence-transformers model to ONNX for Transformers.js.

Produces the folder layout Transformers.js expects:
    site/models/<name>/config.json, tokenizer.json, tokenizer_config.json, ...
    site/models/<name>/onnx/model.onnx
    site/models/<name>/onnx/model_quantized.onnx   (int8, ~4x smaller; what the site loads)

    pip install "optimum[onnxruntime]"
    python clm/export/export_onnx.py --model clm/models/clm-neuro-minilm

Then set "model" in site/data/config.json to "./models/clm-neuro-minilm" and re-run
embed_corpus.py with the same --model so corpus and queries share one encoder.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--name", default=None)
    args = ap.parse_args()

    from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from transformers import AutoTokenizer

    src = Path(args.model)
    name = args.name or src.name
    out = ROOT / "site" / "models" / name
    tmp = out / "_tmp"
    # sentence-transformers keeps the HF transformer at the root of the folder
    model = ORTModelForFeatureExtraction.from_pretrained(src, export=True)
    tok = AutoTokenizer.from_pretrained(src)
    model.save_pretrained(tmp)
    tok.save_pretrained(out)

    q = ORTQuantizer.from_pretrained(tmp)
    q.quantize(save_dir=tmp / "q", quantization_config=AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False))

    (out / "onnx").mkdir(parents=True, exist_ok=True)
    shutil.copy(tmp / "model.onnx", out / "onnx" / "model.onnx")
    shutil.copy(next((tmp / "q").glob("*.onnx")), out / "onnx" / "model_quantized.onnx")
    shutil.copy(tmp / "config.json", out / "config.json")
    shutil.rmtree(tmp)

    cfg_path = ROOT / "site" / "data" / "config.json"
    cfg = json.loads(cfg_path.read_text())
    print(f"exported to {out.relative_to(ROOT)}")
    print(f"current site model: {cfg.get('model')}. Set it to './models/{name}' to use this export.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
