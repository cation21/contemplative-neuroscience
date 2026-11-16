"""Text encoders behind one small interface, so scripts depend on "something that embeds text",
not on a particular runtime.

- TorchEncoder: a sentence-transformers checkpoint (Hub id or folder). Used for training and eval.
- OnnxEncoder:  the exported browser model (site/models/<name>), run with onnxruntime. Lets CI embed
                the corpus with exactly the weights the site ships, without PyTorch or the
                private training checkpoint.

Both return L2-normalised float32 rows from mean pooling over real tokens (padding excluded),
which is what Transformers.js does in the browser.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np


class Encoder(Protocol):
    name: str

    def encode(self, texts: list[str], batch_size: int = 64) -> np.ndarray: ...


class TorchEncoder:
    def __init__(self, model: str, max_seq_length: int = 256):
        from sentence_transformers import SentenceTransformer
        self.name = model
        self._m = SentenceTransformer(model)
        self._m.max_seq_length = max_seq_length

    def encode(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        return self._m.encode(texts, batch_size=batch_size, normalize_embeddings=True,
                              show_progress_bar=True, convert_to_numpy=True).astype(np.float32)


class OnnxEncoder:
    def __init__(self, folder: str | Path, file: str = "model_quantized.onnx", max_seq_length: int = 256):
        import onnxruntime as ort
        from tokenizers import Tokenizer
        folder = Path(folder)
        self.name = str(folder)
        self._tok = Tokenizer.from_file(str(folder / "tokenizer.json"))
        self._tok.enable_truncation(max_seq_length)
        self._tok.enable_padding()
        self._sess = ort.InferenceSession(str(folder / "onnx" / file), providers=["CPUExecutionProvider"])
        self._inputs = {i.name for i in self._sess.get_inputs()}

    def encode(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        out = []
        for i in range(0, len(texts), batch_size):
            enc = self._tok.encode_batch(texts[i:i + batch_size])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
            hidden = self._sess.run(None, {k: v for k, v in feed.items() if k in self._inputs})[0]
            pooled = (hidden * mask[..., None]).sum(1) / np.maximum(mask.sum(1, keepdims=True), 1)
            out.append(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
        return np.vstack(out).astype(np.float32)


def load_encoder(model: str | None = None, onnx: str | None = None) -> Encoder:
    """Pick the runtime from the arguments: an ONNX folder wins, else a sentence-transformers model."""
    return OnnxEncoder(onnx) if onnx else TorchEncoder(model)
