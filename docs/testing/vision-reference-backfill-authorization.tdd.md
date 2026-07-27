# Vision Reference Backfill Authorization TDD Evidence

## Source

Derived from the active migration goal: continue improving Mold Master AI Vision diagnosis and Common Agent reference learning without allowing unreviewed Vision outputs to train GraphRAG.

## User Journey

As an engineer reviewing Common Agent Vision data, I want reference backfill targets to be bound to a digest and explicitly authorized by a human, so that legacy approved images cannot be silently promoted into the Vision reference store.

## RED Evidence

Command:

```powershell
node --test tests/visionReferenceBackfillAuthorization.test.js
```

Result:

```text
Error: Cannot find module '../visionReferenceBackfillAuthorization'
fail 1
```

The new test referenced the missing authorization module before implementation.

## GREEN Evidence

Commands:

```powershell
npm run test:vision-reference-backfill-authorization
npm run test:vision-reference-backfill-plan
npm run test:migration-gate-status
npm run vision:reference:backfill-prepare
```

Results:

```text
test:vision-reference-backfill-authorization: pass 4
test:vision-reference-backfill-plan: pass 3
test:migration-gate-status: pass 10
vision:reference:backfill-prepare: totalTargets 19, writesPerformed false
```

## Guarantees

| # | Guarantee | Test or command | Result |
|---|-----------|-----------------|--------|
| 1 | Backfill authorization templates are digest-bound and pending by default | `tests/visionReferenceBackfillAuthorization.test.js` | PASS |
| 2 | Validation requires human confirmations for product image, visible defect, label, v2 observation, and capture protocol | `tests/visionReferenceBackfillAuthorization.test.js` | PASS |
| 3 | Validation emits only a dry-run write plan and records `serviceWritesPerformed: false` | `tests/visionReferenceBackfillAuthorization.test.js` | PASS |
| 4 | Stale digests, forged image IDs, label mismatches, and unsupported view tags are rejected | `tests/visionReferenceBackfillAuthorization.test.js` | PASS |
| 5 | Live artifact generation creates a pending authorization template from the current backfill plan | `npm run vision:reference:backfill-prepare` | PASS |

## Known Gap

This change intentionally does not write to Common Agent. A future live apply step must consume only a validated write plan and should remain explicit, audited, and reversible.
