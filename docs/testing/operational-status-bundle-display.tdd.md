# Operational Status Bundle Display TDD

작성일: 2026-07-28

## 목적

새 계정, 다른 PC, 다른 agent가 Mold Master AI 작업을 이어받을 때 여러 운영 JSON을 하나씩 열기 전에 `operational-status-bundle/v1` 하나로 현재 개발 단계와 다음 HITL 작업을 Settings 화면에서 확인할 수 있어야 한다.

이 표시는 인수인계와 상태 확인 전용이다. 자동 CSV 수정, Graph promotion, Reference learning, Model training을 수행하지 않는다.

## RED

테스트 파일:

```text
tests/visionOperationalHitlWorkflowDisplay.test.js
```

명령:

```powershell
npm run test:vision-operational-hitl-display
```

의도된 실패:

```text
TypeError: summarizeOperationalStatusBundleDisplay is not a function
```

## GREEN

구현 파일:

```text
visionOperationalHitlWorkflowDisplay.js
components/SettingsModal.tsx
```

명령:

```powershell
npm run test:vision-operational-hitl-display
```

결과:

```text
PASS 26
```

## 보장

| # | 보장 내용 | 증거 |
|---|---|---|
| 1 | `operational-status-bundle/v1`은 `Operational Status Bundle` 카드 요약으로 변환된다. | `summarizes operational status bundle for one-step Settings handoff display` |
| 2 | software/operational 진행률, Vision blocker, HITL missing, pending/high-risk row, Web approval 대기 수가 표시된다. | `summaryText` assertion |
| 3 | Vision Top-1/Top-3, 다음 session/decision, worktable CSV 경로가 표시된다. | `accuracyText`, `nextSessionText`, `worktableCsvPath` assertion |
| 4 | Settings import checklist가 등록 순서로 표시된다. | `settingsImportButtons` assertion |
| 5 | 자동 적용/학습/Graph promotion 금지 배지가 유지된다. | `safetyBadges` assertion |

## Settings 연결

Settings 운영 게이트 영역에 `Status Bundle 등록` 버튼을 추가했다. 가져온 번들은 `localStorage`의 `mold-master-ai:operational-status-bundle:v1`에 저장되고, 같은 화면에서 현재 단계, 다음 세션, worktable CSV, 안전 배지를 표시한다.
