# Operational HITL Preparation Plan TDD

작성일: 2026-07-27

## 목적

`operational-hitl-action-pack/v1`은 남은 HITL 큐와 명령을 한 번에 보여주지만,
그 안에는 사람이 판정 파일을 작성하기 전에 실행해도 되는 명령과 판정 이후에만
실행해야 하는 `verify/apply` 명령이 섞여 있다.
`operational-hitl-preparation-plan/v1`은 이 명령들을 분리해 운영자가 템플릿과
review guide 생성부터 안전하게 진행하도록 한다.

## RED

`tests/operationalHitlPreparationPlan.test.js`를 먼저 추가하고 실행했다.

```text
Error: Cannot find module '../operationalHitlPreparationPlan'
```

## GREEN

추가된 계약:

- `operationalHitlPreparationPlan.js`
- `scripts/build-operational-hitl-preparation-plan.js`
- `npm run operational:hitl:prepare-plan`
- `npm run test:operational-hitl-prepare-plan`

검증 결과:

```text
npm run test:operational-hitl-prepare-plan
tests 3, pass 3
```

실제 artifact 기준 실행 결과:

```text
status=ready_for_preparation
totalDecisionInputsMissing=56
preparationCommandCount=6
humanGatedCommandCount=4
firstPreparationCommand=npm run vision:label-conflicts:decision-template
```

실제로 생성한 준비 artifact:

- `vision-approved-label-conflict-decisions-template-*`: 라벨 충돌 4건
- `vision-approved-label-conflict-review-guide-*`: 라벨 충돌 guide
- `common-agent-hitl-review-decisions-template-*`: Vision pending HITL 12건
- `vision-pending-hitl-review-guide-*`: Vision pending HITL guide
- `common-agent-web-knowledge-hitl-decisions-template-*`: Web Knowledge HITL 43개 후보, 목표 승인 40건
- `web-knowledge-hitl-review-guide-*`: Web Knowledge HITL guide

## 보장

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | 안전 준비 명령과 사람 판정 이후 명령이 분리된다. | `npm run test:operational-hitl-prepare-plan` | unit | PASS | `preparationCommandCount=6`, `humanGatedCommandCount=4` |
| 2 | HITL이 모두 닫힌 action pack은 `clear`로 보고된다. | `npm run test:operational-hitl-prepare-plan` | unit | PASS | `queuePlans.length=0` |
| 3 | action pack이 없으면 fail-closed로 증거 재생성 명령만 제공한다. | `npm run test:operational-hitl-prepare-plan` | unit | PASS | `status=missing_evidence` |

## 알려진 운영 갭

준비 플랜은 템플릿과 guide 생성을 돕지만, 판정 내용은 여전히 사람이 입력해야
한다. 현재 실제 상태는 라벨 충돌 4건, Vision pending HITL 12건, Web Knowledge
HITL 40건이 남아 있다. 판정 검증과 apply 계열 명령은 사람이 입력 파일을 완성한
뒤에만 실행해야 한다.
