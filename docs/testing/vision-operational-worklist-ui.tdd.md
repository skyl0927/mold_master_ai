# Vision Operational Worklist UI TDD Evidence

Date: 2026-07-27

## Scope

This phase exposes the existing `vision-operational-blocker-worklist/v1`
output inside the Settings release gate and the transition report JSON export.
The goal is to make the current go/no-go blockers visible to the operator
without relying on CLI artifacts only.

## User Journey

As a quality lead, I want the Settings screen and exported validation report to
show readiness audit blockers as prioritized Korean tasks, so that Common Agent
or Graph promotion cannot proceed without human-visible closure work.

## RED Evidence

- Commit `2fb8f9a` extended `scripts/electron-transition-report-smoke.js`.
- `npm run test:electron:transition` failed because the Settings UI did not
  contain `운영 작업 목록` or `승인 이미지 라벨 충돌 해결`.
- The exported JSON also did not contain `operationalBlockerWorklist` or
  `operationalReadinessAudit`.

## GREEN Evidence

- `components/SettingsModal.tsx` now reads
  `mold-master-ai:vision-operational-readiness-audit:v1` from localStorage.
- The Settings release gate shows `운영 작업 목록`, task count, status label,
  recommended next action, top blocker tasks, and the Common Agent handoff
  safety policy.
- The transition report JSON now includes both `operationalReadinessAudit` and
  `operationalBlockerWorklist`.
- The implementation is non-mutating. It does not write to SQL, Graph, Common
  Agent, model config, or release history except when the user imports an audit
  JSON into localStorage.

## Verification

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | Settings shows the operational worklist panel from the stored readiness audit | `npm run test:electron:transition` | E2E smoke | PASS | `hasOperationalWorklistPanel: true` |
| 2 | Top blocker task is the approved label conflict closure task | `npm run test:electron:transition` | E2E smoke | PASS | `hasOperationalWorklistFirstTask: true`, `operationalWorklistFirstTask: resolve_label_conflicts` |
| 3 | Exported JSON carries the same worklist and audit status | `npm run test:electron:transition` | E2E smoke | PASS | `operationalWorklistTotalTasks: 5`, `operationalReadinessAuditStatus: action_required` |
| 4 | Common Agent handoff remains blocked from Graph promotion | `npm run test:electron:transition` | E2E smoke | PASS | `operationalWorklistGraphPromotion: false` |
| 5 | TypeScript accepts the Settings integration | `npx --no-install tsc --noEmit --pretty false` | Type check | PASS | No output |

## Known Gaps

The app now surfaces the blocker worklist, but it does not solve the underlying
data readiness blockers. Production approval still requires conflict-free HITL
labels, enough approved field images, a valid Common Agent reference store,
complete release evidence, and final operator approval.
