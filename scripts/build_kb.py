#!/usr/bin/env python3
"""Validate knowledge/*.yaml and compile it for the site and the README.

    python scripts/build_kb.py            # validate, write site/data/kb.json, update README lists
    python scripts/build_kb.py --check    # validate and fail if generated files are out of date (CI)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
KB = ROOT / "knowledge"
OUT = ROOT / "site" / "data" / "kb.json"
README = ROOT / "README.md"

SECTIONS = {
    "papers": ("papers.yaml", ["id", "title", "authors", "year", "venue", "type", "summary"]),
    "datasets": ("datasets.yaml", ["id", "name", "modality", "description", "access"]),
    "tools": ("tools.yaml", ["id", "name", "category", "description", "url"]),
    "databases": ("databases.yaml", ["id", "name", "kind", "auth", "url"]),
    "organizations": ("organizations.yaml", ["id", "name", "kind", "focus", "url"]),
    "concepts": ("concepts.yaml", ["id", "name", "definition"]),
}

PAPER_TYPES = {"empirical", "review", "meta-analysis", "theory", "methods", "dataset", "tool"}
DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")


def load() -> dict:
    data = {}
    for key, (fname, _) in SECTIONS.items():
        with open(KB / fname, encoding="utf-8") as f:
            data[key] = yaml.safe_load(f)[key] or []
    return data


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    for key, (_, required) in SECTIONS.items():
        seen = set()
        for i, item in enumerate(data[key]):
            where = f"{key}[{i}] ({item.get('id', '?')})"
            for field in required:
                if item.get(field) in (None, "", []):
                    errors.append(f"{where}: missing '{field}'")
            if item.get("id") in seen:
                errors.append(f"{where}: duplicate id")
            seen.add(item.get("id"))

    paper_ids = {p["id"] for p in data["papers"]}
    for p in data["papers"]:
        if not (p.get("doi") or p.get("arxiv") or p.get("url")):
            errors.append(f"papers ({p['id']}): needs doi, arxiv or url")
        if p.get("doi") and not DOI_RE.match(str(p["doi"])):
            errors.append(f"papers ({p['id']}): malformed DOI {p['doi']}")
        if p.get("type") not in PAPER_TYPES:
            errors.append(f"papers ({p['id']}): unknown type {p.get('type')}")
        if not isinstance(p.get("verified"), bool):
            errors.append(f"papers ({p['id']}): 'verified' must be true or false")

    for key in ("datasets", "tools"):
        for item in data[key]:
            if item.get("paper") and item["paper"] not in paper_ids:
                errors.append(f"{key} ({item['id']}): unknown paper '{item['paper']}'")
    for c in data["concepts"]:
        for pid in c.get("papers", []):
            if pid not in paper_ids:
                errors.append(f"concepts ({c['id']}): unknown paper '{pid}'")
    return errors


def paper_link(p: dict) -> str:
    if p.get("doi"):
        return f"https://doi.org/{p['doi']}"
    if p.get("arxiv"):
        return f"https://arxiv.org/abs/{p['arxiv']}"
    return p.get("url", "")


def compile_json(data: dict) -> str:
    out = dict(data)
    for p in out["papers"]:
        p["link"] = paper_link(p)
        p["summary"] = " ".join(str(p["summary"]).split())
    for key in ("datasets", "tools", "concepts"):
        for item in out[key]:
            for field in ("description", "definition"):
                if field in item:
                    item[field] = " ".join(str(item[field]).split())
    out["counts"] = {k: len(v) for k, v in data.items() if isinstance(v, list)}
    return json.dumps(out, ensure_ascii=False, indent=1) + "\n"


def flat(s) -> str:
    return " ".join(str(s).split())


def by_name(items: list[dict], key: str = "name") -> list[dict]:
    return sorted(items, key=lambda x: str(x[key]).casefold())


def link(name: str, url: str | None) -> str:
    return f"[{name}]({url})" if url else name


def tool_entry(t: dict) -> str:
    lang = f" *({t['language']})*" if t.get("language") else ""
    return f"- {link(t['name'], t['url'])} — {flat(t['description'])}{lang}"


def db_entry(d: dict) -> str:
    auth = {"none": "no key", "free-key": "free key", "account": "account"}.get(d["auth"], d["auth"])
    notes = flat(d.get("notes", ""))
    return f"- {link(d['name'], d['url'])}" + (f" — {notes}" if notes else "") + f" *({auth})*"


def paper_entry(p: dict) -> str:
    mark = "" if p["verified"] else " ¹"
    return f"- [{flat(p['title'])}]({paper_link(p)}) — {flat(p['authors'])}, *{flat(p['venue'])}* ({p['year']}){mark}"


def short_cite(p: dict) -> str:
    surname = str(p["authors"]).split()[0].rstrip(",")
    if surname.lower() == "see":           # authors not yet filled in ("See DOI")
        surname = "paper"
    return f"[{surname} {p['year']}]({paper_link(p)})"


# Tool categories and how analysis tools split by modality.
def tool_groups(tools: list[dict]) -> list[tuple[str, list[dict]]]:
    def analysis_kind(t: dict) -> str:
        mods = set(t.get("modality", []))
        if mods & {"fMRI", "sMRI", "DWI"}:
            return "mri"
        if mods <= {"physiology", "ECG", "EDA", "respiration"}:
            return "physiology"
        return "ephys"

    pick = lambda pred: by_name([t for t in tools if pred(t)])
    return [
        ("Electrophysiology (EEG and MEG) analysis",
         pick(lambda t: t["category"] == "analysis" and analysis_kind(t) == "ephys")),
        ("Neuroimaging (MRI) analysis", pick(lambda t: t["category"] == "analysis" and analysis_kind(t) == "mri")),
        ("Peripheral physiology", pick(lambda t: t["category"] == "analysis" and analysis_kind(t) == "physiology")),
        ("Real-time, neurofeedback and hardware", pick(lambda t: t["category"] in ("real-time", "hardware"))),
        ("Machine learning and EEG foundation models", pick(lambda t: t["category"] == "machine-learning")),
        ("Meta-analysis", pick(lambda t: t["category"] == "meta-analysis")),
        ("Text mining and paper embeddings", pick(lambda t: t["category"] == "text-embedding")),
    ]


def md_lists(data: dict) -> str:
    L = ["<!-- KB:START (generated by scripts/build_kb.py, do not edit by hand) -->", ""]
    papers = data["papers"]
    pid = {p["id"]: p for p in papers}
    newest = lambda ps: sorted(ps, key=lambda p: (-int(p["year"]), str(p["title"]).casefold()))

    # ---- Open data
    L += ["## Open data", "", "### Meditation and contemplative practice datasets", ""]
    for d in by_name(data["datasets"]):
        meta = ", ".join(d["modality"]) + " · " + str(d["access"])
        L.append(f"- {link(d['name'], d.get('url'))} — {flat(d['description'])} *({meta})*")
    L += ["", "### Data archives", ""]
    L += [db_entry(d) for d in by_name([d for d in data["databases"] if d["kind"] == "data-archive"])]

    # ---- Open code
    L += ["", "## Open code", ""]
    used = set()
    for title, group in tool_groups(data["tools"]):
        if not group:
            continue
        L += [f"### {title}", ""] + [tool_entry(t) for t in group] + [""]
        used |= {t["id"] for t in group}

    # ---- Literature search
    L += ["## Literature search and meta-analysis databases", ""]
    L += [db_entry(d) for d in by_name([d for d in data["databases"] if d["kind"] != "data-archive"])]

    # ---- Standards and reproducibility
    L += ["", "## Data standards and reproducibility", ""]
    L += [tool_entry(t) for t in by_name([t for t in data["tools"] if t["category"] == "standards"])]
    used |= {t["id"] for t in data["tools"] if t["category"] == "standards"}
    L += [paper_entry(p) for p in newest([p for p in papers if p["type"] == "methods"])]
    leftover = [t for t in data["tools"] if t["id"] not in used]
    if leftover:                            # a new category nobody mapped yet: still list it
        L += ["", "## Other tools", ""] + [tool_entry(t) for t in by_name(leftover)]

    # ---- Reading list
    L += ["", "## Reading list", "",
          "Newest first. ¹ Identifier not yet confirmed against Crossref; checked automatically in CI.", ""]
    for title, types in [("Reviews and meta-analyses", {"review", "meta-analysis"}),
                         ("Theory and frameworks", {"theory"}),
                         ("Empirical studies", {"empirical"}),
                         ("Dataset and software papers", {"dataset", "tool"})]:
        L += [f"### {title}", ""] + [paper_entry(p) for p in newest([p for p in papers if p["type"] in types])] + [""]

    # ---- Concepts
    L += ["## Key concepts", ""]
    for c in data["concepts"]:
        refs = [short_cite(pid[x]) for x in c.get("papers", []) if x in pid]
        see = f" See {', '.join(refs)}." if refs else ""
        L.append(f"- **{c['name']}** — {flat(c['definition'])}{see}")

    # ---- Organizations
    L += ["", "## Organizations and communities", ""]
    for title, kinds in [("Labs and research centres", {"lab", "centre"}),
                         ("Consortia and societies", {"consortium", "society"}),
                         ("Funding", {"funder"})]:
        group = by_name([o for o in data["organizations"] if o["kind"] in kinds])
        L += [f"### {title}", ""] + [f"- {link(o['name'], o['url'])} — {flat(o['focus'])}" for o in group] + [""]
    other = [o for o in data["organizations"] if o["kind"] not in {"lab", "centre", "consortium", "society", "funder"}]
    if other:
        L += ["### Other", ""] + [f"- {link(o['name'], o['url'])} — {flat(o['focus'])}" for o in by_name(other)] + [""]

    L += ["<!-- KB:END -->"]
    return "\n".join(L)


def anchor(heading: str) -> str:
    return re.sub(r"[^\w\- ]", "", heading.strip().lower()).replace(" ", "-")


def md_toc(text: str) -> str:
    lines, fenced = [], False
    for line in text.splitlines():
        if line.startswith("```"):
            fenced = not fenced
        m = None if fenced else re.match(r"^(##|###) (.+)$", line)
        if m and m.group(2).strip() != "Contents":
            indent = "  " if m.group(1) == "###" else ""
            lines.append(f"{indent}- [{m.group(2).strip()}](#{anchor(m.group(2))})")
    return "\n".join(["<!-- TOC:START (generated) -->", ""] + lines + ["", "<!-- TOC:END -->"])


def render_readme(data: dict) -> str:
    text = README.read_text(encoding="utf-8")
    kb = re.compile(r"<!-- KB:START.*?<!-- KB:END -->", re.S)
    toc = re.compile(r"<!-- TOC:START.*?<!-- TOC:END -->", re.S)
    if not kb.search(text) or not toc.search(text):
        raise SystemExit("README.md is missing the KB:START/KB:END or TOC:START/TOC:END markers")
    text = kb.sub(lambda _: md_lists(data), text)
    return toc.sub(lambda _: md_toc(text), text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if generated files are stale")
    args = ap.parse_args()

    data = load()
    errors = validate(data)
    if errors:
        print("Validation failed:\n  " + "\n  ".join(errors))
        return 1

    new_json, new_readme = compile_json(load()), render_readme(data)
    if args.check:
        stale = []
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != new_json:
            stale.append(str(OUT.relative_to(ROOT)))
        if README.read_text(encoding="utf-8") != new_readme:
            stale.append("README.md")
        if stale:
            print("Out of date, run `python scripts/build_kb.py`: " + ", ".join(stale))
            return 1
        print("Knowledge base valid and generated files up to date.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(new_json, encoding="utf-8")
    README.write_text(new_readme, encoding="utf-8")
    counts = {k: len(v) for k, v in data.items()}
    print(f"Wrote {OUT.relative_to(ROOT)} and README lists: {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
