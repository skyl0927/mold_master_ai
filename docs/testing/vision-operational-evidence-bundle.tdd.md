# Vision Operational Evidence Bundle TDD Evidence

Date: 2026-07-27

## Scope

This phase connects the Vision operational decision card to the concrete
evidence used for release review: baseline benchmark artifact, candidate
benchmark artifact, release config, Common Agent dataset evidence, and approved
Graph snapshot evidence.

Operator confirmation is now blocked until the card has a complete evidence
bundle. The feature still does not promote, activate, or roll back a model by
itself.

## RED Evidence

- Commit `6b5fb55` added failing contract tests for `evidenceBundle` on the
  release report, decision card, and operator decision.
- `npm run test:contracts` failed with 5 targeted failures because evidence was
  missing and incomplete evidence still allowed operator confirmation.

## GREEN Evidence

- `normalizeVisionOperationalEvidenceBundle()` canonicalizes evidence items,
  deduplicates by kind/URI, computes missing required evidence, and does not
  trust caller-provided `complete`.
- `evaluateVisionOperationalRelease()` now emits a report-level evidence bundle
  and mirrors it into the decision card.
- `attachVisionOperationalOperatorDecision()` refuses confirmation unless the
  decision card evidence is complete, then snapshots the same evidence into the
  operator decision.
- `parseVisionOperationalReleaseReport()` enriches legacy reports with an
  incomplete evidence bundle and rejects stale card/operator evidence.
- `build-vision-operational-release-report.js` now hashes baseline benchmark,
  candidate benchmark, and release config artifacts, adds the output report URI,
  and merges Common Agent/Graph evidence URIs from config.
- `SettingsModal` displays evidence completeness, shows evidence URIs, and
  disables the confirmation button while evidence is incomplete.

## Verification

- `npm run test:contracts`: 73 passed.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `npm run eval:vision:release -- --baseline artifacts\multimodal-vision-strict-v2-baseline-20260724.json --candidate artifacts\multimodal-vision-candidate-v3-lean-20260724.json --config artifacts\vision-operational-release-config-20260724.json --output .tmp-tools\vision-operational-release-evidence-smoke.json`: produced `hold_shadow` as expected for the current incomplete metadata fixture, with baseline/candidate/config/report evidence and missing `common_agent_dataset_export`, `graph_snapshot`.
- `npm run test:electron:transition`: passed with complete evidence shown in
  Settings, `decisionCard.evidenceBundle.complete = true`,
  `operatorDecision.evidenceBundle.complete = true`, and zero console errors.
  The command reported stale Browserslist/Baseline data warnings during build.

## Operational Boundary

This closes the local release-evidence linkage path. Production promotion still
requires real Common Agent export URIs, approved Graph snapshot URIs, and real
holdout benchmark artifacts that satisfy the operational release thresholds.
