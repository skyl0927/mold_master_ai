# Vision Classifier Observability Targets TDD

작성일: 2026-07-27

## 목적

classifier 불일치율과 참조 부족률을 단순 비율로만 표시하면 운영자가 어떤
라벨쌍을 검토하고 어떤 결함군 이미지를 먼저 모아야 하는지 알기 어렵다.
Mold Master AI가 Vision top 후보와 classifier top 후보의 충돌쌍, 참조 부족
결함군을 관측성 결과와 전환 리포트에 함께 남기도록 한다.

## RED

계약 테스트에 다음 기대값을 추가했다.

- `visionClassifierDisagreementTargets`: `백화 -> 웰드라인` 충돌 1건
- `visionClassifierReferenceTargets`: `싱크` 참조 평균 1장, 목표 3장
- 권장 조치 문구가 충돌쌍과 참조 부족 결함군을 포함
- image gateway comparison record가 Vision top 후보를 보존

검증 결과:

```text
npm run test:contracts
tests 58
pass 56
fail 2
diagnosis observability ... actual undefined
image gateway ... undefined !== '백화'
```

실패 원인은 새 필드가 아직 구현되지 않은 의도한 RED였다.

## GREEN

구현 내용:

- `DiagnosisComparisonRecord`에 `visionClassifierVisionCandidate`를 추가했다.
- `DiagnosisObservability`에 `visionClassifierDisagreementTargets`와
  `visionClassifierReferenceTargets`를 추가했다.
- 불일치 레코드를 `Vision 후보 -> Classifier 후보`로 그룹핑하고 최대 3개
  샘플 이미지 ID를 보존한다.
- 참조 부족 레코드를 결함군별로 그룹핑하고 평균 참조 수, 목표 참조 수,
  샘플 이미지 ID를 보존한다.
- `Classifier 권장 조치` 문구에 주요 충돌쌍과 우선 수집 결함군을 포함한다.
- Electron 전환 리포트 smoke가 화면 텍스트와 JSON 내보내기에서
  `백화 -> 웰드라인` 타깃을 검증한다.

## 검증

```powershell
npm run test:contracts
npm run test:electron:transition
```

결과:

- `test:contracts`: 58/58 PASS
- `test:electron:transition`: `hasClassifierTarget=true`, `consoleErrors=[]`
- 전환 리포트 JSON:
  `visionClassifierDisagreementTargets[0] = { visionCandidate: "백화", classifierCandidate: "웰드라인", count: 1 }`

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | classifier 불일치가 어느 결함 후보쌍에서 발생했는지 관측성에 남긴다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 2 | classifier 참조 부족 결함군과 목표 수집량을 관측성에 남긴다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 3 | 실제 진단 gateway가 Vision top 후보를 comparison record에 보존한다 | `tests/commonAgentDocumentService.test.ts` | PASS |
| 4 | 설정 화면과 전환 리포트 JSON에서 주요 충돌쌍을 확인할 수 있다 | `scripts/electron-transition-report-smoke.js` | PASS |

## 운영 의미

이제 운영자는 “classifier 불일치 50%” 같은 추상 지표만 보지 않고
`백화 -> 웰드라인`처럼 실제 충돌한 라벨쌍을 확인할 수 있다. HITL 검토자는
해당 사진의 ROI, 조명, 라벨 taxonomy alias를 먼저 점검하고, 참조 부족
결함군은 승인 이미지를 우선 수집해 Common Agent reference store refresh
대상으로 삼을 수 있다.
