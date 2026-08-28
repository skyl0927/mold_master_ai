# Vision Label Conflict Review - 2026-08-28

## Result

Four approved-label conflicts were reviewed against original image bytes,
fixture metadata, and the Common Agent dataset. The review was explicitly
operator-authorized and is recorded as AI-assisted rather than impersonating a
human reviewer.

| Conflict | Decision | Evidence |
| --- | --- | --- |
| `conflict-001` | Keep `제팅` | Fixture SHA-256 matched the downloaded original; the dominant free-jet snake pattern is visible. The duplicate `플로우마크` fixture was recovered into the manifest and quarantined. |
| `conflict-002` | Request recapture | A single frontal image cannot distinguish depth-related sink from whitening or illumination. Oblique light and side profile are required. |
| `conflict-003` | Request recapture | Both Common Agent metadata and file endpoints returned 404. No visual evidence remains to distinguish ejector-pin mark from scratch. |
| `conflict-004` | Keep `플래시` | Fixture SHA-256 matched the original; thin irregular excess resin extends beyond the product edge. |

## Apply Evidence

- Decision packet: `artifacts/goal-review-20260828/vision-approved-label-conflict-decisions-reviewed.json`
- Verification: `ready_for_manual_import`, 4/4 accepted, 0 invalid
- Dry run: 5 planned case updates, 0 invalid targets
- Apply: 5/5 local fixture updates, 4 resolved quality issues, no service writes
- Rollback backup: `backups/vision-approved-before-label-conflict-apply-20260828-194753`
- Post-apply migration gate: `approved.conflictGroups=0`

## Safety State

- `제팅` and `플래시` remain active but Graph/reference/model promotion stays governed by later release gates.
- The duplicate `플로우마크` record is `needs_review`.
- `수축/백화` and `밀핀 자국/표면 긁힘` records are `needs_review` with explicit recapture requirements.
- Common Agent SQL/Graph was not changed during this step.

## Verification

- `npm run test:vision-label-conflicts`: PASS, 16/16
- `npm run test:vision-fixture-quality`: PASS, 6/6
- `npm run eval:vision:approved:validate`: PASS, 14/14 runnable
- `scripts/build-migration-gate-status.js`: Common Agent and QA online; approved label conflicts 0
