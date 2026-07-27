# Vision Approved Label Conflict Review Packet TDD Evidence

Date: 2026-07-27

## Scope

This phase packages approved Vision label conflicts into a human-only review
packet. It targets the current top operational blocker:
`resolve_label_conflicts`.

The packet is read-only and non-mutating. It does not update Common Agent,
SQL, Graph, reference stores, local review state, or model configuration.

## User Journey

As a quality reviewer, I want every approved-image label conflict summarized
with affected case IDs, candidate labels, and allowed decision options, so that
I can resolve the conflict without accidentally promoting bad labels into
Graph or reference learning.

## RED Evidence

- Commit `909a667` added
  `tests/visionApprovedLabelConflictReviewPacket.test.js` and registered it in
  `npm run test:contracts`.
- `node --test tests\visionApprovedLabelConflictReviewPacket.test.js` failed
  with `MODULE_NOT_FOUND` for `../visionApprovedLabelConflictReviewPacket`.
- This was the intended RED signal because no conflict review packet builder
  existed.

## GREEN Evidence

- `visionApprovedLabelConflictReviewPacket.js` now builds
  `vision-approved-label-conflict-review-packet/v1`.
- The packet can read conflicts from either
  `vision-operational-readiness-audit/v1` blockers or a post-HITL verification
  report.
- Each conflict has a stable `conflict-###` id, conflict type, affected case
  IDs, candidate labels, and explicit human decision options.
- The safety policy keeps automatic correction, Graph promotion, reference
  learning, and model training disabled.
- `npm run vision:label-conflicts:packet` writes the current local review
  packet as an artifact.

## Verification

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | Readiness audit conflicts become human-only review items | `npm run test:vision-label-conflicts` | Unit contract | PASS | `totalConflicts: 2`, `allowGraphPromotion: false` in fixture |
| 2 | Post-HITL preflight conflicts are accepted as fallback input | `npm run test:vision-label-conflicts` | Unit contract | PASS | Duplicate labels collapse to unique candidate labels |
| 3 | No-conflict input returns a clear packet while still disabling automatic correction | `npm run test:vision-label-conflicts` | Unit contract | PASS | `status: clear`, `automaticCorrectionAllowed: false` |
| 4 | Current local artifacts produce the expected blocker packet | `npm run vision:label-conflicts:packet -- --output .tmp-tests\vision-approved-label-conflict-review-packet.json` | CLI smoke | PASS | `status: action_required`, `totalConflicts: 4`, `firstLabels: 제팅/플로우마크` |

## Known Gaps

The packet does not resolve conflicts by itself. A reviewer still needs to
choose one of the allowed decisions for each group and apply that decision
through the existing HITL/Common Agent review flow before readiness can pass.
