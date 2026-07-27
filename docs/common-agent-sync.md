# Common Agent 연동 사용법

이 앱은 이제 Common Agent와 직접 동기화할 수 있다. 목적은 mold-master-ai에서 촬영/편집한 현장 이미지를 Common Agent의 이미지 데이터셋, 그래프 추론, 이미지 주석 학습 파이프라인으로 보내는 것이다.

## 사전 조건

Common Agent가 실행 중이어야 한다.

```powershell
cd "I:\AI TEAM PJT\pinn-injector-pro (pro)\common agent"
docker compose ps
Invoke-RestMethod "http://localhost:8000/healthz"
```

기본 Agent 주소는 다음 값이다.

```text
http://127.0.0.1:8000
```

앱의 설정 화면에서 `Agent Server URL`을 바꾸면 다른 서버도 사용할 수 있다.

## 사용 순서

1. mold-master-ai에서 이미지를 촬영하거나 추가한다.
2. 필요한 경우 편집 버튼을 눌러 결함 영역에 사각형 또는 타원 ROI를 그린다.
3. 이미지 카드에서 `Agent 동기화` 버튼을 누른다.
4. Common Agent가 이미지를 진단하고 `image_id`를 발급한다.
5. ROI 도형은 Common Agent의 bbox 주석 API로 전송된다.
6. 전송된 주석은 기본적으로 `candidate` 상태로 저장된다.

`candidate`로 저장하는 이유는, 자동 ROI가 바로 학습 데이터로 들어가면 잘못된 라벨이 모델 성능을 떨어뜨릴 수 있기 때문이다. 학습에 쓰려면 Common Agent 쪽 검토 API 또는 향후 UI에서 승인해야 한다.

## 동기화 결과

이미지 카드에는 다음 정보가 표시된다.

```text
doc/image id: image-...
ROI n
```

Common Agent에서 직접 확인하려면 다음 API를 사용한다.

```powershell
Invoke-RestMethod "http://localhost:8000/v1/datasets/images/<image_id>/annotations"
```

YOLO 학습용 manifest는 다음 API로 확인한다.

```powershell
Invoke-RestMethod "http://localhost:8000/v1/datasets/images/export-yolo?review_status=approved"
```

주의: `export-yolo`는 승인된 bbox만 포함한다. 자동 동기화된 `candidate` bbox는 사람이 검토/승인하기 전까지 학습 export에 포함되지 않는다.

## 구현 기준

- Common Agent 이미지 업로드: `POST /v1/vision/diagnose`
- ROI 주석 저장: `POST /v1/datasets/images/{image_id}/annotations`
- ROI 좌표 형식: `normalized_xywh`
- 동기화 source: `mold-master-ai`
- 자동 주석 review status: `candidate`

## 공정 지식 이전

설정의 `로컬 공정 지식 중앙 이전`에서 `지식 이전`을 실행하면 로컬 `knowledge_matrix`가 출처 추적 가능한 Markdown 문서로 변환된다.

- 중앙 수집: `POST /v1/workflows/ingest-file`
- 문서 승인 및 하위 Graph 상태 전파: `POST /v1/feedback`
- 지식 범위: `process_knowledge`
- RAG category: `mold-master-process-knowledge`
- 원본 로컬 DB: 유지

문서 승인 시 Document뿐 아니라 Block, Cluster, Entity, Relationship도 함께 `approved`가 되어야 한다. Graph-only 질의는 검색 전에 `review_status=approved`를 적용해 candidate 근거가 top-k를 소진하지 않도록 한다.

## 운영 handoff 패킷

Vision 운영 readiness audit과 blocker worklist는 Common Agent 또는
Antigravity가 이어 받을 수 있도록 artifact-only handoff JSON으로 묶을 수
있다.

```powershell
npm run vision:operational:readiness
npm run vision:operational:worklist
npm run vision:operational:handoff
npm run operational:progress
npm run operational:hitl:intake-status
npm run operational:hitl:action-pack
npm run operational:hitl:prepare-plan
npm run operational:hitl:prepare-run
npm run operational:hitl:decision-review-packet
npm run operational:hitl:reviewer-worksheet
```

생성되는 `vision-operational-common-agent-handoff-packet/v1`은 현재 차단
작업, 담당 owner, Common Agent 액션 코드, 원본 artifact 경로, 안전 정책을
포함한다. 이 명령은 Common Agent API를 호출하지 않으며 SQL, Graph, 모델
설정을 변경하지 않는다.

`operational:progress`는 위 Vision artifact와 Web Knowledge readiness를 묶어
`mold-master-development-progress-report/v1`을 생성한다. 이 리포트는 현재 개발
단계를 “운영 전환 전 데이터/HITL 게이트 종료 단계”, “운영자 릴리스 검토
단계”처럼 사람이 읽기 쉬운 문장으로 요약하고, software scaffold 진행률과
operational readiness 진행률을 분리해 표시한다. 이 리포트도 artifact-only이며
Graph DB, Reference store, 모델 학습에는 쓰지 않는다.

`operational:hitl:intake-status`는 남은 사람 판정 입력 큐를 라벨 충돌,
Vision pending HITL, Web Knowledge HITL로 나눠 집계한다.
`operational:hitl:action-pack`은 최신 progress report와 intake status를 묶어
`operational-hitl-action-pack/v1`을 생성한다. 이 패킷은 Common Agent/운영자가
처리할 action step, 담당 owner, pending 수량, 다음 명령, operator instruction을
한 번에 제공하지만, 여전히 artifact-only이며 외부 서비스 쓰기와 Graph/Reference/
모델 학습을 모두 금지한다.

`operational:hitl:prepare-plan`은 action pack의 명령을 다시 분리해
`decision-template`과 `review-guide`처럼 사람이 작성하기 전에 안전하게 생성할
수 있는 준비 명령만 `preparationCommands`로 모은다. `verify-decisions`,
`apply`, `approve`, `authorization-bridge`류 명령은 사람이 판정 파일을 채운
뒤에만 실행할 수 있도록 `humanGatedCommands`로 격리한다.

`operational:hitl:prepare-run`은 `preparationCommands` 중 allowlist된 6개
template/guide 생성 명령만 Node 스크립트로 직접 실행하고
`operational-hitl-preparation-run/v1` manifest를 남긴다. 셸 실행은 사용하지
않으며, `verify-decisions`, `apply`, `approve` 계열 명령은 자동 실행하지 않고
`skippedCommands.reason=human_decision_required`로 기록한다.

`operational:hitl:decision-review-packet`은 준비된 3종 decision template를 읽어
`operational-hitl-decision-input-review-packet/v1`을 만든다. 각 큐의 작성 대상
수량, `action=pending` 상태, 필수 입력 필드, 검증 명령, 우선순위를 한 장으로
정리해 사람이 판정 파일을 채우기 전에 누락을 줄인다. 이 단계도 artifact-only라
Common Agent, SQL, Graph DB, Reference store, 모델 학습에는 쓰지 않는다.

`operational:hitl:reviewer-worksheet`는 위 입력 검토 패킷을 사람이 읽기 쉬운
Markdown 워크시트로 변환한다. 큐별 우선순위, 결정 ID 미리보기, 필수 필드,
허용 action, 검증 명령, 공통 체크리스트를 포함해 실제 HITL 판정자가 JSON
템플릿을 채우기 전에 빠르게 확인할 수 있다. 이 워크시트도 자동 승인, 적용,
Graph/Reference/Model 승격을 수행하지 않는다.

현재 차단 작업이 남아 있으면 `status=blocked`,
`manualImportAllowed=false`, `allowGraphPromotion=false`,
`allowModelActivation=false`로 저장된다. 모든 작업이 닫히고 운영자 수동
승인까지 완료된 후에도 자동 쓰기는 금지되며, Common Agent 쪽에서는 이
패킷을 승인된 학습 데이터가 아니라 검토 artifact로 취급해야 한다.

## 승인 라벨 충돌 검토 패킷

운영 readiness의 1순위 blocker가 `resolve_label_conflicts`이면 다음 명령으로
사람 검토용 충돌 목록을 먼저 만든다.

```powershell
npm run vision:label-conflicts:packet
```

생성되는 `vision-approved-label-conflict-review-packet/v1`은 각 충돌 그룹의
case id, content hash, 후보 라벨, 허용된 결정 옵션을 포함한다. 허용 옵션은
정답 라벨 유지, 전체 needs_review 전환, rejected 전환, 재촬영 요청이며 자동
정정은 없다. 이 패킷도 `serviceWritesPerformed=false`이고 Graph promotion,
reference learning, model training을 모두 금지한다.

충돌 그룹별 사람 판정 파일은 다음 템플릿으로 시작한다.

```powershell
npm run vision:label-conflicts:decision-template
```

생성되는 `vision-approved-label-conflict-decisions/v1` 템플릿은 각 충돌을
`action=pending`으로 두고, 후보 라벨, 영향 case id, content hash, 허용 action을
보존한다. 정답 라벨을 유지하려면 `keep_label`, `selectedLabel`,
`imageSetConfirmed=true`, `labelConfirmed=true`, 판정 시각, 검토 코멘트를
채워야 한다. 근거 부족은 `mark_needs_review`, 부적합은
`reject_conflicting_cases`, 입력 품질 부족은 `request_recapture`로 분리한다.

작성된 판정 파일은 다음 명령으로 검증한다.

```powershell
npm run vision:label-conflicts:verify-decisions -- --decisions <vision-label-conflict-decisions.json>
```

검증 보고서는 `vision-approved-label-conflict-decision-verification-report/v1`이며
충돌 그룹, hash, case id, 후보 라벨, reviewer id, 판정 시각, 코멘트를 모두
검증한다. 결과가 `ready_for_manual_import`여도 Graph DB, Reference store,
모델 학습에는 직접 쓰지 않고 `importPlan`만 만든다. 따라서 approved 라벨
충돌은 사람이 확정하기 전까지 계속 운영 readiness blocker로 남는다.

검증된 판정을 로컬 approved fixture에 반영하기 전에는 항상 dry-run으로 계획을
확인한다.

```powershell
npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json>
```

문제가 없고 사람이 반영을 승인한 경우에만 `--apply`를 붙인다.

```powershell
npm run vision:label-conflicts:apply -- --verification <vision-approved-label-conflict-decision-verification-report.json> --apply
npm run migration:verify-post-hitl
```

`vision-approved-label-conflict-decision-apply-report/v1`은 선택 라벨 유지,
superseded case의 `needs_review` 격리, rejected, 재촬영 요청을 local fixture와
manifest에만 반영한다. 이 단계도 외부 서비스, Graph DB, Reference store, 모델
학습에는 쓰지 않으며, 이후 `migration:verify-post-hitl`로 충돌 blocker가 닫혔는지
다시 확인해야 한다.

## 미해결 HITL 후보 검토 큐

라벨 충돌과 별개로, Vision source label과 모델 관찰이 서로 일치하지만 아직
사람이 승인하지 않은 고신뢰 후보는 다음 명령으로 Common Agent 검토 큐
패킷으로 정리한다.

```powershell
npm run vision:hitl:pending-packet
```

생성되는 `vision-pending-hitl-review-queue-packet/v1`은 승인 manifest에 이미
반영된 hash를 제외하고 남은 `agreement_high_confidence` 후보만
`pending-hitl-001` 같은 queue item으로 만든다. 각 항목은 결함명, 결함 class,
content hash, 출처, Vision 요약, 허용 결정 옵션을 포함한다.

현재 PC artifact 기준 검증 결과는 `status=action_required`,
`pendingHighConfidence=12`, `resolvedHighConfidence=6`이다. 이 패킷도
Common Agent API를 직접 호출하지 않으며 `serviceWritesPerformed=false`이다.
사람 승인 전에는 Graph promotion, reference learning, model training이 모두
금지된다.

검토자가 채울 판정 입력 파일은 다음 명령으로 생성한다.

```powershell
npm run vision:hitl:decision-template
```

생성되는 `common-agent-hitl-review-decisions/v1` 템플릿은 모든 항목을
`action=pending`으로 시작한다. 승인하려면 항목별로 `approve_candidate`를
선택하고 원본 제조 이미지 확인, 최종 라벨 확인, 판정 시각, 검토 코멘트를
채워야 한다. 근거가 부족하면 `mark_needs_review`, 부적합하면
`reject_candidate`, 추가 촬영이 필요하면 `request_recapture`를 선택한다.

Common Agent 또는 사람이 판정 결과 파일을 반환하면 다음 명령으로 먼저 검증
보고서를 만든다.

```powershell
npm run vision:hitl:verify-decisions -- --decisions <common-agent-hitl-decisions.json>
```

판정 파일이 아직 없으면 같은 명령은 `awaiting_human_review` 보고서를 만든다.
검증 보고서는 `vision-pending-hitl-decision-verification-report/v1`이며 승인,
보류, 반려, 재촬영을 각각 manual import plan으로 분리한다. 승인 판정도 원본
이미지 확인, 최종 라벨 확인, reviewer id, 판정 시각, 검토 코멘트가 없으면
거부된다. 이 단계 또한 자동 import가 아니며 `serviceWritesPerformed=false`,
`autoApplyAllowed=false`를 유지한다.

검증 보고서가 `ready_for_manual_import`가 된 뒤에는 승인 후보만 기존 live
approval 입력 파일로 변환한다.

```powershell
npm run vision:hitl:authorization-bridge -- --decision-verification <vision-pending-hitl-decision-verification-report.json>
```

생성되는 `vision-pending-hitl-authorization-bridge/v1`은 `approve_candidate`
판정만 `I_CONFIRM_EACH_IMAGE_AND_LABEL` authorization으로 옮긴다. 보류,
반려, 재촬영 판정은 승인 파일에 섞지 않고 `nonApprovalDecisions`에 남긴다.
브리지 단계도 `serviceWritesPerformed=false`이며 Common Agent, Graph DB,
reference learning, model training을 직접 변경하지 않는다.

보류, 반려, 재촬영 판정을 운영자가 별도 처리할 수 있도록 다음 no-write
worklist를 생성할 수 있다.

```powershell
npm run vision:hitl:non-approval-worklist -- --decision-verification <vision-pending-hitl-decision-verification-report.json>
```

생성되는 `vision-pending-hitl-non-approval-worklist/v1`은
`mark_needs_review`, `reject_candidate`, `request_recapture`만 포함하며 승인
후보는 의도적으로 제외한다. 각 항목은 담당 owner, 다음 조치, 요청 촬영 시점,
content hash, reviewer comment를 보존한다. 이 worklist도 artifact-only이며
`serviceWritesPerformed=false`, `allowGraphPromotion=false`,
`allowReferenceLearning=false`, `allowModelTraining=false`를 유지한다.

실제 승인 반영은 생성된 authorization 파일을 운영자가 확인한 뒤에만 별도
실행한다.

```powershell
npm run vision:hitl:approve -- --authorization <vision-hitl-authorization-from-decisions.json>
```

판정 보고서가 아직 `awaiting_human_review`, `partial_human_review`,
`invalid_decisions` 상태이거나 승인 hash가 review packet manifest와 맞지 않으면
브리지는 authorization을 만들지 않고 fail-closed 상태로 종료한다.

`npm run vision:operational:readiness`는 최신 HITL queue, decision template,
decision verification artifact를 자동으로 찾아 `gates.hitlWorkflow`에 요약한다.
`npm run vision:operational:worklist`의 `close_hitl_reviews` 작업과 Common
Agent handoff item에도 같은 `workflowStatus`가 포함되므로, 운영자는 현재 단계가
템플릿 생성인지, 판정 작성인지, 판정 검증인지 바로 확인할 수 있다.
Settings의 `비전 릴리스 게이트` 안 `Vision 운영 작업 목록`에도 `HITL Workflow`
카드가 표시되며 queue/template/pending/error 카운트, 다음 명령, 자동 적용 금지
정책을 함께 보여준다.

승인 라벨 충돌도 같은 방식으로 최신 conflict packet, decision template,
decision verification, apply report를 `gates.labelConflictWorkflow`에 요약한다.
`resolve_label_conflicts.workflowStatus`와 Settings의 `Label Conflict Workflow`
카드는 충돌 수, 템플릿 수, 검증 수, 미해결 수, apply 계획/반영 수, 다음 명령을
표시한다. 사람이 `--apply`를 승인하기 전에는 dry-run 상태로 멈추며, 로컬 fixture
반영 후에도 다음 단계는 반드시 `npm run migration:verify-post-hitl`이다.

## 수동 문서 중앙 소유권

상단 `Common Agent Docs` 또는 AI 어시스턴트의 `문서 업로드`에서 추가한
문서는 Common Agent에만 등록된다.

- 등록: `POST /v1/workflows/ingest-file`
- 삭제: `DELETE /v1/documents/{document_id}?confirm=true&delete_graph=true`
- 화면 목록: 파일명과 Common Agent `document_id`의 로컬 포인터만 저장
- 로컬 Vector Store: 기존 행은 롤백 근거와 오프라인 읽기용으로 보존
- 금지: 정상 UI에서 로컬 임베딩 생성, 벡터 추가, 벡터 삭제

중앙 등록이 실패하면 문서를 로컬 전용 지식으로 저장하지 않고 오류로
표시한다. 따라서 같은 문서가 Common Agent와 로컬 Vector Store에 서로 다른
버전으로 중복 존재하지 않는다.

검증 명령:

```powershell
npm run test:electron:chat
npm run test:electron:central-docs
```

성공 기준은 Graph 증거가 1개 이상이고, 중앙 문서 등록·삭제 동안 로컬 벡터
행 수가 변하지 않으며, `Renderer console errors`가 0인 것이다.
