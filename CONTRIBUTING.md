# Contributing

Additions and corrections are welcome. Everything in the interface comes from the YAML files in
[`knowledge/`](knowledge), so most contributions are a small edit there.

## Add a paper

Append an entry to `knowledge/papers.yaml`:

```yaml
- id: surname-2025-keyword          # unique, lowercase
  title: "Exact published title"
  authors: "Surname A, et al."
  year: 2025
  venue: Journal name
  doi: 10.xxxx/xxxxx                 # or arxiv: "2501.01234", or url:
  verified: false                    # CI checks the DOI against Crossref and flips this
  type: empirical                    # empirical | review | meta-analysis | theory | methods | dataset | tool
  practices: [focused-attention]     # see the header of papers.yaml for the vocabulary
  modalities: [EEG]
  topics: [mind-wandering, theta]
  summary: >
    One or two sentences in your own words. Do not paste the abstract.
```

Then run:

```bash
pip install pyyaml
python scripts/build_kb.py        # validates, regenerates site/data/kb.json and the README lists
```

Commit the YAML change together with the regenerated files. CI fails if they are out of sync.

## Add a dataset, tool, database, lab or concept

Same pattern in the matching file. Link datasets and tools to a paper with `paper: <paper-id>`.

## Standards

- Prefer primary sources and peer-reviewed work; mark preprints as such in `venue`.
- Summaries describe what a study did and found, including null results and limits.
- Keep claims proportional to the evidence. Small, cross-sectional or single-case studies
  should say so.

## Code

```bash
pytest -q clm/tests                       # Python
node --test tests/search-core.test.mjs    # JavaScript
python tests/ui_test.py                   # end-to-end UI test (needs Playwright + Chrome)
```
