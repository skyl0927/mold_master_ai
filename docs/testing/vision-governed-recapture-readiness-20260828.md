# Vision Governed Recapture Readiness (2026-08-28)

## Gate Decision

- Common Agent의 Vision, 다중 시점 fusion, 승인 Graph 조회는 `persist_mode=never`에서 사용할 수 있다.
- Mold Master AI는 운영 번들의 재촬영 작업지시를 전용 촬영 세션으로 직접 시작하고, 작업지시 ID와 필수 시점 전체를 세션 종료까지 유지한다.
- 현재 게이트는 `software_ready / physical_evidence_missing`이다. 실제 제품 재촬영이 완료되지 않았으므로 Vision 재평가, Web Case 40건 승인, Common Agent 적재, Graph 왕복 평가 및 운영 릴리스는 시작하지 않는다.

## Common Agent Runtime Evidence

- Vision status: `ready`
- Runtime: `gpt-5.6-terra`, prompt `vision-diagnosis-v2`, image detail `original`
- Diagnose endpoint: `/v1/vision/diagnose`
- No-write contract: `persist_mode=always | classifiable_only | never`
- `never` 응답 증명: `persisted_to_dataset=false`, `service_writes_performed=false`
- Common Agent 회귀: Vision, multiview, Graph, QA, answer-ledger 관련 92건 통과
- 실제 2시점 probe: fusion `2/2`, SQL `image_dataset/query_logs/audit` 변화 없음, 이미지 파일 수 `9059 -> 9059`
- 증거 응답: `I:/AI TEAM PJT/common agent/reports/e2e-phases/vision-no-write-runtime-20260828a.json`

## Mold Master Readiness

- 운영 번들: `artifacts/operational-status-bundle-2026-08-28T12-40-41-080Z.json`
- 재촬영 계획: `artifacts/goal-review-20260828/vision-capture-work-order-plan-after-runtime-contract.json`
- 기존 이미지 provisional 평가: `artifacts/goal-review-20260828/vision-no-write-multiview-existing-pairs.json`
- 자동 탐색 확인: 최신 번들 선택, `serviceWritesPerformed=false`, 첫 4개 큐 ID 및 작업지시 ID 보존, 내장 snapshot 4개
- Settings의 각 우선 작업지시 카드에서 `재촬영 시작`을 누르면 전용 세션과 카메라 프로토콜이 열린다.
- 다른 작업지시의 이미지는 한 evidence 세트로 병합할 수 없고, 필수 시점이 모두 충족되기 전에는 학습 후보로 승인되지 않는다.

## Physical Work Orders

| Priority | Queue / Work item | Defect | Required physical evidence | Canonical capture tags |
| ---: | --- | --- | --- | --- |
| 219 | `pending-hitl-007` / `vision-non-approval-008` | 플래시 | 전체+결함 위치, 결함 근접, 파팅라인/게이트 경계, 잉여 수지 측면 | `full_part_context`, `defect_closeup`, `parting_line_context`, `edge_profile` |
| 218 | `pending-hitl-010` / `vision-non-approval-009` | 흑점/탄화 | 무주석 전체 원본, 탄화 근접, 유동 말단+벤트, 동일 조명 정상 비교품 | `full_part_context`, `defect_closeup`, `fill_end_context`, `vent_context`, `reference_part` |
| 215 | `pending-hitl-006` / `vision-non-approval-007` | 웰드라인 | 무주석 전체 시편, 유동 합류부 근접 원본, 동일 배율 정상 비교 시편 | `full_part_context`, `defect_closeup`, `flow_convergence_context`, `reference_part` |
| 212 | `pending-hitl-011` / `vision-non-approval-010` | 싱크 | 무주석 전체 원본, ROI 정면+사선광 근접, 반대면 리브/후육부 | `full_part_context`, `defect_closeup`, `oblique_light`, `reverse_geometry` |

복합 촬영 지침은 감사 가능한 특징을 분리하기 위해 둘 이상의 표준 태그로 전개될 수 있다. 앱의 촬영 화면에 표시되는 모든 필수 태그를 각각 충족해야 작업지시가 완료된다.

## Reevaluation Gate

1. 네 작업지시의 실제 제품 사진을 같은 작업지시 세션 안에서 촬영한다.
2. 각 세션에서 모든 필수 태그가 `촬영 완료`인지 확인한다.
3. 동일 작업지시의 사진만 묶어 Common Agent에 `persist_mode=never`로 전송한다.
4. 응답마다 multiview fusion과 `persisted_to_dataset=false`, `service_writes_performed=false`를 확인한다.
5. Vision 후보와 승인 Graph 경로의 일치 여부, Top-1/Top-3 및 Graph grounding을 재평가한다.
6. 데이터셋 fingerprint와 중앙 저장 건수가 평가 전후 동일한지 확인한다.
7. 네 건 모두 재평가 게이트를 통과한 뒤에만 Web Case 40건 HITL 단계로 이동한다.

## Implementation Evidence

- `99be5d1` / `a073562`: 다중 시점 작업지시 완결성 계약
- `5dafcaa`: 작업지시 간 evidence 병합 차단
- `5cd25fe`: 필수 시점 완료 전 lineage 유지
- `53364b1` / `56712c0`: no-write multiview 평가 계약과 실행기
- `4de7a23` / `304b73d`: 운영 카드에서 재촬영 세션 직접 실행
- `a645b67` / `344f876`: 정상 비교 시편 태그 누락 회귀 방지

## Verification

- `npm run test:contracts`: 341/341 통과
- `npm run test:capture-session`: 30/30 통과
- `npm run test:benchmark`: 38/38 통과
- `npx --no-install tsc --noEmit --allowJs false`: 통과
- `npm run build`: 통과
- Electron 최신 번들 자동 복원: 4개 작업지시 버튼 확인, 플래시 세션 직접 실행, 필수 시점 4개 표시, 콘솔 오류 0건
- Electron 증거 화면: `artifacts/electron-governed-recapture-work-orders.png`

## Sequence Hold

현재 허용 작업은 물리 재촬영과 no-write Vision 재평가뿐이다. `Web Case 40건 승인 -> Common Agent 적재 -> Graph 왕복 평가 -> 운영 릴리스 승인`은 이 문서의 재평가 게이트가 통과되기 전까지 보류한다.
