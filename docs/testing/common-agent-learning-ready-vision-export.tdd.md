# Common Agent Learning-Ready Vision Export TDD Evidence

Date: 2026-07-25

## Source Plan

Derived from the Mold Master AI / Common Agent integration plan: Mold Master
must read Common Agent's approved, capture-ready Vision dataset before closed-set
classifier training or release-gate validation.

## User Journey

As a Mold Master AI operator, I want the app to call Common Agent's strict
learning-ready Vision export, so that the app can verify data readiness before
trusting Vision + Graph diagnosis improvements.

As a Mold Master AI operator, I want the current Common Agent Vision reference
store status and manual refresh action in the dataset manager, so that I can see
whether DINOv2/SigLIP2 references are ready before relying on Graph diagnosis.

## Task Report

| Behavior | RED Evidence | GREEN Evidence | Guarantee |
|---|---|---|---|
| Mold can request Common Agent learning-ready Vision export | `npm run test:contracts` failed with `CommonAgentApiService.loadLearningReadyVisionExport is not a function` | `npm run test:contracts` passed with 40 tests | Mold sends `review_status=approved`, `learning_ready_only=true`, confidence thresholds, and limit to `/v1/datasets/images/export` |
| Mold can inspect and refresh the current Vision reference store | `npm run test:contracts` failed with missing `getCurrentVisionReferenceStatus` and `refreshVisionReferences` | `npm run test:contracts` passed with 45 tests | Mold calls `GET /v1/vision/classifier/references/current` and `POST /v1/vision/classifier/references/refresh`, preserving model lineage and reference counts |
| Dataset manager shows the reference store alongside approval quality data | Not applicable | `npm run test:electron:dataset-manager` passed with `referenceStatusVisible=true`, `failedRequests=[]`, and `consoleErrors=[]` | The Common Agent Vision tab displays the current store model/version/count and keeps the existing conflict-blocked approval flow intact |

## Validation Commands

```powershell
npm run test:contracts
npm run build
npm run test:electron:dataset-manager
```

## Known Gaps

The service and UI boundaries are ready. Real production accuracy still depends
on a live Common Agent server with enough approved multi-view manufacturing
images to refresh the DINOv2/SigLIP2 reference store and pass the benchmark gate.
