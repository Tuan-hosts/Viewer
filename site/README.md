# K562 contact-map Viewer

## Published-method normalization views

Both Explore maps and Compare predictions offer three published preprocessing
choices alongside the existing model targets. They build new arrays from the
canonical integer PET counts. Existing neural predictions and metrics are hidden
for these choices because those models were trained in other units. Raw reference
maps use their full original count range. Display bounds are native to each
representation and fixed during zooming; window filters and loops remain available.
Legacy links retain their original target selection on GitHub Pages.

| Choice | Exact implemented path | Scope |
| --- | --- | --- |
| Hi-Compass | Zero main/adjacent diagonals; chromosome-band p2/p99; upstream nonzero fallback; linear contrast stretch to 0–100 | `balance=False`; exports lack ICE/KR weights and include cis contacts only up to 4.1 Mb |
| Evo2HiC | Default raw-count target (`target_option=hic`), `mixed` transform; CLI denominator 10/max_reads 5000/eps 1e-5; dataset cap at 1 | Parameters editable and saved in links; no SCALE/KR or depth rescaling invented; diagonals retained |
| HiCFoundation | `log10(1+x)` / full-window log maximum; RGB `[1,1-q,1-q]`; ImageNet channel standardization available on hover | Encoder input, not a universal supervised target. Native viewer bins/windows retained; empty windows use explicit zero-intensity guard |

HiCFoundation provides its general fine-tuning/encoder path and inference presets:
loop calling caps counts at 1000; low-coverage enhancement caps at 100 and zeros
the main diagonal; high-coverage enhancement uses the observed maximum and zeros
the main diagonal; single-cell enhancement caps at 100 and retains the diagonal.
The high/low coverage path is chosen explicitly because the complete original
library coverage is not available in these exported packets. The source separately
loads `2d_target` for supervised fine-tuning, and total-count conditioning is
separate from pixel normalization.

Source versions: Evo2HiC `633c92de6dd6422ad3b44143bf890a2067f45060`,
HiCFoundation `c733ffa6a3de071ba4b3bf6afca6bc9a0c741910`.
`published-normalizations.json` records the source paths and scope. Reference
fixtures generated with the actual upstream Normalizer and convert_rgb functions
verify all transformed values and standardized RGB tensor channels. The original
metric, packet, loop and axis checks also pass.




## Local contrast-stretching preview

Two independent filters hide windows with no existing reconstructed-PET cLoops2
loops or no existing DNase p95 intervals. A loop counts when both anchor
intervals overlap the full genomic window (half-open coordinates). The DNase
filter uses the original provisional 100-bp signal intervals, not new peak calls.
The options affect navigation, not the source packets, and persist in shared links.

**Hi-Compass-style contrast stretch** displays linear raw PET counts on a 0–100
scale. The raw reference uses chromosome-wide 2nd/99th-percentile bounds
(2nd/98th is also selectable) for supported pairs in the (0, 2.5-Mb] distance
band. Supported zeros count toward percentiles. The main and adjacent diagonals
are visually cleared. A degenerate sparse interval uses positive-contact
percentiles, then zero-to-maximum, matching the current Hi-Compass fallback
sequence. The packets contain raw counts without ICE/KR weights, so this is a
display adaptation, not Hi-Compass's complete balanced preprocessing pipeline.
Fallback positive contacts are restricted to the contacts present in the viewer
packets, rather than unseen long-range chromosome contacts.

Optional comparison-panel stretching uses a common scale for all matching-unit
panels: raw models are mapped back from log1p using expm1 and share the raw PET
bounds; normalized models share percentile bounds from the full observed target
window in saved target units. This does not reconstruct raw counts from clipped
normalized predictions. Explore's raw-log baseline retains the raw PET scale.
Bounds do not change when zooming. Original comparison metrics and signal-track
profiles remain in saved target units; no training targets are changed.

Generate the directly openable HTML with:

```sh
python3 scripts/build_viewer_features.py
python3 scripts/build_local_viewer.py /absolute/path/HiTrAC_local_viewer.html
```

The single-file HTML embeds the interface, worker and indices. On-demand matrix
and annotation packets still load from the original public URLs and retain
integrity checks. Open the HTML directly in a current Chrome, Edge, Firefox or
Safari browser. It starts at the supplied chr3 12–13-Mb view with both filters,
loop outlines and contrast stretching enabled. Internet access is required.

The Viewer shows genome-wide K562 HiTrAC observations and the completed capacity-study predictions for 32 matched 4-Mb regions on chr3 and chr4, their 64 two-Mb halves, and 128 one-Mb quarters. Four bin widths and six training targets give 72 model settings and 5,376 prediction windows.

## Explore or compare

**Explore maps** shows observations across all chromosomes, with the original distance + DNase log-count baseline. **Compare predictions** restricts the browser to the fitting regions and offers the six trained targets. It adds the fourth map and a baseline fitted to the same target.

In **Explore maps** and **Compare predictions**, **Show loops** overlays cLoops2 calls from the Meiyuan-style K562 PET reconstruction. Purple anchor outlines follow genomic coordinates through zoom and bin-width changes on every panel, including the overfit prediction. Only verified reconstructed-PET loop packets are loaded. While processing is incomplete, the control reports that loops are being prepared. The original published-loop option has been removed, including selection through historical links. Processing provenance is retained in `site/loops-reprocessed/manifest.json` and `site/meta/published-loops.json`.

Signed maps use blue below zero, white at zero and red above zero. Each side scales to its selected limit, and the legend marks zero even for asymmetric limits. Supported negative infinity in ln(O/E) uses the lower color bound, while unsupported or NaN cells stay white. These rendering choices do not alter the underlying targets, predictions or metrics.

## Four maps

1. **Observed · raw:** the original `ln(1 + PET counts)` reference.
2. **Observed · training target:** the exact saved, clipped label used by the selected model. In Explore mode this panel shows the selected transformation of the observed map.
3. **Distance + DNase baseline:** in Compare mode, an endpoint spline/ridge model fitted to the same target, fitting windows, and support mask as the neural model. In Explore mode, the historical raw-log baseline is shown and labeled accordingly.
4. **Overfit prediction:** the saved native-resolution model prediction. No prediction is supplied outside the fitting regions or for an untrained transform.

Choose **Compare predictions**, then select the bin width, window span, region and training target. Explore mode keeps the original normalization controls; its optional **Fitting regions only** filter marks the regions used by the study. Clipping limits remain fixed when changing selections; **Use training bounds** restores that model's bounds. Drag or zoom any map to move all four views together.

## Targets

| Settings | Transformation | Training bounds |
|---|---|---|
| 1–12 | `ln(1 + O)` | 0 to 1 |
| 13–24 | `ln(1 + O)` | 0 to 2 |
| 25–36 | Shared observed-distance `ln(O/E)` | −5 to 5 |
| 37–48 | Shuffled-endpoint `ln(O/E)` | −10 to 10 |
| 49–60 | Stabilized local PLB `ln(O/E)` | −5 to 5 |
| 61–72 | Within-window distance `ln(O/E)` | −5 to 5 |

Within each group, bins run 1, 2, 5 and 10 kb at 1 Mb, then 2 Mb, then 4 Mb. Raw counts were aggregated before transformation. The original diagonal and supported zero counts are retained. No ICE/KR, contact-map smoothing, adaptive coarse-graining or resizing of labels is applied.

The shared observed-distance expectation uses pooled raw counts divided by supported pair opportunities, including zeros. The shuffled expectation uses ten within-chromosome endpoint permutations, pooled distance histograms, and a per-pixel opportunity conversion. This map adaptation differs from the local background used to call loops.

The dense local PLB adaptation shifts each bin anchor by −5…−1 and +1…+5 bins. It averages unique eligible neighboring unordered pairs, excludes the central pair, includes zeros and the real diagonal, and uses chromosome halos at window edges. Its stabilized expectation is `max(B, 1) / n`. It follows the local-comparison idea of cLoops; it is not the complete loop caller.

The within-window expectation uses raw-count means grouped over nearby distances within the complete source window. It is Akita-inspired, without Akita's full preprocessing. Expectations are not recomputed when zooming. These references are descriptive and include inspected chromosomes.

For normalized training labels, an observed zero with positive expectation becomes the model's lower-bound label. Zero or unavailable expectations are masked, including undefined 0/0. Complete endpoint DNase coverage is also required for comparison. The saved labels preserve these choices even if the display bounds are widened later.

## Metrics

For all eligible unique bin pairs in the visible region, clip the prediction and saved training target to the same selected bounds `[L, U]`. The displayed MSE is `mean((clipped_prediction − clipped_target)^2) / (U − L)^2`. RMSE is its square root. Pearson correlation uses the same clipped pairs. Symmetric pairs count once, including the diagonal; partially visible edge bins count. Constant arrays or fewer than two comparable pairs give an undefined correlation.

The target-matched baseline is clipped and scored identically. Raw-reference colors do not enter these metrics. A raw-log baseline shown beside a different transformation is not reported as target-matched prediction accuracy.

These are fitting-set comparisons. Training and evaluation used the same windows, with 100 epochs per model. They measure memorization, not generalization or biological reproducibility. The original optimizer used ordinary masked MSE of unclipped model output against clipped labels; display metrics do not change that training objective. Smaller range-normalized MSE alone does not rank different target definitions fairly.

## Data delivery and verification

The interface and genome-wide observations are served by GitHub Pages. Prediction packets live on the repository's `capacity-data-20260923` branch and are requested from a pinned commit only when a window is selected. Float32 byte-plane encoding and gzip are lossless. No predicted values are quantized, resized or smoothed. Files are checked against SHA-256 hashes before use. Packets contain the saved target, prediction and common support; the baseline is reconstructed from verified coefficients and endpoint features.

Prediction downloads, lossless decoding, baseline reconstruction and metrics run in a background worker. Obsolete selections are cancelled, metric requests are coalesced, and the chromosome cache is limited to two packets. A failed or timed-out download shows a Retry button. Large native maps still require more browser memory than coarse maps; memory depends on the selected geometry.

The bulk training checkpoints and original server exports remain unchanged. The public packets contain map arrays, endpoint baseline features, and provenance hashes; they do not contain credentials, DNA sequence files or private server paths.

Sources: [cLoops local background](https://academic.oup.com/bioinformatics/article/36/3/666/5553098), [pinned cLoops2 distance shuffling](https://github.com/YaqiangCao/cLoops2/blob/e7febf79ea7e5823c12f982bdb34497bab56b330/cLoops2/estDis.py), [cooltools distance grouping](https://github.com/open2c/cooltools/blob/v0.7.1/cooltools/lib/numutils.py).


## Signal tracks

Training bounds are enabled by default. DNase uses ln(1 + mean K562.bw signal). Tracks follow the horizontal map axis. Detailed signal, profile, clipping and cLoops2 definitions are stored in [viewer-methods.json](meta/viewer-methods.json); verification receipts are in the same metadata folder. These links are not part of the visible Viewer interface.
