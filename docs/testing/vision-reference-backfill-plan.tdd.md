# Vision Reference Backfill Plan TDD Evidence

## Source

Derived from the active migration goal: improve Mold Master AI Vision diagnosis by making Common Agent Vision reference learning safe, explainable, and HITL-gated.

## User Journey

As an engineer operating Mold Master AI, I want approved legacy Vision images to be classified into safe reference candidates, HITL backfill targets, or blocked rows, so that incorrect Vision observations do not poison GraphRAG learning.

## RED Evidence

Command:

```powershell
node --test tests/visionReferenceBackfillPlan.test.js
```

Result:

```text
Error: Cannot find module '../visionReferenceBackfillPlan'
fail 1
```

The new test referenced the missing backfill planning module before production code existed.

## GREEN Evidence

Commands:

```powershell
npm run test:vision-reference-backfill-plan
npm run test:migration-gate-status
npm run test:vision-reference-gate
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

Results:

```text
test:vision-reference-backfill-plan: pass 3
test:migration-gate-status: pass 10
test:vision-reference-gate: pass 7
test:contracts: pass 48
typecheck: pass
build: pass
```

Build produced only existing Browserslist/baseline freshness warnings.

## Guarantees

| # | Guarantee | Test or command | Result |
|---|-----------|-----------------|--------|
| 1 | Approved v2 physical-product multi-view rows become reference candidates without allowing service writes | `tests/visionReferenceBackfillPlan.test.js` | PASS |
| 2 | Approved legacy v1 rows become HITL backfill targets with dry-run review payloads | `tests/visionReferenceBackfillPlan.test.js` | PASS |
| 3 | Label conflicts and non-physical images are blocked from reference learning | `tests/visionReferenceBackfillPlan.test.js` | PASS |
| 4 | Migration gate surfaces Vision reference backfill counts and reasons | `tests/migrationGateStatus.test.js` | PASS |
| 5 | Existing Vision reference operational gate behavior is unchanged | `tests/visionReferenceOperationalGate.test.js` | PASS |

## Live Probe

Command:

```powershell
$env:COMMON_AGENT_URL='http://127.0.0.1:8011'; npm run vision:reference:backfill-plan
```

Result:

```text
total: 19
eligibleReferenceCandidates: 0
needsHitlBackfill: 19
blocked: 0
serviceWritesPerformed: false
```

All current approved Common Agent Vision rows need HITL backfill because they are legacy observations without capture session/view protocol metadata.
