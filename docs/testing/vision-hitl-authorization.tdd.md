# Vision HITL Authorization TDD Evidence

## Source

The behavior was derived from the migration roadmap's human-required Vision
gate. The obsolete live runner expected exactly six candidates, while the
current packet has twelve unresolved high-confidence candidates.

## User Journeys

- As a reviewer, I can prepare an exact list of unresolved candidates without
  changing SQL, Graph, approval, or dataset state.
- As a reviewer, I can execute only decisions that I explicitly recorded after
  checking each original image and final label.
- As an operator, I am protected from stale packets, substituted hashes,
  duplicate targets, label conflicts, rejected images, and accidental retries.

## Evidence

| Guarantee | Test or command | Result |
|---|---|---|
| Only unresolved priority-one high-confidence hashes enter the template | `tests/visionHitlAuthorization.test.js` | PASS |
| Packet contents are bound by a deterministic SHA-256 digest | `tests/visionHitlAuthorization.test.js` | PASS |
| Human authorization, reviewer, timestamp, image confirmation, label confirmation, and comment are mandatory | `tests/visionHitlAuthorization.test.js` | PASS |
| Changed labels, unknown hashes, duplicate hashes, conflicting approvals, and rejected hashes are blocked | `tests/visionHitlAuthorization.test.js` | PASS |
| Same-label prior approval is idempotent | `tests/visionHitlAuthorization.test.js` | PASS |
| Real latest packet resolves exactly twelve pending targets and performs no writes | `npm run vision:hitl:prepare` | PASS, `writesPerformed=false` |
| A pending template stops before Electron and any write | `npm run vision:hitl:approve -- --authorization <pending-json>` | Expected rejection |
| Common Agent state remains unchanged after the rejection | `npm run migration:gate-status` | PASS, total 22 and approved 11 |
| Electron registration, approval, Graph promotion, and lineage contract still work | `npm run test:electron:vision-approval` | PASS, console errors 0 |

## RED And GREEN

- RED: `node --test tests/visionHitlAuthorization.test.js` failed with
  `Cannot find module '../visionHitlAuthorization'`.
- GREEN: the same target passed 11/11 tests after implementation, including a
  forged-priority regression that verifies source and Vision agreement.
- Coverage: `node --test --experimental-test-coverage
  tests/visionHitlAuthorization.test.js` reported 100% lines, 82.95% branches,
  and 100% functions for `visionHitlAuthorization.js`; aggregate coverage was
  98.40% lines, 81.25% branches, and 96.30% functions.

## Remaining Human Gate

The generated twelve-target file intentionally remains pending. No target is
approved until a human reviews the originals and records the required fields.
After that approval, the existing approved-fixture sync, Vision benchmark,
Graph benchmark, and migration gate must all pass before legacy fallback is
disabled.
