# Vision Recapture Lineage Source Handoff TDD

작성일: 2026-07-27

## Source Plan

AI 진단 고도화 계획 Phase 2의 재촬영 lineage 후속 단계에서 파생했다.
Vision safety gate가 재촬영을 요구한 경우, 다음 신규 캡처가 원본 HITL 요청과
분리되지 않고 Common Agent metadata로 이어져야 한다.

## User Journey

As a quality reviewer, I want a HITL recapture decision to prepare lineage for
the next captured image, so that the fresh image can be evaluated as a
correction of the original weak Vision observation instead of an unrelated
sample.

## RED/GREEN Evidence

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | HITL recapture review data can be converted into a next-capture lineage source with local image, Common Agent image, decision id, safety reasons, required views, and bbox profile. | `tests/captureSessionProtocol.test.js` | unit | RED then PASS | RED: `TypeError: buildRecaptureSourceFromReview is not a function`; GREEN: `npm run test:capture-session` passed 15/15 |
| 2 | Fresh recapture metadata remains compatible with Common Agent's existing `vision-recapture-lineage/v1` contract. | `tests/captureSessionProtocol.test.js` | unit | PASS | `npm run test:capture-session` passed 15/15 |
| 3 | App-level TypeScript integration accepts the new protocol helper and capture metadata shape. | `npx --no-install tsc --noEmit --pretty false` | typecheck | PASS | Command completed with exit code 0 |
| 4 | Existing Common Agent and Graph contracts are not regressed by the recapture handoff. | `npm run test:contracts` | contract | PASS | 63/63 passing |
| 5 | Electron/browser bundle still builds after the App integration. | `npm run build` | build | PASS | CSS and JS bundles completed; only existing Browserslist/baseline warnings |

## Implementation Notes

- `buildRecaptureSourceFromReview()` creates the reusable source contract.
- HITL `recapture` decisions now place that source into App pending state after
  Common Agent review submission succeeds.
- The next screen capture save, camera capture, mobile upload, file upload, or
  drag/drop image consumes the pending source once and stores it on
  `CapturedImage.recaptureSource`.
- The active capture session panel displays a short pending recapture badge so
  reviewers know the next image will be linked.

## Known Gaps

- Visual Electron click automation was not run in this TDD cycle.
- The Common Agent server was not contacted live; this cycle verifies the local
  client contract and metadata generation path.
