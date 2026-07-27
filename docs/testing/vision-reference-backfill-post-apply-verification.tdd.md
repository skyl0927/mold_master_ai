# Vision Reference Backfill Post-Apply Verification TDD Evidence

## Source Plan

Derived during this TDD run from the Vision AI hardening plan: approved backfill writes must not be trusted until the same images reappear in Common Agent's learning-ready export.

## User Journey

As a quality engineer, I want applied Vision reference backfill rows to be rechecked against Common Agent's learning-ready export, so that only verified human-approved observations can refresh the Vision reference store and influence GraphRAG diagnosis.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Applied backfill targets unlock reference refresh only after every target appears in learning-ready export | `tests/visionReferenceBackfillPostApplyVerification.test.js` | Unit | PASS | `node --test tests\visionReferenceBackfillPostApplyVerification.test.js` |
| 2 | Missing applied targets block the refresh gate | `tests/visionReferenceBackfillPostApplyVerification.test.js` | Unit | PASS | `applied_target_missing_from_learning_ready_export` blocker asserted |
| 3 | Lost capture protocol metadata blocks the refresh gate | `tests/visionReferenceBackfillPostApplyVerification.test.js` | Unit | PASS | `capture_protocol_not_learning_ready` blocker asserted |
| 4 | Defect label mismatch between approved write plan and export blocks the refresh gate | `tests/visionReferenceBackfillPostApplyVerification.test.js` | Unit | PASS | `defect_label_mismatch` blocker asserted |
| 5 | Dry-run apply reports cannot unlock reference refresh | `tests/visionReferenceBackfillPostApplyVerification.test.js` | Unit | PASS | `no_applied_backfill_targets` blocker asserted |

## RED/GREEN Evidence

RED:

```text
node --test tests\visionReferenceBackfillPostApplyVerification.test.js
Error: Cannot find module '../visionReferenceBackfillPostApplyVerification'
```

GREEN:

```text
node --test tests\visionReferenceBackfillPostApplyVerification.test.js
pass 5
fail 0
```

## Operational Command

```powershell
npm run vision:reference:backfill-verify -- --apply-report artifacts\vision-reference-backfill-apply-<timestamp>.json --require-ready
```

If `--apply-report` is omitted, the script uses the latest `artifacts/vision-reference-backfill-apply-*.json`. If `--export <json>` is omitted, it queries:

```text
<COMMON_AGENT_URL>/v1/datasets/images/export?review_status=approved&learning_ready_only=true&limit=500&include_raw=false
```

The verifier writes a local artifact only. It never performs Common Agent service writes.

## Known Gaps

This verifies Common Agent export readiness after backfill. It does not itself refresh the Vision reference store or run the full Vision/Graph benchmark gate; those remain explicit follow-up commands after this gate is `ready`.
