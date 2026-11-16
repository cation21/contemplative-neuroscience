import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from clm.common import dedupe, license_is_open, normalize_doi, paper_text, reconstruct_abstract, stable_id  # noqa: E402
from clm.metrics import rank_of_target, retrieval_report  # noqa: E402
from clm.pairs import abstract_halves, build_pairs, split_ids  # noqa: E402


def test_paper_text_matches_js_format():
    assert paper_text("  A  title ", " body\n text ") == "A title. body text"
    assert paper_text("Only title", None) == "Only title"


def test_licences():
    for ok in ["cc by", "CC-BY-4.0", "cc0", "CC BY-SA", "Creative Commons Attribution 4.0"]:
        assert license_is_open(ok), ok
    for bad in [None, "", "cc by-nc", "CC BY-NC-ND 4.0", "cc-by-nd", "publisher-specific"]:
        assert not license_is_open(bad), bad


def test_doi_and_dedupe():
    assert normalize_doi("https://doi.org/10.1/ABC") == "10.1/abc"
    papers = dedupe([
        {"title": "Gamma", "doi": "10.1/x", "abstract": ""},
        {"title": "Gamma.", "doi": "https://doi.org/10.1/X", "abstract": "filled"},
        {"title": "No DOI paper"}, {"title": "no doi  paper!"},
    ])
    assert len(papers) == 2
    assert papers[0]["abstract"] == "filled"
    assert stable_id(papers[0]) == stable_id({"doi": "10.1/x"})


def test_inverted_index():
    assert reconstruct_abstract({"b": [1], "a": [0, 2]}) == "a b a"


def test_split_is_disjoint_and_deterministic():
    ids = [f"p{i}" for i in range(50)]
    tr, te = split_ids(ids, 0.2)
    assert not tr & te and len(te) == 10
    assert split_ids(ids, 0.2) == (tr, te)


def test_pairs_respect_split():
    abs4 = "One. Two. Three. Four."
    papers = [{"id": f"p{i}", "title": f"T{i}", "abstract": abs4} for i in range(4)]
    cites = [{"paper": "p0", "cites": "p1"}, {"paper": "p0", "cites": "p3"}]
    pairs = build_pairs(papers, cites, allowed={"p0", "p1", "p2"})
    kinds = [k for *_, k in pairs]
    assert kinds.count("title-abstract") == 3 and kinds.count("halves") == 3
    assert kinds.count("citation") == 1  # p3 is held out
    assert abstract_halves(abs4) == ("One. Two.", "Three. Four.")


def test_metrics():
    q = np.eye(3, dtype=np.float32)
    d = np.array([[1, 0, 0], [0, 0, 1], [0, 1, 0]], dtype=np.float32)
    ranks = rank_of_target(q, d, np.array([0, 2, 1]))
    assert ranks.tolist() == [1, 1, 1]
    rep = retrieval_report(np.array([1, 2, 10]))
    assert rep["recall@1"] == 1 / 3 and abs(rep["mrr"] - (1 + 0.5 + 0.1) / 3) < 1e-9


def test_knowledge_base_is_valid_and_built():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "build_kb.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    kb = json.loads((ROOT / "site" / "data" / "kb.json").read_text(encoding="utf-8"))
    assert kb["counts"]["papers"] == len(kb["papers"]) > 50
