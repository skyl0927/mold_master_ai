# Operational Status Bundle TDD

작성일: 2026-07-28

## 목적

운영자가 새 계정/새 에이전트/다른 PC에서 작업을 이어받을 때 최신 진행률,
HITL pipeline 상태, Human Decision Brief, Settings 등록 대상 artifact를
각각 찾아 열어야 하면 누락 위험이 크다.
`operational-status-bundle/v1`은 이 정보를 하나의 artifact-only JSON/Markdown
패킷으로 묶어 현재 개발 완료 단계와 다음 HITL 작업을 바로 이어받게 한다.

## 보장

- 필수 입력은 `mold-master-development-progress-report/v1`,
  `operational-hitl-pipeline-status/v1`,
  `operational-hitl-human-decision-brief/v1`이다.
- 필수 증거가 없으면 `missing_evidence`로 fail-closed 처리한다.
- 패킷은 `serviceWritesPerformed=false`이며 CSV 수정, 검증 실행, Graph 승격,
  Reference 학습, 모델 학습을 수행하지 않는다.
- Settings에 등록할 버튼과 artifact 경로를 `Progress 등록`,
  `Pipeline Status 등록`, `Human Brief 등록`, `Session Packet 등록`,
  `Suggestion 등록` 순서로 제공한다.
- 다음 작업은 Settings 등록, Human Brief 열기, 원본 worktable CSV 입력,
  dry-run import와 상태 갱신 순서로 안내한다.

## RED/GREEN

테스트 파일:

```text
tests/operationalStatusBundle.test.js
```

RED:

```text
Cannot find module '../operationalStatusBundle'
```

GREEN:

```powershell
npm run test:operational-status-bundle
```

결과:

```text
PASS 2
```

Follow-up regression for Web/Vision progress feedback:

```powershell
node --test tests\moldMasterDevelopmentProgressReport.test.js tests\operationalStatusBundle.test.js tests\visionOperationalHitlWorkflowDisplay.test.js
```

Result:

```text
pass 37
fail 0
```

## 실제 실행

```powershell
npm run operational:status-bundle
```

실제 출력 요약:

```text
status=awaiting_human_hitl
softwareScaffoldPercent=100
operationalProgressPercent=0
hitlDecisionInputsMissing=56
pendingRows=59
highRiskRows=9
webCards=43
webTargetCards=40
webCommonAgentValidationPassed=43
webCentralApprovalsMissing=40
nextSessionCode=label_conflict_session
nextDecisionId=conflict-001
```

The Settings display summary now distinguishes collection readiness from approval blockers:

```text
Web cases 43/40 · Common Agent 43건 · HITL 승인대기 40건 · 중앙 승인대기 40건
```

생성 파일:

```text
artifacts/operational-status-bundle-*.json
artifacts/operational-status-bundle-*.md
```

이 패킷은 인계/상태 확인 전용이다. 실제 운영 전환은 사람이 원본 worktable CSV를
확인해 판정값을 입력하고, dry-run 검증과 Common Agent 수동 review를 통과한 뒤에만
다음 단계로 넘어간다.
