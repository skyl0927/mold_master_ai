# Vision Decision Explainability UI TDD

작성일: 2026-07-27

## 목적

Vision AI는 사진에서 문제 특징을 보는 사람의 눈 역할을 한다. 따라서 결과
화면은 결함명만 보여주면 부족하고, AI가 어떤 영역을 봤는지, 후보를 Graph에
사용해도 되는지, 재촬영 또는 검토 사유가 있는지를 함께 보여줘야 한다.

## RED

`scripts/electron-multimodal-diagnosis-smoke.js`에 다음 화면 텍스트 기대값을
추가했다.

- `Vision 판정 사용 정책`
- `Graph 사용: 후보 우선 + Graph 교차검증`
- `AI가 본 근거 영역`
- `영역: 리브 기부`
- `재촬영/검토 사유: 없음`

실패 결과:

```text
npm run test:electron:multimodal
visionDecisionExplainabilityRendered: false
```

## GREEN

구현 내용:

- `AnalysisModal`의 Vision Safety Gate를 현장 언어로 변환했다.
- 내부 코드인 `candidate_primary_graph_cross_check`를
  `Graph 사용: 후보 우선 + Graph 교차검증`으로 표시한다.
- `graph_cross_check_only`는 교차검증 전용, `do_not_use_vision_candidate`는
  Graph 사용 금지로 표시한다.
- 관찰 목록에 `AI가 본 근거 영역` 제목과 `영역: ...` 라벨을 추가했다.
- 품질 우려, safety gate 사유, 추가 촬영, abstention, 계약 오류를 통합해
  `재촬영/검토 사유`로 표시하며, 사유가 없으면 `없음`으로 명시한다.

## 검증

```powershell
npm run test:electron:multimodal
npx --no-install tsc --noEmit --pretty false
```

결과:

- `test:electron:multimodal`: `visionDecisionExplainabilityRendered=true`,
  `consoleErrors=[]`
- `tsc --noEmit`: PASS

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | Vision 결과 모달에 판정 사용 정책이 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| 2 | Graph 후보 사용 가능 여부가 현장 언어로 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| 3 | AI가 본 관찰 영역이 `영역:` 라벨로 표시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |
| 4 | 재촬영/검토 사유가 없을 때도 `없음`으로 명시된다 | `scripts/electron-multimodal-diagnosis-smoke.js` | PASS |

## 운영 의미

결과 검토자가 결함명만 보고 승인하지 않고, Vision이 본 실제 영역과 후보
사용 정책을 확인한 뒤 승인, 교정, 반려, 재촬영을 결정할 수 있다. 이는
비전 오판이 Graph 기반 원인/대책 생성으로 전파되는 캐스케이드 오류를 줄인다.
