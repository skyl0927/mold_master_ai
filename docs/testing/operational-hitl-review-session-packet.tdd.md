# Operational HITL Review Session Packet TDD

## 목적

`operational-hitl-review-session-plan/v1`은 사람이 검토할 row를 세션으로 나누지만,
실제 판정자는 세션별로 따로 열어볼 수 있는 CSV와 Markdown 파일이 필요하다.
`operational-hitl-review-session-packet/v1`은 세션별 검토 자료를 생성하되 원본
worktable CSV, editable JSON, Common Agent, Graph, Reference store, 모델 학습에는
아무것도 쓰지 않는다.

## RED

```powershell
node --test tests\operationalHitlReviewSessionPacket.test.js
```

초기 실패는 복합 라벨 `제팅 | 플로우마크`가 CSV에서 quote되지 않아 발생했다.
테스트는 다음 계약을 먼저 고정했다.

- 패킷은 `operational-hitl-review-session-packet/v1` 계약으로 생성된다.
- 세션별 CSV와 Markdown은 자동 적용 없이 사람 검토 전용으로 생성된다.
- 복합 라벨과 복사 보조 필드는 CSV에서 안전하게 보존된다.
- `newAction` 자동 입력, 자동 적용, Graph/Reference/Model 승격은 금지된다.
- review session plan이 없으면 `missing_evidence`로 fail-closed 처리한다.

## GREEN

```powershell
npm run test:operational-hitl-review-session-packet
```

결과: 3개 테스트 통과.

## 운영 검증

```powershell
npm run operational:hitl:review-session-packet
```

현재 artifact 기준 CLI는 최신 `operational-hitl-review-session-plan-*.json`을 읽어
다음을 생성한다.

- manifest: `artifacts/operational-hitl-review-session-packet-*.json`
- 세션별 파일 폴더: `artifacts/operational-hitl-review-session-packet-*-files`
- 세션별 CSV: `<priority>-<session-code>.csv`
- 세션별 Markdown: `<priority>-<session-code>.md`

생성된 패킷은 사람이 내용을 확인한 뒤 원본 worktable CSV에 필요한 값만 옮겨
적기 위한 보조 자료다. 이 단계는 `serviceWritesPerformed=false`이며 자동 승인,
검증 실행, Common Agent import, Graph 승격, Reference 학습, 모델 학습을 수행하지
않는다.

`operational:hitl:pipeline-status`는 최신 review session packet manifest를 읽어
검토 패킷 수와 생성 파일 수를 summary, stage trail, Markdown에 표시한다.

## Settings UI 연동

Settings의 `비전 릴리스 게이트` 영역에 `Session Packet 등록` 버튼을 추가했다.
최신 `artifacts/operational-hitl-review-session-packet-*.json` manifest를 등록하면
`Vision 운영 작업 목록` 아래에 `HITL Review Session Packet` 카드가 표시된다.

카드는 전체 row, 세션 패킷 수, 고위험 row, 생성 파일 수, 패킷 폴더, 세션별 CSV와
Markdown 파일명을 보여준다. 이 UI도 localStorage 표시 전용이며 원본 worktable CSV,
editable JSON, Common Agent, SQL, Graph, Reference store, 모델 학습에는 쓰지 않는다.

검증:

```powershell
npm run test:vision-operational-hitl-display
```

결과: Settings UI 표시 요약 테스트 18개 통과.
