# Common Agent Learning-Ready Vision Export TDD Evidence

Date: 2026-07-25
Updated: 2026-07-27

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

As a release owner, I want one command that refreshes the Common Agent Vision
reference store, benchmarks it, and writes an artifact, so that shadow gate
evidence is repeatable after the external server comes online.

## Task Report

| Behavior | RED Evidence | GREEN Evidence | Guarantee |
|---|---|---|---|
| Mold can request Common Agent learning-ready Vision export | `npm run test:contracts` failed with `CommonAgentApiService.loadLearningReadyVisionExport is not a function` | `npm run test:contracts` passed with 40 tests | Mold sends `review_status=approved`, `learning_ready_only=true`, confidence thresholds, and limit to `/v1/datasets/images/export` |
| Mold can inspect and refresh the current Vision reference store | `npm run test:contracts` failed with missing `getCurrentVisionReferenceStatus` and `refreshVisionReferences` | `npm run test:contracts` passed with 45 tests | Mold calls `GET /v1/vision/classifier/references/current` and `POST /v1/vision/classifier/references/refresh`, preserving model lineage and reference counts |
| Dataset manager shows the reference store alongside approval quality data | Not applicable | `npm run test:electron:dataset-manager` passed with `referenceStatusVisible=true`, `failedRequests=[]`, and `consoleErrors=[]` | The Common Agent Vision tab displays the current store model/version/count and keeps the existing conflict-blocked approval flow intact |
| Operational Vision reference gate creates repeatable server evidence | `npm run test:vision-reference-gate` failed with missing `visionReferenceOperationalGate` module | `npm run test:vision-reference-gate` passed with 6 tests | The runner performs `current -> refresh -> current -> benchmark-current`, blocks missing/prototype/failed benchmark states, and writes an artifact without claiming readiness on connection failure |
| Migration gate requires the Vision reference gate before fallback retirement | `npm run test:migration-gate-status` failed with `Cannot read properties of undefined (reading 'readyForGraphRetrieval')` | `npm run test:migration-gate-status` passed with 8 tests | The migration status now reads `artifacts/vision-reference-operational-gate.json`; missing or blocked reference evidence prevents `canDisableLegacyFallback` and surfaces a Reference Store action |
| Reference API 404 is separated from network/store failures | `npm run test:vision-reference-gate` failed because 404 was still `reference_store_invalid` | `npm run test:vision-reference-gate` passed with 7 tests | A running but outdated Common Agent now reports `reference_api_missing` / `reference_refresh_api_missing` and recommends upgrade or restart with the Vision reference endpoints |
| Migration gate preserves the reference gate recovery action | `npm run test:migration-gate-status` failed because `visionReference.recommendedAction` was undefined | `npm run test:migration-gate-status` passed with 9 tests | The top-level migration report now preserves the operational gate's exact upgrade/restart action instead of replacing it with a generic refresh instruction |

## Validation Commands

```powershell
npm run test:contracts
npm run test:vision-reference-gate
npm run test:migration-gate-status
npm run build
npm run test:electron:dataset-manager
```

External server smoke attempted on 2026-07-27:

```powershell
$env:COMMON_AGENT_URL='http://218.151.133.137:5011'
$env:VISION_REFERENCE_GATE_OUTPUT='artifacts\vision-reference-operational-gate-external-smoke.json'
$env:VISION_REFERENCE_REFRESH='false'
npm run vision:reference:gate
```

Result: blocked as expected because the external server was unreachable from
this PC. The artifact records
`GET http://218.151.133.137:5011/v1/vision/classifier/references/current: fetch failed`.

Local server smoke on 2026-07-27:

```powershell
npm run vision:reference:gate
```

Result: blocked because the local Common Agent process responded with 404 for
`/v1/vision/classifier/references/current` and
`/v1/vision/classifier/references/refresh`. The artifact classifies this as
`reference_api_missing`, meaning the running server must be upgraded or
restarted with the latest Vision reference API code before model accuracy can be
measured.

## Known Gaps

The service and UI boundaries are ready. Real production accuracy still depends
on a live Common Agent server with enough approved multi-view manufacturing
images to refresh the DINOv2/SigLIP2 reference store and pass the benchmark gate.
The migration gate intentionally keeps legacy fallback enabled when the
reference gate artifact is missing or blocked.
