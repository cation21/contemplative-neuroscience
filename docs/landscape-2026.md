# Contemplative neuroscience in 2026: tools, data and open problems

A short orientation, written November 2026. Each item links to an entry in the knowledge base
or to its source.

## Where the field is moving

**From "does meditation change the brain?" to rigorous, specific claims.** The largest
controlled MBSR trial to date (two pooled RCTs, n = 218, with an active control) found no
MBSR-specific structural change after eight weeks ([Kral et al., 2022](https://doi.org/10.1126/sciadv.abk3316)).
Earlier small studies reporting gray-matter growth are now read with that in mind.

**Pooling data.** ENIGMA-Meditation (2025) is the first worldwide consortium for harmonised
meta- and mega-analysis of meditation neuroimaging ([Ganesan et al.](https://doi.org/10.1016/j.bpsc.2024.10.015)).
A preregistered 2026 whole-brain meta-analysis compares focused attention, open monitoring,
mantra and loving-kindness across 34 fMRI studies ([NBR 2026](https://doi.org/10.1016/j.neubiorev.2026.106709)).
Neurosynth Compose (2026) makes custom, reproducible coordinate meta-analyses possible in the
browser ([Kent et al.](https://doi.org/10.1162/IMAG.a.1114)).

**Advanced meditation and neurophenomenology.** Intensive case studies of adept practitioners
now pair 7T fMRI, EEG and structured experience ratings: jhana absorption states
([Yang et al., 2024](https://doi.org/10.1093/cercor/bhad408)) and cessation events, where
experience briefly stops and alpha power falls in the preceding ~40 s
([Chowdhury et al., 2023](https://doi.org/10.1016/j.neuropsychologia.2023.108694)). The
obvious next step is moving from n = 1 to small groups and preregistered replications.

**Causal tools.** Reviews now argue for combining non-invasive brain stimulation with
meditation to test mechanisms rather than correlates ([Abellaneda-Pérez et al., 2024](https://doi.org/10.1016/j.neubiorev.2024.105862)).
Closed-loop neurofeedback-guided meditation is an active line too.

**Computational models.** Active-inference and predictive-processing accounts give testable
models of meta-awareness and attentional control ([Sandved-Smith et al., 2021](https://doi.org/10.1093/nc/niab018);
[Laukkonen & Slagter, 2021](https://doi.org/10.1016/j.neubiorev.2021.06.021)).

## EEG methods worth using now

- **Separate aperiodic from periodic activity** before claiming band-power changes.
  specparam (formerly FOOOF) 2.0 is in release-candidate stage and adds time-resolved and
  event-related fitting ([docs](https://specparam-tools.github.io/changelog.html)).
- **Complexity and multivariate methods** are increasingly used, with caveats, as surveyed in
  [Lin, Atad & Zanesco (2025)](https://doi.org/10.1016/j.bpsc.2024.09.012).
- **Machine learning** on meditation EEG: gradient boosting with feature-importance analysis
  ([Aviad et al., 2024](https://doi.org/10.1016/j.bpsgos.2024.100423)) and, increasingly,
  pretrained EEG foundation models.

## Machine learning infrastructure

- **EEG foundation models** (LaBraM, CBraMod, REVE and others) are now compared on shared
  benchmarks such as [EEG-FM-Bench](https://arxiv.org/abs/2508.17742). For small meditation
  datasets, fine-tuning a pretrained model is usually a better start than training from scratch.
- **EEGDash** (2026) streams 700+ public BIDS EEG/MEG datasets from OpenNeuro and NEMAR into
  PyTorch and braindecode ([arXiv:2606.16041](https://arxiv.org/abs/2606.16041)).
- **L-FAME** (NeurIPS 2026 Datasets & Benchmarks) is the first sizeable longitudinal
  meditation EEG benchmark: 74 participants, pre/post six weeks of training, with state,
  technique and cross-session tasks ([arXiv:2605.22893](https://arxiv.org/abs/2605.22893)).
- **Real-time**: MNE-LSL (JOSS 2025) brings Lab Streaming Layer into MNE-Python for
  neurofeedback ([doi](https://doi.org/10.21105/joss.08088)).

## Literature infrastructure changes

- **OpenAlex** has required a free API key since 13 February 2026, with a daily free usage
  allowance; keyless use is limited to a small demo quota. The CC0 bulk snapshot is unaffected
  ([OpenAlex docs](https://developers.openalex.org/api-reference/authentication)).
- **Europe PMC** remains keyless and returns abstracts and licence information, which is why
  this repository uses it for live search and corpus building.
- **SPECTER2** has community ONNX exports, so a citation-trained scientific encoder can
  run in the browser, at the cost of a larger download than MiniLM.

## Open problems this repository can help with

1. A meditation-specific benchmark for literature retrieval (does a domain-tuned encoder beat
   general ones?). See [`clm/`](../clm).
2. Re-analysing open meditation EEG with aperiodic-aware methods to see which classic
   band-power findings survive.
3. Cross-dataset generalisation: does a meditation-state decoder trained on one dataset
   (e.g. L-FAME) transfer to another (e.g. the Delorme experience-sampling set)?
