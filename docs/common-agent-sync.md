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
```

생성되는 `vision-operational-common-agent-handoff-packet/v1`은 현재 차단
작업, 담당 owner, Common Agent 액션 코드, 원본 artifact 경로, 안전 정책을
포함한다. 이 명령은 Common Agent API를 호출하지 않으며 SQL, Graph, 모델
설정을 변경하지 않는다.

현재 차단 작업이 남아 있으면 `status=blocked`,
`manualImportAllowed=false`, `allowGraphPromotion=false`,
`allowModelActivation=false`로 저장된다. 모든 작업이 닫히고 운영자 수동
승인까지 완료된 후에도 자동 쓰기는 금지되며, Common Agent 쪽에서는 이
패킷을 승인된 학습 데이터가 아니라 검토 artifact로 취급해야 한다.

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
