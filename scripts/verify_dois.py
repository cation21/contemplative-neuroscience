#!/usr/bin/env python3
"""Check every DOI in knowledge/papers.yaml against Crossref and compare titles.

    python scripts/verify_dois.py              # report only
    python scripts/verify_dois.py --write      # set verified: true for entries that match

Exits non-zero if any DOI fails to resolve or its title differs substantially.
Uses only the standard library so it runs in a bare CI image.
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "knowledge" / "papers.yaml"
UA = "contemplative-neuroscience-kb/1.0 (https://github.com/cation21/contemplative-neuroscience)"


def norm(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def crossref_title(doi: str) -> str | None:
    url = "https://api.crossref.org/works/" + urllib.parse.quote(doi)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            msg = json.load(r)["message"]
            return (msg.get("title") or [""])[0]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--threshold", type=float, default=0.85)
    args = ap.parse_args()

    text = PAPERS.read_text(encoding="utf-8")
    papers = yaml.safe_load(text)["papers"]
    failures, confirmed = [], []

    for p in papers:
        doi = p.get("doi")
        if not doi:
            continue
        title = crossref_title(str(doi))
        time.sleep(0.2)
        if title is None:
            failures.append(f"{p['id']}: DOI {doi} not found")
            continue
        ratio = difflib.SequenceMatcher(None, norm(title), norm(p["title"])).ratio()
        if ratio < args.threshold:
            failures.append(f"{p['id']}: title mismatch ({ratio:.2f})\n    ours:     {p['title']}\n    crossref: {title}")
        else:
            confirmed.append(p["id"])

    print(f"Confirmed {len(confirmed)} DOIs.")
    if failures:
        print("Problems:\n  " + "\n  ".join(failures))

    if args.write and confirmed:
        # Flip `verified: false` to true only inside confirmed entries, preserving formatting.
        blocks = re.split(r"(?m)^(?=- id: )", text)
        for i, block in enumerate(blocks):
            m = re.match(r"- id: (\S+)", block)
            if m and m.group(1) in confirmed:
                blocks[i] = block.replace("verified: false", "verified: true", 1)
        PAPERS.write_text("".join(blocks), encoding="utf-8")
        print("Updated verified flags in knowledge/papers.yaml")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
