#!/usr/bin/env python3
"""Report broken URLs in knowledge/*.yaml (HEAD, falling back to GET). Report-only by default."""
from __future__ import annotations

import concurrent.futures as cf
import sys
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "Mozilla/5.0 (link-check; contemplative-neuroscience)"}


def urls():
    for f in sorted((ROOT / "knowledge").glob("*.yaml")):
        data = yaml.safe_load(f.read_text(encoding="utf-8"))
        for items in data.values():
            for item in items:
                for key in ("url", "api"):
                    if item.get(key):
                        yield f.name, item["id"], item[key]


def check(u: str) -> int | str:
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(u, method=method, headers=UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status
        except Exception as e:  # noqa: BLE001
            err = getattr(e, "code", None) or type(e).__name__
    return err


def main() -> int:
    items = list(urls())
    bad = []
    with cf.ThreadPoolExecutor(8) as ex:
        for (fname, iid, u), status in zip(items, ex.map(lambda t: check(t[2]), items)):
            if not (isinstance(status, int) and status < 400):
                bad.append(f"{fname}:{iid} -> {u} [{status}]")
    print(f"Checked {len(items)} links, {len(bad)} problems.")
    for b in bad:
        print("  " + b)
    return 1 if bad and "--strict" in sys.argv else 0


if __name__ == "__main__":
    sys.exit(main())
