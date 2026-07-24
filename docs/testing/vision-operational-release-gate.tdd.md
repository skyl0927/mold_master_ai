# Vision Operational Release Gate TDD Evidence

Date: 2026-07-24

## Scope

This phase adds the fail-closed operational release path for Vision model,
prompt, and approved Graph versions. It does not deploy a candidate model
automatically. It produces an auditable promotion, shadow hold, or rollback
decision.

## RED Evidence

- `f734382`: the contract suite failed because the release gate module did not
  exist.
- `140aa00`: the Mold gateway test failed because Common Agent runtime version
  lineage was not retained.
- `fc6501b`: the Electron smoke test failed because no release gate panel or
  rollback decision was visible.
- `0ba9d76`: the benchmark suite failed because baseline and candidate reports
  could not be paired.
- `98448ea`: the contract build failed because imported reports were not
  validated.
- Common Agent `58d23a8`: the endpoint test failed because model, prompt, and
  Graph versions were missing from response metadata.

## GREEN Evidence

- `c5add87`: deterministic shadow metrics, split leakage audit, release decision,
  and exact rollback target.
- `8ed1970`: Common Agent version metadata retained in Mold telemetry.
- `9b311e2`: release status and rollback target rendered in Settings.
- `de50ce1`: paired report CLI, validated JSON import, report persistence, and
  export integration.
- Common Agent `e111f06`: runtime version metadata persisted in both the Vision
  response and image dataset records.

## Safety Gates

- Isolation by capture date, product family, mold, camera, capture session, and
  content hash.
- Pinned model, prompt, and Graph snapshots; `unknown`, `latest`, and `unpinned`
  values cannot pass.
- Paired baseline/candidate case IDs and minimum sample count.
- At least 30 human-verified cases for each declared new product family.
- Top-1, Top-3, per-class reproduction, selective accuracy, and selective
  coverage minimums.
- Dangerous accepted-error rate, ECE <= 0.08, and P95 latency limits.
- Candidate non-regression against baseline.
- Incomplete evidence keeps shadow mode; complete evidence with a safety
  regression selects the exact baseline snapshot for rollback.

## Verification

- `npm run test:contracts`: 39 passed.
- `npm run test:benchmark`: 26 passed.
- `npx tsc --noEmit`: passed.
- `npm run test:electron:transition`: passed with release panel, rollback
  decision, JSON export, and zero console errors.
- `npm run eval:vision:release -- ...`: a generated 30-case paired fixture
  returned `promote_candidate` with no blocking reasons.
- Common Agent focused Vision/HITL tests: 18 passed before the final full-suite
  verification.
- Mold cross-feature unit suites: 144 passed.
- Common Agent full suite: 667 passed.
- Electron multimodal, HITL, capture-protocol, and transition scenarios passed
  with zero console errors. The HITL smoke fixture was updated from an obsolete
  one-pixel/single-view input to the enforced two-view capture protocol.

## Operational Boundary

The software release mechanism is complete, but a production candidate remains
blocked until real approved field sessions meet the documented class coverage,
calibration, latency, and new-product human-verification thresholds. Synthetic
verification proves the gate behavior, not production model quality.
