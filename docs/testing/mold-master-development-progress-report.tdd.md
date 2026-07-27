# Mold Master Development Progress Report TDD

작성일: 2026-07-27

## 목적

운영 readiness, blocker worklist, Common Agent handoff, Web Knowledge readiness가
각각 따로 생성되면 현재 개발 완료 단계와 남은 운영 작업을 한눈에 판단하기
어렵다. `mold-master-development-progress-report/v1`은 이 artifact들을 하나로
묶어 소프트웨어 scaffold 진행률과 실제 운영 readiness 진행률을 분리해 보여준다.

## RED

`tests/moldMasterDevelopmentProgressReport.test.js`를 먼저 추가하고 실행했다.

기대 동작:

- 현재처럼 Vision blocker와 Web HITL이 남아 있으면
  `status=action_required`, 현재 단계는 운영 전환 전 데이터/HITL 게이트 종료로
  표시한다.
- Vision과 Web Knowledge가 모두 닫히면 `ready_for_operator_review`로 표시한다.
- 필수 artifact가 없으면 `missing_evidence`로 fail-closed 처리하고 운영 진행률을
  0%로 고정한다.
- 모든 결과는 artifact-only이며 Graph, Reference store, 모델 학습 쓰기를 금지한다.

RED 결과:

```text
Error: Cannot find module '../moldMasterDevelopmentProgressReport'
```

## GREEN 구현

추가된 계약:

- `moldMasterDevelopmentProgressReport.js`
- `scripts/build-mold-master-development-progress-report.js`
- `npm run operational:progress`
- `npm run test:operational-progress`

현재 실제 artifact 기준 실행 결과:

```text
status=action_required
currentPhase=운영 전환 전 데이터/HITL 게이트 종료 단계
softwareScaffoldPercent=100
operationalProgressPercent=0
topPriorityTaskCode=resolve_label_conflicts
```

해석:

- 소프트웨어 scaffold와 안전 계약은 준비되어 있다.
- 운영 활성화는 아직 데이터/HITL/reference/release gate가 닫히지 않아 금지된다.
- 다음 1순위는 승인 이미지 라벨 충돌 해결이다.
