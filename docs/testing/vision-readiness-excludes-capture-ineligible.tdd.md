# Vision Readiness Excludes Capture-Ineligible Samples TDD

작성일: 2026-07-27

## Source Plan

AI 비전 진단 고도화 계획의 learning-ready 데이터 품질 gate에서 파생했다.
HITL 승인 metadata가 `capture_learning_candidate_eligible=false`를 남기더라도,
readiness 계산이 이를 무시하면 재촬영 mismatch 샘플이 Vision reference와
GraphRAG 학습 준비도에 섞일 수 있다.

## User Journey

As a dataset operator, I want approved but capture-ineligible recaptures to be
excluded from clean approved counts, so that readiness metrics reflect only
training-safe visual evidence.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Approved recapture items with `capture_learning_candidate_eligible=false` are excluded from `cleanApproved` and class coverage. | `tests/commonAgentDocumentService.test.ts` | contract/unit | RED then PASS | RED: `cleanApproved` was 2 instead of 1; GREEN: `npm run test:contracts` passed 64/64 |
| 2 | Readiness reports the excluded approved count and reason summary. | `tests/commonAgentDocumentService.test.ts` | contract/unit | PASS | `learningIneligibleApproved=1`, reason `recapture_guidance_view_mismatch` asserted |
| 3 | Settings and Database readiness panels compile with the new summary fields. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Command completed with exit code 0 |
| 4 | Browser/Electron bundle still builds after readiness UI update. | `npm run build` | build | PASS | CSS and JS bundles completed; only existing Browserslist/baseline warnings |

## Implementation Notes

- `calculateVisionDatasetReadiness()` now treats explicit
  `capture_learning_candidate_eligible=false` or
  `learning_candidate_eligible=false` as learning-ineligible.
- Ineligible approved images remain counted in `approved` for audit visibility
  but are excluded from conflict, duplicate, clean-approved, sample gate, and
  class coverage calculations.
- `learningIneligibleApproved` and `learningIneligibleReasons` expose why
  samples were excluded.
- Settings and Database readiness summaries now show `학습 제외 N건` when present.

## Known Gaps

- This validates local readiness and UI compilation. Live Common Agent
  `learning_ready_only` server-side filtering still depends on the external
  Common Agent implementation.
