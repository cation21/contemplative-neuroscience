"""Shared helpers for the CLM pipeline. Keep `paper_text` in sync with site/js/lib/search-core.js."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Iterable, Iterator

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "clm" / "data"            # private working files (gitignored)
SITE_DATA = ROOT / "site" / "data"          # what the browser loads
BASE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
BROWSER_MODEL = "Xenova/all-MiniLM-L6-v2"  # ONNX build of the base weights for Transformers.js (has the q8 file)


def paper_text(title: str, body: str | None) -> str:
    """The exact string we embed. Mirrors paperText() in site/js/lib/search-core.js."""
    title = " ".join((title or "").split())
    body = " ".join((body or "").split())
    return f"{title}. {body}".strip() if body else title


def normalize_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def normalize_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    doi = doi.strip().lower()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
    return doi or None


def paper_key(p: dict) -> str:
    """Stable dedup key: DOI if present, else normalised title."""
    return normalize_doi(p.get("doi")) or "t:" + normalize_title(p.get("title", ""))


def stable_id(p: dict) -> str:
    return hashlib.sha1(paper_key(p).encode()).hexdigest()[:12]


def reconstruct_abstract(inverted: dict | None) -> str:
    """Rebuild plain text from an OpenAlex abstract_inverted_index."""
    if not inverted:
        return ""
    positions = [(pos, word) for word, poss in inverted.items() for pos in poss]
    return " ".join(word for _, word in sorted(positions))


def license_is_open(lic: str | None) -> bool:
    """True for CC0, CC BY, CC BY-SA and public domain (any version). NC/ND variants are excluded."""
    if not lic:
        return False
    s = re.sub(r"[\s_]+", "-", lic.strip().lower())
    s = re.sub(r"-\d+(\.\d+)*$", "", s)           # drop a trailing version like -4.0
    s = s.replace("creative-commons-", "cc-").replace("attribution", "by")
    if "nc" in s.split("-") or "nd" in s.split("-"):
        return False
    return s in {"cc0", "cc-by", "cc-by-sa", "public-domain", "pd"}


def dedupe(papers: Iterable[dict]) -> list[dict]:
    """Keep the first occurrence of each paper, but fill missing fields from later duplicates."""
    out: dict[str, dict] = {}
    for p in papers:
        k = paper_key(p)
        if k not in out:
            out[k] = dict(p)
        else:
            for field, value in p.items():
                if value and not out[k].get(field):
                    out[k][field] = value
    return list(out.values())


def read_jsonl(path: Path) -> Iterator[dict]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n
