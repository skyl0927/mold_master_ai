# Vision Recapture Guidance Fulfillment Metadata TDD

작성일: 2026-07-27

## Source Plan

AI 비전 진단 고도화 계획의 재촬영 품질 루프에서 파생했다. Fresh recapture
이미지는 원본 HITL 요청과 연결되는 것만으로는 부족하며, 실제 촬영 시점이
권장 시점을 충족했는지도 Common Agent/GraphRAG metadata에 남아야 한다.

## User Journey

As a GraphRAG dataset reviewer, I want recapture uploads to declare whether the
recommended view was actually captured, so that incomplete recaptures are not
mistaken for validated corrective evidence.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A fresh recapture with the recommended `defect_closeup` tag is marked `recapture_guidance_fulfilled=true` and `fulfilled`. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: expected `true` but actual was `undefined`; GREEN: `npm run test:capture-session` passed 18/18 |
| 2 | A fresh recapture with the wrong view tag records the actual view tags, `view_mismatch`, and the missing recommended tag. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: expected actual view tags but actual was `undefined`; GREEN: `npm run test:capture-session` passed 18/18 |
| 3 | TypeScript accepts the expanded recapture fulfillment metadata contract. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Standalone rerun completed with exit code 0 |
| 4 | Existing Common Agent and Graph contracts still pass after the metadata expansion. | `npm run test:contracts` | contract | PASS | 63/63 passing |
| 5 | Browser/Electron bundles still compile after the protocol change. | `npm run build` | build | PASS | CSS and JS bundles completed; only existing Browserslist/baseline warnings |

## Implementation Notes

- `buildCaptureMetadata()` now reuses normalized capture view tags to compare the
  actual fresh image view against `recapture_recommended_view_tag`.
- Metadata now includes `recapture_actual_view_tags`,
  `recapture_guidance_fulfilled`, `recapture_guidance_fulfillment_status`, and
  `recapture_missing_recommended_view_tag` when the recapture does not satisfy
  the recommendation.

## Known Gaps

- This cycle validates local metadata generation only. Live Common Agent
  ingestion and visual Electron smoke tests were not run.
