#!/usr/bin/env python3
"""Build the paper-finder corpus.

Sources
  1. knowledge/papers.yaml          curated seed (always included, flagged `curated`)
  2. Europe PMC REST API            no key needed; abstracts + licence info
  3. arXiv API                      metadata is CC0
  4. OpenAlex (optional)            citation links between corpus papers; needs OPENALEX_API_KEY

Outputs
  clm/data/corpus.jsonl             full working corpus incl. all abstracts (private, gitignored)
  clm/data/citation_pairs.jsonl     (paper_id, cited_paper_id) inside the corpus, if OpenAlex used
  site/data/corpus.json             public corpus: metadata for all papers, abstract text only
                                    where the licence allows redistribution

Usage
  python clm/corpus/build_corpus.py                       # seed + Europe PMC + arXiv
  OPENALEX_API_KEY=... python clm/corpus/build_corpus.py --citations
  python clm/corpus/build_corpus.py --seed-only           # offline: curated papers only
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from clm.common import (  # noqa: E402
    DATA_DIR, ROOT, SITE_DATA, dedupe, license_is_open, normalize_doi,
    reconstruct_abstract, stable_id, write_jsonl,
)

UA = "contemplative-neuroscience-corpus/1.0 (+https://github.com/cation21/contemplative-neuroscience)"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
ARXIV = "https://export.arxiv.org/api/query"
OPENALEX = "https://api.openalex.org/works"


def get(url: str, params: dict | None = None, retries: int = 4) -> bytes:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt * 2
            if isinstance(e, urllib.error.HTTPError) and e.code in (429, 503):
                # rate limited: honour Retry-After, otherwise back off much longer
                ra = e.headers.get("Retry-After", "") if e.headers else ""
                wait = int(ra) if ra.isdigit() else 30 * (attempt + 1)
            print(f"  retry in {wait}s ({e})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def clean(s: str | None) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    return " ".join(s.split())


# ---------------------------------------------------------------- sources

def seed_papers() -> list[dict]:
    data = yaml.safe_load((ROOT / "knowledge" / "papers.yaml").read_text(encoding="utf-8"))
    out = []
    for p in data["papers"]:
        out.append({
            "title": p["title"], "authors": p["authors"], "year": p["year"], "venue": p["venue"],
            "doi": normalize_doi(p.get("doi")), "arxiv": p.get("arxiv"),
            "abstract": "", "summary": " ".join(str(p["summary"]).split()),
            "license": "cc-by",  # our own summaries are CC BY 4.0
            "source": "curated", "curated": True, "kb_id": p["id"],
            "topics": p.get("topics", []), "practices": p.get("practices", []),
            "modalities": p.get("modalities", []), "type": p.get("type"),
        })
    return out


def europe_pmc(query: str, cap: int) -> list[dict]:
    out, cursor = [], "*"
    while len(out) < cap:
        raw = get(EPMC, {"query": query, "resultType": "core", "format": "json",
                         "pageSize": min(1000, cap - len(out)), "cursorMark": cursor})
        data = json.loads(raw)
        results = data.get("resultList", {}).get("result", [])
        for r in results:
            if not r.get("title"):
                continue
            journal = (r.get("journalInfo") or {}).get("journal", {}).get("title") or r.get("bookOrReportDetails", {}).get("publisher")
            kws = (r.get("keywordList") or {}).get("keyword", [])
            mesh = [m.get("descriptorName") for m in (r.get("meshHeadingList") or {}).get("meshHeading", [])]
            out.append({
                "title": clean(r["title"]).rstrip("."), "authors": r.get("authorString", ""),
                "year": int(r["pubYear"]) if str(r.get("pubYear", "")).isdigit() else None,
                "venue": journal or r.get("source"), "doi": normalize_doi(r.get("doi")),
                "pmid": r.get("pmid"), "pmcid": r.get("pmcid"),
                "abstract": clean(r.get("abstractText")), "license": (r.get("license") or "").lower() or None,
                "source": "europepmc", "keywords": [k for k in kws if k][:12] + [m for m in mesh if m][:8],
                "cited_by": r.get("citedByCount", 0),
            })
        nxt = data.get("nextCursorMark")
        if not results or not nxt or nxt == cursor:
            break
        cursor = nxt
        time.sleep(0.3)
    return out


def arxiv(query: str, cap: int) -> list[dict]:
    ns = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    out, start = [], 0
    while len(out) < cap:
        try:
            raw = get(ARXIV, {"search_query": query, "start": start, "max_results": min(200, cap - len(out))},
                      retries=6)
        except Exception as e:  # noqa: BLE001
            print(f"  arXiv gave up after retries ({e}); keeping {len(out)} papers", file=sys.stderr)
            break
        root = ET.fromstring(raw)
        entries = root.findall("a:entry", ns)
        if not entries:
            break
        for e in entries:
            aid = e.findtext("a:id", "", ns).rsplit("/abs/", 1)[-1]
            aid = re.sub(r"v\d+$", "", aid)
            doi = e.findtext("arxiv:doi", None, ns)
            authors = [a.findtext("a:name", "", ns) for a in e.findall("a:author", ns)]
            out.append({
                "title": clean(e.findtext("a:title", "", ns)), "authors": ", ".join(authors[:3]) + (" et al." if len(authors) > 3 else ""),
                "year": int(e.findtext("a:published", "0000", ns)[:4]), "venue": "arXiv",
                "doi": normalize_doi(doi), "arxiv": aid, "abstract": clean(e.findtext("a:summary", "", ns)),
                "license": "cc0",  # arXiv metadata, including abstracts, is CC0
                "source": "arxiv",
            })
        start += len(entries)
        time.sleep(3)  # arXiv asks for a 3 s gap between calls
    return out


def openalex_citations(papers: list[dict], key: str) -> list[dict]:
    """Return citation pairs (both ends inside the corpus) using OpenAlex referenced_works."""
    with_doi = [p for p in papers if p.get("doi")]
    doi_to_id = {p["doi"]: p["id"] for p in with_doi}
    oa_to_id, refs = {}, {}
    for i in range(0, len(with_doi), 50):
        batch = with_doi[i:i + 50]
        raw = get(OPENALEX, {"filter": "doi:" + "|".join(p["doi"] for p in batch),
                             "select": "id,doi,referenced_works", "per-page": 50, "api_key": key})
        for w in json.loads(raw).get("results", []):
            d = normalize_doi(w.get("doi"))
            if d in doi_to_id:
                oa_to_id[w["id"]] = doi_to_id[d]
                refs[doi_to_id[d]] = w.get("referenced_works", [])
        time.sleep(0.2)
    pairs = []
    for src, cited in refs.items():
        for oa in cited:
            if oa in oa_to_id and oa_to_id[oa] != src:
                pairs.append({"paper": src, "cites": oa_to_id[oa]})
    return pairs


# ---------------------------------------------------------------- assembly

def public_record(p: dict) -> dict:
    link = (f"https://doi.org/{p['doi']}" if p.get("doi") else
            f"https://arxiv.org/abs/{p['arxiv']}" if p.get("arxiv") else
            f"https://europepmc.org/article/MED/{p['pmid']}" if p.get("pmid") else "")
    rec = {k: p.get(k) for k in ("id", "title", "authors", "year", "venue", "doi", "arxiv", "source", "curated",
                                 "kb_id", "type", "practices", "modalities", "topics", "keywords")}
    rec["link"] = link
    rec = {k: v for k, v in rec.items() if v not in (None, "", [], False)}
    if p.get("summary"):
        rec["summary"] = p["summary"]
    if p.get("abstract") and license_is_open(p.get("license")):
        rec["abstract"] = p["abstract"]
        rec["license"] = p["license"]
    return rec


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed-only", action="store_true")
    ap.add_argument("--citations", action="store_true", help="fetch citation pairs from OpenAlex (needs OPENALEX_API_KEY)")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply every query cap (e.g. 0.1 for a quick test)")
    ap.add_argument("--min-year", type=int, default=1970)
    args = ap.parse_args()

    papers = seed_papers()
    print(f"seed: {len(papers)}")
    if not args.seed_only:
        cfg = yaml.safe_load((Path(__file__).parent / "queries.yaml").read_text(encoding="utf-8"))
        for q in cfg.get("europe_pmc", []):
            got = europe_pmc(q["query"], int(q["max"] * args.scale))
            print(f"europepmc/{q['name']}: {len(got)}")
            papers += got
        for q in cfg.get("arxiv", []):
            got = arxiv(q["query"], int(q["max"] * args.scale))
            print(f"arxiv/{q['name']}: {len(got)}")
            papers += got

    papers = dedupe(papers)
    papers = [p for p in papers if p.get("curated") or ((p.get("year") or 0) >= args.min_year and len(p.get("abstract", "")) > 200)]
    for p in papers:
        p["id"] = stable_id(p)
    print(f"after dedupe/filter: {len(papers)}")

    n = write_jsonl(DATA_DIR / "corpus.jsonl", papers)
    if args.citations:
        key = os.environ.get("OPENALEX_API_KEY")
        if not key:
            print("--citations needs OPENALEX_API_KEY; skipping", file=sys.stderr)
        else:
            pairs = openalex_citations(papers, key)
            write_jsonl(DATA_DIR / "citation_pairs.jsonl", pairs)
            print(f"citation pairs inside corpus: {len(pairs)}")

    public = [public_record(p) for p in papers]
    with_abs = sum(1 for p in public if "abstract" in p)
    SITE_DATA.mkdir(parents=True, exist_ok=True)
    (SITE_DATA / "corpus.json").write_text(json.dumps({
        "version": time.strftime("%Y-%m-%d"), "count": len(public), "with_open_abstract": with_abs,
        "papers": public}, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {n} papers to clm/data/corpus.jsonl; site/data/corpus.json has {with_abs} open abstracts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
