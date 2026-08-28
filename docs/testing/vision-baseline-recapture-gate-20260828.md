# Vision Baseline and Recapture Gate - 2026-08-28

## Runtime Baseline

The approved Vision benchmark was rerun after the Common Agent runtime
attestation contract was repaired. The second run completed all 14 cases with
no container restart or transport failure.

| Metric | Result |
| --- | ---: |
| HTTP success | 100% |
| Vision contract compliance | 100% |
| Graph grounded | 100% |
| Runtime attestation | ready |
| Top-1 / Top-3 accuracy | 0% / 0% |
| Capture protocol ready | 0% |
| Unclassified / mismatched | 4 / 10 |
| Mean / P95 latency | 33.2 s / 41.3 s |

Report: `artifacts/goal-review-20260828/multimodal-vision-benchmark-after-runtime-contract.json`

The earlier 0% report is not a valid model baseline because Common Agent was
being rebuilt during that run and 12/14 requests failed at transport level.

## Visual Audit

| Benchmark case | Expected label | Evidence finding | Gate action |
| --- | --- | --- | --- |
| `approved-image-ddd3da916cce` | weld line | Small annotated web image; red circles dominate the defect cue. | Obtain an unannotated full part, convergence close-up, and normal reference. |
| `approved-image-71c5838a88a0` | jetting | Raised repeated pattern can be read as intentional geometry or jetting. | Add full context, gate context, and a normal reference. |
| `approved-image-59bec59e84dc` | jetting | Glossy wave pattern is visible but its relation to the gate is absent. | Add full context and gate-to-defect flow path. |
| `approved-image-0484c656265b` | void | Multiple internal bubbles are visible in a transparent sample. | Add full context and a same-light normal reference before approval reuse. |
| `approved-image-c2bacc82d3cc` | sink | A depression-like region is highlighted by a red circle in one view. | Add raw unannotated, oblique-light, and reverse-geometry views. |
| `approved-image-4d238bb8a9b7` | flash | A local edge/boss anomaly is small relative to the full frame. | Use its same-slide pair only as provisional context; add an edge profile. |
| `approved-image-d6582eda4f47` | flash | Wide part context does not isolate thin excess resin. | Pair with the close-up provisionally; add parting-line and edge profile views. |
| `approved-image-6ed00c53f0ee` | flash | Edge excess is visible but flash versus chipping remains ambiguous. | Add side profile and a clean parting-line comparison. |
| `approved-image-1a90cbbdd9d6` | short shot | A small notch near an opening may be functional geometry. | Use its same-slide pair provisionally; add fill-end and normal reference views. |
| `approved-image-287a816430b5` | short shot | The opening edge has a small bright projection rather than a clear fill front. | Add full part, fill-end context, and a normal reference. |
| `approved-image-0f49e07ea1f9` | ejection | Rough surface/residue is visible, but ejection causality is not visible. | Add ejector location and release-sequence evidence. |
| `approved-image-b00ca4a30e10` | whitening | Subtle light/gloss variation is visible on a wide part view. | Use its same-slide pair provisionally; add oblique light and ejector context. |
| `approved-image-80520cd398d6` | whitening | A localized light patch is visible but glare/contamination is plausible. | Add matched oblique/diffuse lighting and ejector context. |
| `approved-image-248911741b7a` | weld line | A horizontal line is visible inside a red annotation ellipse. | Obtain the unannotated source, convergence context, and normal reference. |

## Work Orders

The governed capture plan merges benchmark deficiencies with the four explicit
pending HITL recapture requests:

- 11 work orders
- 15 unique recapture targets
- 4 explicitly reviewed HITL recapture targets
- 4 additional approved samples required for class coverage

Plan: `artifacts/goal-review-20260828/vision-capture-work-order-plan-after-runtime-contract.json`

## Safety State

- No dataset, Graph, reference-learning, or model-training write was performed.
- Three same-slide `FIG-001/002` pairs are only provisional multiview candidates:
  whitening slide 3, short-shot slide 5, and flash slide 7.
- They must be evaluated through a no-write multiview endpoint before any HITL
  decision or reference promotion.
- Current Common Agent `persist_mode` has no no-write option, so multiview shadow
  reevaluation remains blocked until that API contract is available.
