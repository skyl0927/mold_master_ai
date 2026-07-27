# Operational HITL Action Pack UI TDD

작성일: 2026-07-27

## 목적

`operational-hitl-action-pack/v1`이 CLI artifact로만 남으면 운영자가 Settings에서
현재 HITL 입력 큐와 첫 명령을 확인하기 어렵다. 이 변경은 action pack을
Settings 비전 릴리스 게이트와 JSON export에 표시해 Common Agent/운영자 handoff
가시성을 높인다.

## RED

`tests/visionOperationalHitlWorkflowDisplay.test.js`와
`scripts/electron-transition-report-smoke.js`를 먼저 확장했다.

RED 결과:

```text
TypeError: summarizeOperationalHitlActionPackDisplay is not a function
```

## GREEN

추가된 동작:

- `summarizeOperationalHitlActionPackDisplay`가 action pack을 Settings 표시 모델로 변환한다.
- Settings에서 `HITL Pack 등록` 버튼으로 `operational-hitl-action-pack/v1` JSON을 로컬 등록한다.
- `HITL Action Pack` 카드가 미입력 수량, 첫 큐, 다음 명령, 안전 배지를 보여준다.
- JSON 내보내기에 `operationalHitlActionPack`이 포함된다.

검증 결과:

```text
npm run test:vision-operational-hitl-display
tests 9, pass 9

npm run test:electron:transition
hasOperationalHitlActionPackPanel=true
operationalHitlActionPackMissing=56
consoleErrors=[]
```

## 보장

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | action pack이 Settings 표시 모델로 요약된다. | `npm run test:vision-operational-hitl-display` | unit | PASS | `summaryText=미입력 56건 · 라벨충돌 4건 · Vision 12건 · Web 40건` |
| 2 | Settings 화면에 HITL Action Pack 카드와 첫 명령이 표시된다. | `npm run test:electron:transition` | E2E smoke | PASS | `hasOperationalHitlActionPackPanel=true`, `hasOperationalHitlActionPackNextCommand=true` |
| 3 | JSON export가 action pack 상태와 누락 수량을 포함한다. | `npm run test:electron:transition` | E2E smoke | PASS | `operationalHitlActionPackStatus=action_required`, `operationalHitlActionPackMissing=56` |

## 알려진 운영 갭

이 UI는 판정 입력을 대신하지 않는다. 현재 실제 action pack 기준 첫 큐는
`vision_label_conflicts`이며, 사람 판정이 끝나기 전까지 Graph 승격, Reference
학습, 모델 학습은 계속 금지된다.
