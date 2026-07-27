# Vision Recapture Policy Negative-flow TDD

작성일: 2026-07-27

## 목적

비전 AI가 사진 품질 문제에도 불구하고 높은 신뢰도의 결함 후보를 반환하면,
후속 Graph 원인/대책 생성이 잘못된 결함명에 끌려갈 수 있다. 결과 화면은
이 상황을 단순 빈 원인/대책으로 보이지 않게 하고, Graph 사용 금지와
재촬영/HITL 필요 상태를 명확히 알려야 한다.

## RED

`scripts/electron-vision-recapture-policy-smoke.js`를 추가하고
`npm run test:electron:vision-recapture-policy` 스크립트를 등록했다.

테스트 mock 응답:

- V2 Vision observation
- 고신뢰 `백화` 후보
- `quality_status` 생략
- `quality_concerns = motion blur, ROI too small`
- 미검증 Vision 원인/대책 포함

실패 결과:

```text
npm run test:electron:vision-recapture-policy
causeActionBlockedRendered: false
```

기존 UI는 Graph 사용 금지, 재촬영 사유, 근거 영역은 표시했지만 원인/대책이
왜 작성되지 않는지 별도 안내하지 않았다.

## GREEN

구현 내용:

- `AnalysisModal`에 `isVisionCauseActionBlocked`를 추가했다.
- Vision safety gate가 `blocked`이거나 `do_not_use_vision_candidate`이면
  원인/대책 섹션 앞에 `원인/대책 생성 차단` 안내를 표시한다.
- 안내 문구는 `Vision 후보를 Graph에 사용할 수 없어 재촬영 또는 HITL 확정
  전까지 원인/대책을 작성하지 않습니다.`로 고정했다.
- 기존 Vision guard가 제거한 미검증 원인/대책 문장은 계속 화면에 표시하지
  않는다.

## 검증

```powershell
npm run test:electron:vision-recapture-policy
```

결과:

- `blockedPolicyRendered=true`
- `recaptureReasonRendered=true`
- `evidenceAreaRendered=true`
- `causeActionBlockedRendered=true`
- `unverifiedVisionContentSuppressed=true`
- `consoleErrors=[]`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | 품질 반려 Vision 후보는 Graph 사용 금지로 표시된다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |
| 2 | 재촬영/검토 사유에 품질 우려와 추가 촬영 요구가 표시된다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |
| 3 | 원인/대책 생성 차단 안내가 표시된다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |
| 4 | 미검증 Vision 원인/대책은 화면에 노출되지 않는다 | `scripts/electron-vision-recapture-policy-smoke.js` | PASS |

## 운영 의미

작업자는 품질이 낮은 사진에서 나온 결함 후보를 승인 데이터나 시방서 근거로
사용하지 않고 재촬영 또는 HITL 검토로 돌릴 수 있다. 이로써 비전 오판이
Graph 기반 원인/대책으로 전파되는 캐스케이드 오류를 줄인다.
