# Vision Recapture Lineage Metadata TDD

작성일: 2026-07-27

## 목적

재촬영 요청 후 fresh image가 Common Agent로 올라갈 때 원본 recapture 요청과
연결되지 않으면, later HITL/자가학습 단계에서 어떤 오류를 해결하기 위한 사진인지
추적할 수 없다. 이번 단계는 fresh recapture image의 capture metadata에 원본 이미지,
원본 Common Agent image, review decision, safety reason, 요청 view를 보존하는
lineage 계약을 추가한다.

## 사용자 여정

품질 담당자는 weak bbox 때문에 재촬영한 새 사진이 원본 오진/보류 요청과 연결되어,
Common Agent와 Graph 학습 큐에서 “이 새 사진은 어떤 recapture 요청을 만족하는가”를
추적할 수 있기를 원한다.

## RED

`tests/captureSessionProtocol.test.js`에 다음 보장을 추가했다.

- `recaptureSource`가 있는 image의 `buildCaptureMetadata()` 결과는
  `recapture_lineage_protocol_version=vision-recapture-lineage/v1`을 포함해야 한다.
- 원본 local image id, 원본 Common Agent image id, review decision id를 보존해야 한다.
- bbox safety reason, required additional views, bbox grounding profile id를 metadata로
  내보내야 한다.

초기 실행 결과:

```text
npm run test:capture-session

AssertionError: actual undefined expected 'vision-recapture-lineage/v1'
tests 14, pass 13, fail 1
```

## GREEN

구현 내용:

- `captureSessionProtocol.js`의 `buildCaptureMetadata()`가 `image.recaptureSource`를
  감지하면 `vision-recapture-lineage/v1` metadata를 생성한다.
- `types.ts`의 `CapturedImage`에 선택적 `recaptureSource` 계약을 추가했다.
- 기존 capture session metadata는 그대로 유지하고, recaptureSource가 있을 때만
  lineage 필드를 추가한다.

## 검증

```powershell
npm run test:capture-session
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

현재 결과:

- `test:capture-session`: 14/14 PASS
- `test:contracts`: 63/63 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 후속 완료

2026-07-27 `vision-recapture-lineage-source-handoff.tdd.md`에서 HITL
`recapture` 결정 후 다음 신규 화면 캡처, 카메라 촬영, 모바일 업로드, 파일
업로드, 드래그 앤드 드롭 이미지에 `recaptureSource`를 자동 주입하는 연결
단계를 완료했다.
