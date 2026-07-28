# Operational Status Bundle Hydration TDD

작성일: 2026-07-28

## 목적

`operational-status-bundle/v1`은 새 계정, 다른 PC, 다른 agent가 작업을 이어받기 위한 상태 인수인계 파일이다. 기존에는 경로와 요약만 있어 Settings에서 각 JSON을 다시 따로 등록해야 했다.

이번 보강은 번들 안에 주요 운영 artifact 스냅샷을 함께 넣어 `Status Bundle 등록` 한 번으로 Settings 카드 상태를 복원하는 것이다. 복원은 브라우저 `localStorage` 화면 상태에만 적용되며 서버, DB, Graph, Reference, Model에는 쓰지 않는다.

## RED

테스트 파일:

```text
tests/operationalStatusBundle.test.js
```

명령:

```powershell
npm run test:operational-status-bundle
```

의도된 실패:

```text
embeddedSnapshotCount undefined
extractRestorableStatusBundleArtifacts is not a function
```

## GREEN

구현 파일:

```text
operationalStatusBundle.js
scripts/build-operational-status-bundle.js
components/SettingsModal.tsx
```

명령:

```powershell
npm run test:operational-status-bundle
npx --no-install tsc --noEmit --pretty false
npm run operational:status-bundle
```

결과:

```text
PASS 4
tsc PASS
embeddedSnapshotCount=5
```

## 보장

| # | 보장 내용 | 증거 |
|---|---|---|
| 1 | 번들은 Progress, Pipeline Status, Human Brief, Session Packet, Suggestion 스냅샷을 포함할 수 있다. | `embeds restorable source artifact snapshots for one-file Settings restore` |
| 2 | 계약 버전이 맞는 JSON만 복원 대상으로 추출한다. | `extractRestorableStatusBundleArtifacts` assertions |
| 3 | Markdown 또는 계약 불일치 snapshot은 복원하지 않고 거부 목록으로 분리한다. | `rejects unsupported or contract-mismatched status bundle snapshots` |
| 4 | CLI 생성 번들은 실제 최신 artifacts 기준 `embeddedSnapshotCount=5`를 출력한다. | `npm run operational:status-bundle` |
| 5 | Settings `Status Bundle 등록`은 복원 가능한 snapshot을 각 카드 localStorage에 저장하지만 서비스 쓰기는 수행하지 않는다. | `components/SettingsModal.tsx` import handler |
