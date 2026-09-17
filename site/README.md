# Viewer — live normalization and clipping comparison

Open the private GitHub Pages link in current Chrome or Edge and sign in with a GitHub account that has access to Tuan-hosts/Viewer. Chromosome packets load on demand from this same private site and are checked against their SHA-256 hashes. No GPU, analytics, external data API or data upload is used. A downloaded copy requires a localhost web server; opening this genome-wide build directly as a file is not supported.

## Three maps

1. **Observed · raw reference:** original ln(1 + PET counts), kept as a reference.
2. **Observed · processed:** the selected normalization, followed by finite-value clipping.
3. **Baseline · log scale:** the frozen distance + endpoint-DNase prediction in its original ln(1 + PET counts) units. It is never divided by an expectation, inverse-transformed or logged again. Display clipping and the numerical color scale are shared with panel 2.

Choose a chromosome/window, choose the normalization, then move the clipping minimum and maximum. Clipping limits stay fixed across normalization, log formulation, PLB rule, window, bin width and span changes. They are saved in browser storage and restored on reopening; explicit bounds in a shared view link take priority. If browser storage is unavailable, the view link still retains the limits. Only editing the limits or clicking Remove clipping changes them. These bounds modify the compared values, so the after-processing PCC is recalculated. Changing bin width, source-window span, zoom or pan updates the scored pairs. The raw reference score follows its own display maximum. Both scores account for color saturation as well as clipping; affine rescaling alone does not change Pearson. The main label states the bin width, source-window span and exact visible bin coordinates. “Remove clipping” includes the full finite range of both comparison maps. No training target or clipping threshold is selected by this viewer.

## Pearson correlation

The two main cards show:

- **Raw reference vs baseline · displayed:** corr(clip(ln(1 + O), 0, raw maximum), displayed B). The right-hand baseline uses the same displayed values in both comparisons.
- **Processed observed vs baseline · displayed:** corr(displayed T(O), displayed B). Both apply the chosen clipping bounds, then saturation at the comparison color-scale limits. T(O) is the selected observed transformation; B always remains the original signed log-map prediction. Normalization affects the observation only. When normalized modes are selected, this compares different representations: it describes the displayed patterns, not a like-for-like model accuracy score.

Both use the native bins intersecting the current visible viewport, with one contribution per common supported unique unordered pair, including actual diagonal counts and observed zeros when visible. Mirrored cells never double-count a contact. Partially visible edge bins are included; the label reports their exact bin boundaries. Before and after metrics follow the same visible domain. Returning to Full window restores the full-window score. Only jointly finite transformed values enter the processed comparison; infinities/undefined values are excluded before clipping, never moved to finite edge bins. Literal log ratios exclude zero observations, but finite zero or negative baseline predictions remain eligible. The retained pair count is shown. PCC is undefined for constant maps or fewer than two finite pairs. “What is being compared?” retains both original and selected-transformation unclipped PCCs and excluded-pair counts. No normalization with matching observed display bounds gives matching main scores. A score can change after nonlinear clipping, even if relatively few pairs are affected.

The live calculation uses native Float32 map values after clipping and color saturation, before color quantization, not sampled screen pixels. Pearson is invariant to the positive affine scaling of these values into continuous white-to-red intensities. Zoom selects the scored pairs without recomputing normalization backgrounds. Thus the visible region can be smaller than the labeled source window. PLB and within-window expectations use the observed map; no expectation is applied to the baseline. Normalized-mode correlation is a descriptive cross-representation comparison. Different transformations and clipping bounds change the question being measured; an increased PCC alone does not establish improved learning.

## Data and backgrounds

There are **21,488 window maps** across chr1–22, X and Y: 1/2/5/10-kb bins and 1/2/4-Mb spans. At each bin width there are 5,372 complete chromosome-origin coordinate windows. Chromosome tails shorter than the selected span are excluded. These windows do not cover every possible cross-window pair. ChrY has raw counts but lacks the verified reference-support mask: its maps are explicitly unavailable for scoring, not treated as measured zeros. ChrM has no cis matrix in this source and no complete 1-Mb window. The other 23 chromosomes account for 21,092 maps.

Raw counts are aggregated before transformation. Actual diagonal counts and supported zeros are retained. Support is the existing reference-availability mask, not a complete mappability assessment. No ICE/KR, adaptive coarse-graining, interpolation or contact-map smoothing is applied. The published package contains 96 compressed chromosome/resolution packets rather than duplicating overlapping windows. Each packet includes enough neighboring counts for the PLB halo.

1. **No normalization:** ln(1 + O).
2. **Shared observed distance:** raw PET sum / supported pair opportunities, including zeros, at each exact separation. All-chromosome descriptive reference, not the historical mean-log prediction baseline.
3. **Shuffled endpoints:** ten chromosome-local endpoint-shuffling rounds, pooled distance histograms averaged over rounds, divided by supported pair opportunities. This per-pixel conversion is our map adaptation of cLoops2 estDis.
4. **Dense local PLB adaptation:** shift each endpoint by −5…−1/+1…+5 whole bins. Average unique eligible unordered nearby pairs, including zeros and actual within-bin counts; exclude the central pair, reversed duplicates, unsupported and out-of-chromosome combinations. Chromosome halos extend beyond the displayed window. E = B/n or max(B,1)/n; n = 0 is undefined. This fixed-bin adaptation follows the local-comparison idea, not the complete cLoops loop caller.
5. **Within-window distance:** raw-count means in cooltools nearby-distance groups (ratio 1.03), calculated over the complete window; zoom does not change E. Akita-inspired without its complete balancing/coarse-graining/interpolation/clipping/smoothing pipeline.

Methods 2–5 offer ln(1 + O/E) and literal ln(O/E). Positive O with E = 0 gives +∞; O = E = 0 is undefined; O = 0 with E > 0 gives −∞ in the literal formulation. Nonfinite cells render white and are separately counted. White-to-red color scales are explicitly labeled.

## Frozen baseline

B = distance intercept + fitted symmetric DNase-endpoint adjustment. The spline/ridge model was fitted outside chr3/chr4; its exact source, fitting counts and coefficients remain in extension.js. The 1-Mb views reuse the corresponding frozen 2-Mb model without refitting. Normalization neither retrains nor transforms this model. Newly displayed chromosomes include baseline fitting regions; their correlations are descriptive, not newly held-out validation. The old chr3/chr4 comparisons retain the same data and coefficients. B is already its fitted prediction of ln(1 + PET counts). DNase coverage can further restrict its available pairs. Original signed baseline values remain available on hover and in the explicitly labeled unclipped metric in the details.

## Verification and exports

See [the genome-wide validation report](VALIDATION_REPORT.md). All 21,488 map summaries and 96 packet checksums passed. All 2,712 existing chr3/chr4 maps retain exact counts, support and Float32 DNase features. Source checks include a fresh raw .hic query on each chromosome, coarse-count conservation and actual diagonal preservation. The numerical checks cover 2,976 method/formulation cases and 1,440 independently enumerated PLB neighborhoods. Browser/controller checks cover asynchronous switching, preserved clipping, undefined scores, zoom and displayed-value PCC.

Download current settings to retain the chosen window, bounds, normalization, viewport and numerical correlations. Export view PNG captures all three panels. Copy view link retains the same settings. The unclipped metric remains available under “What is being compared?”; normalizing only the observation produces a descriptive cross-representation correlation.

## Private sharing

The deployment is a private GitHub Pages project site owned by **Tuan-hosts**, not a public Pages site. Viewers sign in with GitHub and need read access to the private repository. Copying the link does not grant access. No new collaborators were invited by this release. Do not make the repository or Pages site public to share it. The workflow refuses deployment if either visibility check fails.

The original personal repository and historical data remain preserved. This release does not change training, fitted coefficients or normalization reference curves.

Sources: [cLoops2 estDis](https://github.com/YaqiangCao/cLoops2/blob/e7febf79ea7e5823c12f982bdb34497bab56b330/cLoops2/estDis.py), [original cLoops PLB](https://academic.oup.com/bioinformatics/article/36/3/666/5553098), [cooltools distance grouping](https://github.com/open2c/cooltools/blob/v0.7.1/cooltools/lib/numutils.py).
