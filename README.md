# K562 HiTrAC Viewer

An interactive viewer for K562 contact maps, normalization and a distance/DNase baseline.

[Open the viewer](https://tuan-hosts.github.io/Viewer/) · [User guide](site/README.md) · [Validation](site/VALIDATION_REPORT.md)

The website and repository are public. No account is needed.

**21,488 maps** cover 1/2/5/10-kb bins and 1/2/4-Mb windows across the nuclear chromosomes. ChrY is marked unavailable for scoring because its reference-support mask is missing; chrM has no usable matrix.

## Run locally

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open http://127.0.0.1:8000 in Chrome or Edge.

## Source files

- `app-v2.js`: controls, linked views and exports.
- `genome.js`: chromosome downloads, integrity checks and window extraction.
- `normalization.js`: expected counts and log transformations.
- `comparison.js`: baseline predictions and Pearson calculations in a background worker.
- `heatmap-v2.js`: map rendering.
- `core.js`: count lookup, clipping summaries and shared helpers.
- `data/`: compressed chromosome counts and endpoint features.

Map calculations use the original counts and fitted baseline coefficients. Changes to wording and source formatting do not change their results. Deployment verifies the site against `FILE_MANIFEST.json`.
