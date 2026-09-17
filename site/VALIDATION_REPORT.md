# Genome-wide Viewer validation — 17 September 2026

This release extends the existing K562 Viewer to all nuclear chromosomes without refitting its baseline or changing its observed counts, normalization definitions or clipping semantics.

## Coverage

- 24 nuclear chromosome choices: chr1–22, X and Y.
- 21,488 maps: four bin widths (1, 2, 5, 10 kb) and three spans (1, 2, 4 Mb).
- All complete, chromosome-origin windows; incomplete chromosome tails are excluded.
- 21,092 maps have a chromosome reference mask; chrY's 396 maps retain raw counts but are explicitly unavailable for scoring because verified reference support is missing.
- ChrM has no cis matrix in this .hic source and no complete 1-Mb window.

## Data and numerical checks — passed

- Source bindings verified; fresh observed/NONE/BP/1000 .hic queries match cached counts on one window per chromosome. No ICE/KR values were used.
- All 96 compressed packets pass SHA-256, length, canonical-pair and gzip round-trip checks.
- Every one of the 21,488 window summaries matches independently enumerated counts, support, PET mass and actual diagonal counts.
- Coarse-bin aggregation conserves PET mass at 1/2/5/10 kb, including newly within-bin pairs on the coarse diagonal.
- All 2,712 earlier chr3/chr4 maps retain exact counts, support and Float32 endpoint-DNase features.
- 2,976 normalization/formulation cases across all chromosomes and geometries pass finite/nonfinite accounting, positive-cell renderer/metric parity and unchanged-baseline checks.
- 1,440 PLB neighborhoods match a separate direct enumeration, including chromosome/window boundaries, unsupported neighbors, central-pair exclusion, unordered duplicates and actual diagonal counts.
- In raw mode with matched display limits, the two main displayed PCCs agree exactly.

## Interface checks — passed

Real-worker controller tests cover eight representative windows, all five normalizations, both logarithmic formulations, both PLB rules, sticky clipping, zoom, rapid chromosome switching and stale-reply rejection. They include centromeric/missing-support regions, chrY and 1-kb/4-Mb maps. Interactive browser inspection verifies the three rendered maps, new chromosome selection, local PLB, matched-display PCC and linked zoom.

A stale-correlation bug during lazy PLB calculation was found and corrected: previous correlation data are now invalidated immediately when the method changes. Exports are disabled until current calculations finish. The existing nonpositive saved-zoom guard was strengthened.

At chr4:108–110 Mb, 1-kb bins and all three display limits [0,2], both displayed PCCs remain 0.80536. The original unclipped PCC remains 0.86373. These values intentionally answer different questions.

## Meaning and limits

The baseline stays in its original signed natural-log map units and is never divided by an expectation or logged again. Display clipping changes the compared values; it does not modify stored raw counts or fitted coefficients. In normalized modes, the processed-observation/baseline PCC compares different representations and is descriptive, not normalized prediction accuracy. Newly added chromosomes include baseline fitting regions; this is not a new held-out validation campaign.

PLB and window expectations depend on the observation. Undefined or infinite values are excluded from PCC and rendered white, never forced into finite clipping bins. Supported zeros and the actual diagonal remain included wherever finite. The reference-availability mask is not a comprehensive mappability mask. Overview rendering samples native cells without smoothing; zoom in to inspect individual cells.

These checks establish the listed numerical and interaction properties, not freedom from every possible browser, device or data issue. No biological model was retrained, no training target was selected, and no unrelated server process was signaled or modified. The export used one low-priority CPU thread and completed.

## Private deployment

The org repository and GitHub Pages site are configured private. The workflow checks both before uploading a deployment artifact and verifies every published file against the reviewed manifest. Access requires GitHub sign-in and read access to Tuan-hosts/Viewer; copying a link does not grant access. No new collaborators were invited by this release.

Machine-readable checks: [numerical](GENOME_NUMERICAL_QA.json), [interactions](GENOME_INTERACTION_QA.json).
