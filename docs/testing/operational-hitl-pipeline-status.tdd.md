# Operational HITL Pipeline Status TDD

## 목적

HITL 작업표 입력, preflight, verify-run, Common Agent import package,
post-import validation plan이 여러 artifact로 나뉘면서 현재 병목을 한눈에
확인하기 어려웠다. `operational-hitl-pipeline-status/v1`는 최신 artifact를
읽어 현재 단계, 다음 명령, 안전 정책을 artifact-only로 요약한다.

## RED

```powershell
node --test tests\operationalHitlPipelineStatus.test.js
```

초기 실패는 `../operationalHitlPipelineStatus` 모듈이 없어 발생했다. 테스트는
다음 계약을 먼저 고정했다.

- 사람이 CSV `newAction`을 입력하지 않은 현재 상태는 `awaiting_human_csv_decisions`로 닫힌다.
- dry-run 계획은 `worktable-import -- --apply`로만 이동한다.
- preflight 통과 상태는 `verify-run -- --execute`로만 이동한다.
- import package 준비 상태는 Common Agent 수동 검토 단계로 표시한다.
- 핵심 artifact가 없으면 `missing_evidence`로 fail-closed 처리한다.

## GREEN

```powershell
node --test tests\operationalHitlPipelineStatus.test.js
```

결과: 5개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:pipeline-status
```

이 명령은 JSON/Markdown 상태 리포트만 `artifacts`에 생성한다. 현재 HITL 판정이
비어 있으면 `fill_worktable_csv`를 첫 번째 next action으로 반환하고, 자동
Graph 승격과 외부 서비스 쓰기는 계속 금지한다.
