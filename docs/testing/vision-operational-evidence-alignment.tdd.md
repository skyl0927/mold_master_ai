# Vision Operational Evidence Alignment TDD Evidence

Date: 2026-07-27

## Scope

This phase prevents a complete-looking Vision operational evidence bundle from
being approved when its central evidence is stale or placeholder-like.

The gate audits local benchmark/config hashes, pinned Common Agent dataset
export evidence, and a Graph snapshot URI that references the candidate
`graphVersion`. It is an operator safety gate only; it does not activate,
promote, roll back, or fine-tune any model automatically.

## RED Evidence

- Commit `12bbe50` added contract tests for
  `auditVisionOperationalEvidenceAlignment()`.
- `npm run test:contracts` failed at compile time because the audit export did
  not exist yet. This was the intended RED signal.

## GREEN Evidence

- `auditVisionOperationalEvidenceAlignment()` now returns
  `vision-operational-evidence-alignment/v1` with pass/fail checks and issues.
- Operator confirmation now fails closed when the evidence bundle is complete
  but the Graph snapshot does not reference the candidate Graph version.
- The release CLI embeds `evidenceAlignment` in the generated artifact and exits
  non-zero when alignment fails.
- Settings shows evidence alignment status and disables the operator
  confirmation button while alignment is failing.
- The Electron transition smoke asserts both the UI alignment message and the
  exported JSON alignment fields.

## Verification

- `npm run test:contracts`: 77 passed after service implementation.
- `npx --no-install tsc --noEmit --pretty false`: passed after UI/CLI wiring.
- `git diff --check`: passed with Windows CRLF conversion warnings only.
- `npm run build`: passed with stale Browserslist/Baseline data warnings.
- `npm run test:electron:transition`: passed. The smoke confirmed the Settings
  alignment message, `operationalEvidenceAlignment.passed = true`, matching
  candidate Graph evidence, confirmed operator decision, and zero console
  errors.
- `npm run eval:vision:release -- --baseline artifacts\multimodal-vision-strict-v2-baseline-20260724.json --candidate artifacts\multimodal-vision-candidate-v3-lean-20260724.json --config artifacts\vision-operational-release-config-20260724.json --output .tmp-tools\vision-operational-release-alignment-smoke.json`:
  returned the expected non-zero `hold_shadow` result because the legacy sample
  config lacks pinned Common Agent export and Graph snapshot evidence. The
  generated artifact includes `evidenceAlignment.passed = false` with
  `commonAgentDatasetExportPinned`, `graphSnapshotPinned`, and
  `graphSnapshotMatchesCandidateGraphVersion` issues.

## Development Feedback

Current development is past the local safety-architecture stage. The next risk
is not missing UI affordances, but untrusted operational evidence. This gate
closes the obvious stale Graph snapshot path before real Common Agent exports
and Graph snapshots are used for release review.
