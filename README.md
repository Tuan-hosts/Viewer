# K562 HiTrAC Viewer

[Open the Viewer](https://tuan-hosts.github.io/Viewer/) · [Methods](site/README.md) · [Verification](site/capacity/validation.json)

The website is public. No account is needed.

- **Explore maps:** browse 21,488 observed maps across nuclear chromosomes at 1, 2, 5 and 10 kb, with 1-, 2- and 4-Mb windows.
- **Compare predictions:** view the saved training target, a target-matched distance + DNase baseline, and the neural overfit prediction alongside the raw observation. There are 72 settings and 5,376 fitting-window predictions on chr3 and chr4.

Training bounds are selected automatically by default. Editing a limit switches to custom bounds. The comparison metrics use identical clipping bounds for both maps. MSE is divided by the squared range. The overfit results measure memorization of the fitting regions, not held-out prediction.

DNase tracks use the matched K562.bw, displayed as ln(1 + mean signal). Raw PET-end coverage is shown in ends per kb. Separate panel profiles compare the displayed target, baseline and prediction on matched scales. All tracks follow the horizontal genomic axis.

Detailed definitions and source notes are retained in `site/meta/viewer-methods.json`, outside the visible interface. The binned endpoint track is not exact cLoops2 RPM; the source .hic does not retain basewise PET coordinates.

## Run locally

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory site
```

Open http://127.0.0.1:8000 in a current Chrome, Edge or Firefox browser. Prediction packets are downloaded from the pinned public data commit when selected; an internet connection is required.

## Source files

- `site/viewer-v3.js`: controls, linked views, rendering and exports.
- `site/viewer-worker.js`: map calculations and metrics off the main browser thread.
- `site/capacity-packet.js`: checked, lossless prediction decoding in the worker.
- `site/capacity-math.js`: native-bin clipping, MSE, RMSE, Pearson and baseline evaluation.
- `site/genome.js`: chromosome downloads, integrity checks and window extraction.
- `site/comparison.js`: original normalization and exploratory baseline calculations.
- `site/capacity/`: prediction catalog, pinned data source and verification receipt.
- `site/data/`: genome-wide count packets and endpoint features.

Lossless prediction packets are stored separately on the `capacity-data-20260923` branch, keeping the Pages site small. The interface downloads only the selected window and checks its SHA-256 hash. Deployment verifies every site file against `FILE_MANIFEST.json`.

ChrY remains unavailable for scoring because its reference-support mask is missing. ChrM has no usable matrix. Existing observations and normalization references were preserved.

Prediction decoding and metrics run in a background worker. Changing the selection cancels obsolete work; repeated zoom or clipping changes keep only the latest pending calculation. The browser retains at most two decoded chromosome packets and one prepared window. Failed downloads can be retried. `node scripts/test_viewer.cjs` checks native metric calculations and packet validation before each deployment.
