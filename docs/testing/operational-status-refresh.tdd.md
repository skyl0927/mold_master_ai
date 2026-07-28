# Operational Status Refresh TDD

작성일: 2026-07-28

## 목적

사람이 HITL worktable CSV를 수정한 뒤에는 여러 상태 artifact를 다시 생성해야 한다. 기존에는 `worktable-import`, `session-progress`, `pipeline-status`, `progress`, `human-brief`, `status-bundle`을 사람이 순서대로 기억해야 했다.

`operational-status-refresh-run/v1`은 이 후처리 순서를 하나의 안전 runner로 묶는다. 기본 실행은 계획만 생성하며, `--execute`를 명시해야 allowlist된 no-apply 상태 갱신 명령을 순서대로 실행한다.

## 안전 경계

- `--apply` 명령은 차단한다.
- `verify-run -- --execute` 계열은 차단한다.
- 임의 shell 명령은 차단한다.
- Graph promotion, Reference learning, Model training, service write는 허용하지 않는다.
- 실행 대상은 로컬 상태 artifact 갱신 명령뿐이다.

## RED

테스트 파일:

```text
tests/operationalStatusRefresh.test.js
```

명령:

```powershell
node --test tests/operationalStatusRefresh.test.js
```

의도된 실패:

```text
Cannot find module '../operationalStatusRefresh'
```

## GREEN

구현 파일:

```text
operationalStatusRefresh.js
scripts/run-operational-status-refresh.js
package.json
scripts/run-contract-tests.js
```

명령:

```powershell
npm run test:operational-status-refresh
npm run operational:refresh-status
npm run operational:refresh-status -- --execute
```

결과:

```text
PASS 4
status=plan_ready
commandsPlanned=6
commandsExecuted=0
serviceWritesPerformed=false
status=executed
commandsExecuted=6
failedCommands=0
```

## 갱신 순서

```text
npm run operational:hitl:worktable-import
npm run operational:hitl:session-progress
npm run operational:hitl:pipeline-status
npm run operational:progress
npm run operational:hitl:human-brief
npm run operational:status-bundle
```

사람 HITL CSV 입력 후 실제 실행은 다음 명령을 사용한다.

```powershell
npm run operational:refresh-status -- --execute
```
