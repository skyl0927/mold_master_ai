# 사출 결함 Web Case HITL 파이프라인

## 현재 상태

- 기준 수집 폴더: `artifacts/web-injection-defect-cases-20260724T081612`
- 후보 카드: 43건
- 정규화 결함 클래스: 22개
- 기술 문헌 카드: 24건
- 라이선스 이미지 카드: 19건
- 대책 섹션 표식 및 중복: 0건
- 카드 스키마 오류: 0건
- 이미지 SHA-256 불일치: 0건
- Common Agent 비저장 단건 검증: 43/43 통과
- Common Agent 최저 품질점수: 92
- 운영 HITL 승인: 0건
- 운영 Common Agent 후보 적재: 0건
- 운영 Graph 승인 승격: 0건

마지막 세 항목은 의도된 상태다. 자동 수집 또는 자동 완성은 사람 승인을 대신하지 않으며, 검토자가 앱에서 카드를 직접 확인하기 전에는 중앙 저장과 Graph 승격이 실행되지 않는다.

## 데이터 출처

- BASF `Injection-Molding Problems in Engineering Thermoplastics`의 24개 결함 항목은 인용 전용으로 저장한다.
- Wikimedia Commons의 15개 시각 자료와 MDPI/PMC의 4개 도판은 저자,
  라이선스, 원본 URL, 비철회 상태를 확인하고 로컬 사본 해시를 저장한다.
- 기술 문헌의 원인과 권고사항은 PDF 좌우 열 위치를 기준으로 연결한다.
- 외부 이미지는 HITL 라벨 확인 전까지 `visionBenchmarkEligible=false` 상태를 유지한다.
- 외부 이미지 사례는 Graph/RAG 텍스트 근거를 보강하지만 Mold Master Vision 정확도 표본을 자동 충족하지 않는다.

## 앱 사용 절차

1. Mold Master AI에서 `DATABASE TREE`를 연다.
2. `Web Case HITL` 탭을 선택한다.
3. 결함명, 현상, 원인, 출처와 이미지 라이선스를 확인한다.
4. 영문 서술은 `한글 번역 후 삽입`으로 문제, 현상, 상세 원인, 확인
   항목과 대책의 한글 검토본을 만든 뒤 직접 교정한다.
5. 원인 라벨, 확인 항목, 대책, 검토자와 검토 의견을 입력한다.
6. 명시적 확인 체크 후 `HITL 승인`, `수정 필요`, `반려` 중 하나를 저장한다.
7. 승인 카드에서 `Common Agent 비저장 검증`을 실행한다.
8. 품질 게이트 통과 후 `후보 적재`를 실행한다.
9. 두 번째 확인 체크 후 `중앙 승인 + Graph 활성화`를 실행한다.
10. `Graph 왕복 검증`으로 `graph_approved_only` 답변과 승인 근거 경로를 확인한다.

원문 카드 내용이 바뀌면 저장된 승인 해시가 달라져 기존 승인은 자동으로 무효화된다. 동일 해시의 후보를 다시 적재하면 로컬 적재 원장이 중복 요청을 차단한다.

## Vision HITL 후보 연결

라이선스 이미지 카드에서 결함군 최소 표본을 먼저 채우고, 남는 이미지는
전체 20개 표본 게이트의 보충 후보로 준비할 수 있다.

```powershell
npm run vision:candidates:sync-web
npm run vision:review-packet
npm run vision:review-packet:audit
```

현재 승인 fixture 기준으로 `short shot 2`, `burn 3`, `flash 3`,
`sink 3`, `weld line 1`의 재사용 가능 이미지 열두 건이 선택됐다.
웰드라인 Figure의 첫 감사에서는 신규 Vision 호출 한 건만 실행됐고,
최신 전체 표본 보충 패킷에서는 신규 3건만 호출하고 기존 32건은
SHA-256 기준으로 재사용했다. 열두 건 모두
원문 라벨과 Vision 제안이 일치했지만 사람 승인 전에는 SQL, Graph,
학습 데이터에 기록되지 않는다.

## 중앙 상태 전이

```text
web candidate
  -> local HITL approved
  -> Common Agent template validation
  -> Common Agent document candidate
  -> document feedback approve
  -> SQL document bundle approved
  -> Neo4j document bundle approved
  -> Mold Master graph_approved_only roundtrip
```

후보 적재 시 Common Agent Graph에 후보 노드가 생성될 수 있지만 승인 검색 정책에는 포함되지 않는다. `/v1/feedback`의 문서 승인 후 SQL과 Graph review 상태가 함께 `approved`인지 문서 상세 API로 다시 확인한다.

## 검증 명령

```powershell
npm run test:web-knowledge
npm run knowledge:web:audit
npm run knowledge:web:validate-common-agent
npm run test:electron:web-knowledge-hitl
```

`knowledge:web:validate-common-agent`는 저장하지 않는 스키마 준비도 검사다. 사람 승인, 후보 적재, Graph 승격을 생성하지 않는다.

## 감사 파일

- 수집 보고서: `artifacts/web-injection-defect-cases-20260724T081612/collection-report.json`
- Common Agent 비저장 검증: `artifacts/web-knowledge-common-agent-validation.json`
- 카드 내용 품질 감사: `artifacts/web-knowledge-quality-audit.json`
- Electron 왕복 화면: `artifacts/electron-web-knowledge-hitl.png`
- 운영 HITL 원장: Electron `userData/web-knowledge-review-decisions.json`
- 운영 중앙 적재 원장: Electron `userData/web-knowledge-central-ingestions.json`

## 보안 및 제한

- 크롤러는 HTTPS와 허용 호스트 목록, robots 정책, 호스트별 속도 제한, 제한된 재시도를 적용한다.
- Wikimedia 라이선스는 HTML 문구 추정이 아니라 공식 `imageinfo/extmetadata` API로 확인한다. 정확한 Commons API 호스트·경로·조회 동작만 API 모드로 허용하고 일반 웹 경로는 계속 robots 정책을 따른다.
- MDPI 도판 4건은 논문 원문, 저자·문헌 인용, CC BY 4.0, 서로 다른
  PMC 오픈액세스 원장 ID와 비철회 상태를 함께 보존한다.
- 현재 PC의 `NODE_TLS_REJECT_UNAUTHORIZED=0` 환경은 수집 보고서에 보안 경고로 기록된다. 사내 인증서 체인을 Node 신뢰 저장소에 등록한 뒤 이 설정을 제거해야 한다.
- BASF 원문은 저작권 자료이므로 전문 복제 없이 인용 메타데이터와 제한된 근거 문장만 사용한다.
- 원인 라벨과 확인 항목 자동 제안은 검토 편의 기능이며 승인 판정이 아니다.
