# Vision Recapture Guidance Metadata TDD

작성일: 2026-07-27

## Source Plan

AI 비전 진단 고도화 계획의 재촬영 루프와 Common Agent 학습 계보 요구에서
파생했다. 재촬영 사진은 원본 lineage뿐 아니라 왜 어떤 시점으로 다시 찍었는지
알 수 있는 guidance metadata를 함께 보존해야 한다.

## User Journey

As a Common Agent operator, I want fresh recapture uploads to include the
recommended capture view and recapture instructions, so that later GraphRAG
evaluation can distinguish corrected visual evidence from arbitrary duplicate
images.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Fresh recapture metadata includes `vision-recapture-capture-guidance/v1`, recommended view tag, guidance message, reason codes, and instructions. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: expected `vision-recapture-capture-guidance/v1` but actual was `undefined`; GREEN: `npm run test:capture-session` passed 17/17 |
| 2 | The TypeScript metadata contract exposes the new guidance fields for App/Common Agent callers. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Command completed with exit code 0 |

## Implementation Notes

- `buildCaptureMetadata()` now derives `buildRecaptureCaptureGuidance()` when a
  recapture lineage source exists.
- Metadata now carries `recapture_recommended_view_tag`,
  `recapture_guidance_reason_codes`, and `recapture_guidance_instructions`
  alongside the original `vision-recapture-lineage/v1` fields.

## Known Gaps

- This is a local contract/data-shape validation. Live Common Agent ingestion is
  not called in this TDD cycle.
