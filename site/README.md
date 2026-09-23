# K562 contact-map Viewer

The Viewer shows genome-wide K562 HiTrAC observations and the completed capacity-study predictions for 32 matched 4-Mb regions on chr3 and chr4, their 64 two-Mb halves, and 128 one-Mb quarters. Four bin widths and six training targets give 72 model settings and 5,376 prediction windows.

## Explore or compare

**Explore maps** shows observations across all chromosomes, with the original distance + DNase log-count baseline. **Compare predictions** restricts the browser to the fitting regions and offers the six trained targets. It adds the fourth map and a baseline fitted to the same target.

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

The bulk training checkpoints and original server exports remain unchanged. The public packets contain map arrays, endpoint baseline features, and provenance hashes; they do not contain credentials, DNA sequence files or private server paths.

Sources: [cLoops local background](https://academic.oup.com/bioinformatics/article/36/3/666/5553098), [pinned cLoops2 distance shuffling](https://github.com/YaqiangCao/cLoops2/blob/e7febf79ea7e5823c12f982bdb34497bab56b330/cLoops2/estDis.py), [cooltools distance grouping](https://github.com/open2c/cooltools/blob/v0.7.1/cooltools/lib/numutils.py).
