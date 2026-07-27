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
- worktable suggestion artifact가 있으면 추천 row와 추천 분포를 summary,
  stage trail, source map, Markdown에 표시한다.
- review session plan artifact가 있으면 검토 세션 수와 고위험 row를 summary,
  stage trail, source map, Markdown에 표시한다.
- review session packet artifact가 있으면 세션 패킷 수와 파일 수를 summary,
  stage trail, source map, Markdown에 표시한다.
- review session progress artifact가 있으면 세션 완료/대기/오류 row 수를
  summary, stage trail, source map, Markdown에 표시한다.
- dry-run roundtrip artifact가 있으면 추천값 기반 후속 import 계획/오류를
  summary, stage trail, source map, Markdown에 표시한다.
- dry-run roundtrip이 invalid이면 사람 CSV 입력 전에 추천 규칙 또는 작업표
  필드 보완 단계로 우선 라우팅한다.

## GREEN

```powershell
node --test tests\operationalHitlPipelineStatus.test.js
```

결과: 7개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:pipeline-status
```

이 명령은 JSON/Markdown 상태 리포트만 `artifacts`에 생성한다. 현재 HITL 판정이
비어 있으면 `fill_worktable_csv`를 첫 번째 next action으로 반환하고, 자동
Graph 승격과 외부 서비스 쓰기는 계속 금지한다.

현재 artifact 기준 CLI 결과:

- 상태: `action_required`
- 현재 단계: `awaiting_human_csv_decisions`
- 남은 HITL 입력: 56
- 작업표 row: 59
- 추천 row: 59
- 검토 세션: 4
- 검토 세션 고위험 row: 9
- 검토 패킷: 4
- 검토 패킷 파일: 8
- 추천값 roundtrip 계획 update: 59
- 추천값 roundtrip 오류 row: 0
- 세션 완료 row: 0
- 세션 대기 row: 59
- 세션 오류 row: 0
- 재촬영 추천: 5
- Vision 승인 후보: 7
- Web 카드 승인 후보: 43
- planned update: 0

## Settings UI 연동

Settings의 `비전 릴리스 게이트` 영역에 `Pipeline Status 등록` 버튼을 추가했다.
최신 `artifacts/operational-hitl-pipeline-status-*.json`을 등록하면
`Vision 운영 작업 목록` 아래에 `HITL Pipeline Status` 카드가 표시된다.

카드는 현재 단계, 미입력/작업표/추천 분포, 추천값 roundtrip 사전검증,
검토 세션/고위험 row, 다음 명령, 안전 배지를 표시한다.
이 UI는 외부 서비스 쓰기 없이 localStorage에 artifact를 저장하며, 사람이 HITL
CSV 판정을 끝내기 전까지 Graph/Reference/Model 승격 금지를 명시한다.
