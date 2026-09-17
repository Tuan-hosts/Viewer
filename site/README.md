# K562 HiTrAC Viewer

Explore experimental contact maps and compare them with a distance and DNase baseline. The website is public and does not require a GitHub account.

## Using the viewer

1. Choose the bin width, window span, chromosome and region.
2. Choose a normalization for the middle map.
3. Adjust the minimum and maximum to see how clipping changes the map. These limits stay fixed when you switch views.
4. Drag to pan, scroll to zoom, or choose **500-kb detail**. All three maps move together.
5. Use **Copy view link** to share your exact settings, or **Export view PNG** to save the figure.

The left map shows the original **ln(1 + PET counts)**. The middle map shows the selected normalization and clipping. The right map shows the fitted baseline, in its original log-count units. The baseline is not normalized or logged again.

The 1-kb/4-Mb view contains 16 million cells and uses the most browser memory. Keep one Viewer tab open when working at that size. Data load only for the selected chromosome and bin width.

## Reading the correlations

Each score compares one observed map with the right-hand baseline. Scores use native bin values after the displayed clipping and color saturation, within the visible region. Mirrored pairs count once; the actual diagonal and supported zeros are included. Missing or nonfinite pairs are excluded, with the retained count shown.

With **No normalization** and matching display limits, the two scores are identical. Clipping can change Pearson because it changes the relative values. Zooming changes the pairs being compared. The original unclipped scores remain under **What is being compared?**

Normalization applies only to the middle map. In those modes, its correlation with the unnormalized baseline describes pattern similarity between different quantities; it is not a measure of normalized prediction accuracy. A clearer image or a higher displayed correlation does not establish better biological prediction.

## Five map settings

Write O for the observed PET count and E for its expected count. Methods 2–5 offer either ln(1 + O/E) or ln(O/E).

| Setting | Expected count |
| --- | --- |
| No normalization | No E is used. Display ln(1 + O). |
| Shared observed distance | Total raw PETs at each exact distance, divided by supported pair opportunities, including zeros. The same reference is used across windows. |
| Shuffled endpoints | Re-pair observed endpoints within each chromosome in ten rounds. Average and pool the distance histograms, then divide by supported pair opportunities. This per-pixel conversion adapts the cLoops2 distance-frequency calculation. |
| Local PLB | Move each endpoint by ±1 through ±5 bins. Average counts across unique eligible neighboring pairs, including zeros and actual diagonal counts. Exclude the central pair and reversed duplicates. Neighbors outside the window come from the same chromosome. |
| Within-window distance | Average raw counts over supported pairs in nearby distance groups within the complete selected window, using the cooltools grouping ratio 1.03. Zooming does not change this expectation. |

For local PLB, B is the sum of neighboring counts and n is the number of eligible neighbors. The unmodified expectation is B/n. The stabilized option is max(B,1)/n; the page reports how often that floor is used. If n = 0, E is undefined. This is a fixed-bin adaptation of the cLoops local-background idea, not the complete loop caller.

The within-window method is Akita-inspired. It does not reproduce Akita’s balancing, coarse-graining, interpolation, clipping or smoothing.

For ln(O/E), a zero observation with E > 0 gives −∞; a positive observation with E = 0 gives +∞; 0/0 is undefined. These values remain nonfinite and render white. They are not pushed into a finite clipping bin. For ln(1 + O/E), O = E gives ln(2), not zero.

## Data and baseline

The viewer contains **21,488 maps**: 1/2/5/10-kb bins and 1/2/4-Mb windows across chr1–22, X and Y. Windows start at the chromosome origin and do not overlap at a given span. Incomplete chromosome tails are excluded.

Raw integer counts are aggregated before transformation. The actual diagonal is retained. No ICE/KR, adaptive coarse-graining or map smoothing is applied. White is the minimum color; red is the maximum. Missing values also appear white and are reported separately.

ChrY lacks the verified reference-support mask, so its counts are retained but its maps cannot be scored. ChrM has no cis matrix in this source and no complete 1-Mb window. The mask describes reference availability, not a comprehensive mappability assessment.

The baseline combines a distance intercept with symmetric DNase adjustments at both endpoints. It was fitted on 128 windows outside chr3/chr4. The 1-Mb views reuse the corresponding 2-Mb coefficients. Other chromosomes include baseline fitting regions, so genome-wide scores are descriptive rather than a new held-out test. Shared normalization references use all chromosomes; PLB and within-window backgrounds use the observed map.

See the [validation report](VALIDATION_REPORT.md) for checks and limitations.

## Running a local copy

From the repository directory, run:

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory site
```

Then open http://127.0.0.1:8000. Opening index.html directly as a file will not load the chromosome packets.

## Sources

- [cLoops2 endpoint shuffling](https://github.com/YaqiangCao/cLoops2/blob/e7febf79ea7e5823c12f982bdb34497bab56b330/cLoops2/estDis.py)
- [Original cLoops local background](https://academic.oup.com/bioinformatics/article/36/3/666/5553098)
- [cooltools distance grouping](https://github.com/open2c/cooltools/blob/v0.7.1/cooltools/lib/numutils.py)
