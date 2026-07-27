# Operational HITL Action Pack TDD

작성일: 2026-07-27

## 목적

운영 전환 전 남은 HITL 판정 큐가 Vision 라벨 충돌, Vision pending HITL,
Web Knowledge HITL로 나뉘어 있어 운영자가 다음 입력 파일과 검증 명령을
한눈에 확인하기 어렵다. `operational-hitl-action-pack/v1`은 최신 progress
report와 HITL intake status를 묶어 Common Agent/운영자 handoff용 no-write
작업 패킷을 만든다.

## RED

`tests/operationalHitlActionPack.test.js`를 먼저 추가하고 실행했다.

```text
Error: Cannot find module '../operationalHitlActionPack'
```

## GREEN

추가된 계약:

- `operationalHitlActionPack.js`
- `scripts/build-operational-hitl-action-pack.js`
- `npm run operational:hitl:action-pack`
- `npm run test:operational-hitl-action-pack`

검증 결과:

```text
npm run test:operational-hitl-action-pack
tests 3, pass 3
```

실제 artifact 기준 실행 결과:

```text
status=action_required
totalDecisionInputsMissing=56
firstQueueCode=vision_label_conflicts
actionStepCount=3
recommendedAction=품질/HITL 라벨 충돌 판정 파일을 작성하고 검증하세요.
```

## 보장

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | 남은 HITL 큐가 하나의 no-write action pack으로 정리된다. | `tests/operationalHitlActionPack.test.js` | unit | PASS | `npm run test:operational-hitl-action-pack` |
| 2 | 모든 큐가 닫히면 action step 없이 `clear`로 보고한다. | `tests/operationalHitlActionPack.test.js` | unit | PASS | `npm run test:operational-hitl-action-pack` |
| 3 | progress 또는 intake 증거가 없으면 fail-closed 명령만 제공한다. | `tests/operationalHitlActionPack.test.js` | unit | PASS | `npm run test:operational-hitl-action-pack` |

## 알려진 운영 갭

이 패킷은 판정 입력을 대신하지 않는다. 현재 실제 상태는 HITL decision 입력
56건이 남아 있고, 첫 큐는 `vision_label_conflicts` 4건이다. 사람이 판정 파일을
작성하고 검증하기 전에는 Graph 승격, Reference 학습, 모델 학습을 계속 금지한다.
