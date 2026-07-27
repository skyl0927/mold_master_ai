# Vision Recapture Capture Guidance TDD

작성일: 2026-07-27

## Source Plan

AI 비전 진단 고도화 계획의 재촬영 루프 후속 단계에서 파생했다. HITL
`recapture` 결정은 단순히 다음 이미지를 원본과 연결하는 것뿐 아니라, 왜 다시
찍어야 하는지에 맞는 촬영 시점과 짧은 지시를 제공해야 한다.

## User Journey

As a field reviewer, I want Mold Master AI to recommend the next capture view
from the Vision safety failure reasons, so that a weak bbox or lighting issue is
corrected by the next photo rather than repeated.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Overbroad bbox or close-up recapture requests recommend `defect_closeup` and include the close-up instruction. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: `TypeError: buildRecaptureCaptureGuidance is not a function`; GREEN: `npm run test:capture-session` passed 17/17 |
| 2 | Explicit oblique-light/shine evidence requests recommend `oblique_light` and preserve the original recapture instruction. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | Same RED/GREEN cycle; `npm run test:capture-session` passed 17/17 |
| 3 | TypeScript accepts the App and Camera handoff contract. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Command completed with exit code 0 |

## Implementation Notes

- `buildRecaptureCaptureGuidance()` emits
  `vision-recapture-capture-guidance/v1`.
- App pending recapture state now changes the screen capture default view to the
  recommended view.
- Camera capture receives the same guidance and displays the recommended view
  plus up to two short instructions.
- Mobile, file upload, and drag/drop recapture images receive the recommended
  `captureViewTag` metadata automatically.

## Known Gaps

- This cycle validates deterministic guidance and TypeScript integration.
- Live camera and Electron click automation were not run in this cycle.
