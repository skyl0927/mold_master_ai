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

## Task Report

| Behavior | RED Evidence | GREEN Evidence | Guarantee |
|---|---|---|---|
| Mold can request Common Agent learning-ready Vision export | `npm run test:contracts` failed with `CommonAgentApiService.loadLearningReadyVisionExport is not a function` | `npm run test:contracts` passed with 40 tests | Mold sends `review_status=approved`, `learning_ready_only=true`, confidence thresholds, and limit to `/v1/datasets/images/export` |

## Validation Command

```powershell
npm run test:contracts
```

## Known Gaps

The method is available as a reusable service boundary. A later UI or script can
surface `capture_ready_count`, `excluded_counts`, split counts, and per-class
coverage to guide additional image capture.
