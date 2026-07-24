# Post-HITL Verification TDD Evidence

## Scope

This work implements the migration roadmap step after human image review:
approved fixture synchronization, safe preflight, Vision benchmark, approved
Graph benchmark, and final fallback-retirement gate.

## Guarantees

| Guarantee | Evidence | Result |
|---|---|---|
| Unresolved high-confidence HITL blocks `canDisableLegacyFallback` even when benchmark scores pass | `tests/migrationGateStatus.test.js` | PASS |
| Dataset failure, offline services, fewer than 20 clean samples, approved-label conflicts, and unresolved HITL block benchmark execution | `tests/postHitlVerification.test.js` | PASS |
| Stale benchmark failures do not block rerunning after approved fixtures are refreshed | `tests/postHitlVerification.test.js` | PASS |
| Final success requires Vision, approved Graph, and migration gates together | `tests/postHitlVerification.test.js` | PASS |
| Conflict hash, image IDs, and labels remain in the actionable report | `tests/migrationGateStatus.test.js`, `tests/postHitlVerification.test.js` | PASS |
| Missing reports and missing preflight data fail closed | `tests/postHitlVerification.test.js` | PASS |
| Current live state skips model benchmarks and persistent service writes | `npm run migration:verify-post-hitl` | PASS |

## RED And GREEN

- RED 1: a passing benchmark returned `canDisableLegacyFallback=true` with one
  unresolved high-confidence HITL hash.
- GREEN 1: the gate now requires `unresolvedHighConfidence === 0`.
- RED 2: `tests/postHitlVerification.test.js` failed because
  `postHitlVerification.js` did not exist.
- GREEN 2: preflight and final report contracts passed.
- RED 3: approved conflict lineage was absent from the gate and preflight.
- GREEN 3: content hash, case IDs, and labels are preserved.

Coverage command:

```powershell
node --test --experimental-test-coverage tests/postHitlVerification.test.js tests/migrationGateStatus.test.js
```

Result: 11/11 tests passed, 100% lines, 87.20% branches, and 100% functions
across `migrationGateStatus.js` and `postHitlVerification.js`.

## Live Preflight Evidence

The current report is `waiting_for_human_hitl` with:

- clean approved samples: 8/20
- additional samples required: 12
- unresolved high-confidence hashes: 12
- approved-label conflict groups: 1
- benchmarks executed: false
- persistent service writes performed: false

The conflicting records are `image-6ed00c53f0ee` (`표면 결함`) and
`image-84d73acb3435` (`플래시`) for the same SHA-256 image.
