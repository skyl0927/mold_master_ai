# Approved Vision Label Conflict Gate

## Source

The journey was derived from the live post-HITL verification run on 2026-07-24.

## User Journey

As a manufacturing knowledge reviewer, I want approved labels that contradict the
original Vision result to remain quarantined until explicitly reconciled, so that
incorrect labels cannot reduce Graph and Vision benchmark quality.

## Evidence

| Guarantee | Test | Type | Result |
|---|---|---|---|
| Korean flow-mark aliases map to one graph class | `tests/approvedVisionFixtureQuality.test.js` | Unit | PASS |
| An unreconciled approved/Vision label mismatch is quarantined | `tests/approvedVisionFixtureQuality.test.js` | Unit | PASS |
| An explicit human reconciliation permits an intentional override | `tests/approvedVisionFixtureQuality.test.js` | Unit | PASS |
| A semantic label conflict blocks legacy fallback retirement | `tests/migrationGateStatus.test.js` | Integration | PASS |

RED evidence:

- `node --test tests/approvedVisionFixtureQuality.test.js`
- Failed because `approved-vision-fixture-quality` did not exist.
- Commit: `405fac6`
- Gate integration failed with `conflictGroups` reported as `0`.
- Commit: `428ecca`

GREEN evidence:

- `node --test --experimental-test-coverage tests/approvedVisionFixtureQuality.test.js tests/migrationGateStatus.test.js tests/postHitlVerification.test.js tests/multimodalBenchmark.test.js tests/visionHitlAuthorization.test.js`
- All focused tests passed.
- Implementation commit: `017c590`

## Known Follow-Up

The live dataset still requires human resolution for the quarantined records and
the unresolved high-confidence review packet before final benchmarks may run.
