# 실제 5장 결함 그룹 분리 및 no-write 재평가

## 문제 재현

- 같은 제품의 서로 다른 위치 사진 4장이 하나의 `captureSessionId`만으로 다중 시점 융합됐다.
- 리브 모서리, 잎 모양 표면 이상, 원형 기능부 주변 자국이 하나의 Top-3 후보 경쟁으로 합쳐졌다.
- 최상위 후보가 승인 Graph 경로로 지지되지 않아도 하위 후보 경로가 전체 근거 수와 Trace에 포함될 수 있었다.
- 판정 보류 상태에서도 추정 결함명이 카드 제목에 노출되어 확정 진단처럼 보였다.

## 적용 계약

1. 사용자가 선택한 동일 결함 위치 사진에 `diagnosisGroupId`를 발급한다.
2. 근접, 사광, 측면 사진은 같은 그룹 안에서만 융합한다.
3. 같은 제품 촬영 세션의 `full_part_context` 사진은 여러 결함 그룹의 공통 문맥으로 재사용한다.
4. 그룹이 없는 사진은 세션이 같아도 진단하지 않는다.
5. 서로 다른 위치 혼합 신호가 검출되면 Graph/LLM 처리를 중단하고 `사진 그룹 분리 필요`로 기권한다.
6. 미검증 Vision 후보는 카드 제목에 결함명을 노출하지 않고 `판정 보류 (후보 미검증)`으로 표시한다.
7. Graph 근거 수, 인용, Trace는 Top-1 Vision 후보와 일치하는 승인 경로만 집계한다.

## 실제 no-write 재평가

Common Agent 런타임은 `gpt-5.6-terra`, `vision-diagnosis-v2`, `detail=original`이었다.

| 결함 그룹 | Vision 후보 | 상태 | Top-1 승인 Graph |
| --- | --- | --- | ---: |
| 잎 모양 표면 이상부 + 전체 문맥 | 표면 박리/들뜸, 스크래치/패임, 국부 눌림 | `needs_review` | 0 |
| 리브 모서리 + 전체 문맥 | 버/플래시, 표면 스크래치 | `needs_review` | 0 |
| 원형 기능부 주변 + 전체 문맥 | 스크래치/패임 | `needs_review` | 0 |
| 표시된 모서리 단일 사진 | 후보 없음 | `unclassifiable` | 0 |

네 결과는 서로 다른 관심 위치로 분리됐고, 이전처럼 하나의 `플래시` 진단으로 합쳐지지 않았다. 다만 사람 정답 라벨이 없고 세 그룹 모두 승인 Graph 경로가 0건이므로 정확한 결함명, 원인, 대책은 확정할 수 없다. 동일 관심 위치를 수직광과 사광 또는 측면에서 한 장 이상 추가 촬영한 뒤 HITL 정답과 비교해야 한다.

## 무기록 증명

- 모든 응답: `persist_mode=never`
- 모든 응답: `persisted_to_dataset=false`
- 모든 응답: `service_writes_performed=false`
- Common Agent 이미지 데이터셋: `38 -> 38`
- 데이터셋 지문: `cc25ebdf81950040655b86a081260aa3bcc6af97f71f8aad738d4e364fa11aec` 불변
- 증거 JSON: `artifacts/goal-review-20260828/physical-five-image-target-groups-no-write-20260901.json`

## 검증

- `node --test tests/captureSessionProtocol.test.js tests/visionDiagnosisGuard.test.js`
- `npm run test:contracts`
- `npx tsc --noEmit --allowJs false`
- `npm run build`
- `npm run test:electron:diagnosis-group`
- `npm run test:electron:inspection-card`
- `npm run test:electron:vision-capture-protocol`
