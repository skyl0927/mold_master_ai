# Operational HITL Preparation Run TDD

작성일: 2026-07-27

## 목적

`operational-hitl-preparation-plan/v1`은 안전 준비 명령과 사람 판정 이후 명령을
분리하지만, 운영자가 6개 template/guide 생성 명령을 수동으로 실행해야 했다.
`operational-hitl-preparation-run/v1`은 allowlist된 준비 명령만 실행하고 결과
manifest를 남겨 HITL 입력 준비를 한 단계 자동화한다.

## RED

`tests/operationalHitlPreparationRun.test.js`를 먼저 추가하고 실행했다.

```text
Error: Cannot find module '../operationalHitlPreparationRun'
```

실제 CLI 검증 중 `spawnSync npm.cmd EINVAL`도 확인되어, 테스트에 Node 직접 실행
보장을 추가했다.

```text
assert.ok(calls.every(call => call.executable === process.execPath))
```

## GREEN

추가된 계약:

- `operationalHitlPreparationRun.js`
- `scripts/run-operational-hitl-preparation.js`
- `npm run operational:hitl:prepare-run`
- `npm run test:operational-hitl-prepare-run`

검증 결과:

```text
npm run test:operational-hitl-prepare-run
tests 4, pass 4
```

실제 artifact 기준 실행 결과:

```text
status=completed
executedCommands=6
failedCommands=0
skippedHumanGatedCommands=4
generatedArtifactCount=6
serviceWritesPerformed=false
```

## 보장

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | allowlist된 template/guide 준비 명령만 실행한다. | `npm run test:operational-hitl-prepare-run` | unit | PASS | `executedCommands=3`, `skippedHumanGatedCommands=2` fixture |
| 2 | 허용되지 않은 명령이 있으면 아무 것도 실행하지 않고 fail-closed 처리한다. | `npm run test:operational-hitl-prepare-run` | unit | PASS | `status=blocked_unsafe_command`, `executedCommands=0` |
| 3 | 명령 실패 시 첫 실패 지점에서 중단하고 partial evidence를 보존한다. | `npm run test:operational-hitl-prepare-run` | unit | PASS | `status=partial_failure`, `firstFailedCommand` 기록 |
| 4 | 실제 준비 실행은 shell 없이 Node 스크립트를 직접 실행한다. | `npm run operational:hitl:prepare-run` | CLI smoke | PASS | manifest `shellUsed=false`, `generatedArtifactCount=6` |

## 알려진 운영 갭

이 명령은 template과 review guide를 생성할 뿐, 사람 판정을 대신하지 않는다.
현재 실제 manifest는 `verify-decisions`와 `apply` 계열 4개 명령을
`human_decision_required`로 건너뛰었다. 다음 단계는 사람이 첫 큐
`vision_label_conflicts` 4건의 decision file을 채우는 것이다.
