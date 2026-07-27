# Vision Recapture Learning Eligibility Gate TDD

작성일: 2026-07-27

## Source Plan

AI 비전 진단 고도화 계획의 HITL/자가학습 안전 루프에서 파생했다. Fresh
recapture 이미지가 원본과 연결되고 권장 촬영 시점까지 기록되더라도, 실제
촬영 시점이 권장 시점과 맞지 않으면 GraphRAG/vision reference 학습 후보로
승격하면 안 된다.

## User Journey

As a dataset curator, I want approved recapture images with wrong capture views
to remain blocked from learning, so that human approval does not accidentally
promote incomplete corrective evidence into GraphRAG or future Vision reference
sets.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Approved recapture metadata with `view_mismatch` resolves to `eligible=false` and reason `recapture_guidance_view_mismatch`. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: `TypeError: resolveCaptureLearningEligibility is not a function`; GREEN: `npm run test:capture-session` passed 20/20 |
| 2 | Approved recapture metadata with fulfilled recommended view resolves to `eligible=true` and reason `approved_capture_ready`. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | Same RED/GREEN cycle; `npm run test:capture-session` passed 20/20 |
| 3 | App HITL review metadata compiles with `capture_learning_candidate_eligible` and reason fields. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Command completed with exit code 0 |
| 4 | Existing Common Agent and Graph contracts still pass after learning eligibility gating. | `npm run test:contracts` | contract | PASS | 63/63 passing |
| 5 | Browser/Electron bundles still compile after App metadata integration. | `npm run build` | build | PASS | CSS and JS bundles completed; only existing Browserslist/baseline warnings |

## Implementation Notes

- Added `resolveCaptureLearningEligibility()`.
- `recapture_guidance_*` mismatch reasons take precedence over generic
  `capture_protocol_not_ready` so reviewers can see the specific corrective
  action.
- HITL review metadata now sets both `learning_candidate_eligible` and
  `capture_learning_candidate_eligible` from the shared helper.
- `capture_learning_candidate_eligibility_reason` preserves the blocking reason
  for Common Agent export/filter logic.

## Known Gaps

- This cycle verifies local metadata and App compilation. Live Common Agent
  ingestion was not invoked.
