# Vision Bbox HITL Recapture Provenance TDD

작성일: 2026-07-27

## 목적

bbox safety gate가 재촬영을 요구해도, Common Agent와 재평가 plan이 그 사유를
잃으면 이후 HITL/자가학습 루프에서 “왜 이 이미지를 다시 찍어야 하는가”를 추적할
수 없다. 이번 단계는 weak bbox reason, bbox calibration profile, count 지표를
HITL metadata와 재평가 plan까지 전달한다.

## 사용자 여정

품질 담당자는 Vision bbox가 약해 재촬영을 요청한 경우, Common Agent 검토 기록과
재평가 plan에서 `low_region_bbox_confidence`, `overbroad_region_bbox` 같은 사유와
적용된 calibration profile을 확인하고 싶다.

## RED

다음 보장을 추가했다.

- `tests/commonAgentDocumentService.test.ts`
  - `buildVisionHitlReviewMetadata()`가 safety gate reasons, bbox grounding profile,
    bbox threshold, weak bbox count를 Common Agent metadata로 반환해야 한다.
- `tests/visionHitlReevaluationPlan.test.js`
  - recapture 대기 항목의 `reasons`가 `recapture_required`뿐 아니라 bbox safety
    reason도 보존해야 한다.
  - 재평가 항목에 `bboxGroundingProfileId`가 남아야 한다.

초기 실행 결과:

```text
npm run test:contracts

AssertionError: actual undefined expected [
  'low_region_bbox_confidence',
  'overbroad_region_bbox'
]
tests 63, pass 62, fail 1
```

```text
node --test tests/visionHitlReevaluationPlan.test.js

AssertionError: actual ['recapture_required'] expected [
  'recapture_required',
  'low_region_bbox_confidence',
  'overbroad_region_bbox'
]
tests 5, pass 4, fail 1
```

## GREEN

구현 내용:

- `services/visionHitlDecisionProtocol.ts`의 HITL metadata에 다음 필드를 추가했다.
  - `vision_safety_gate_reasons`
  - `vision_bbox_grounding_profile_id`
  - `vision_bbox_grounding_thresholds`
  - `vision_bbox_low_confidence_count`
  - `vision_bbox_overbroad_count`
  - `vision_bbox_weak_grounding_count`
- `visionHitlReevaluationPlan.js`가 recapture 항목에서 safety reason과 bbox profile
  정보를 읽고 보존한다.
- recapture 항목의 `reasons`는 `recapture_required`와 safety reason을 함께 가진다.

## 검증

```powershell
npm run test:contracts
npm run test:vision-hitl-reevaluation
npx --no-install tsc --noEmit --pretty false
npm run build
```

현재 결과:

- `test:contracts`: 63/63 PASS
- `visionHitlReevaluationPlan.test.js`: 5/5 PASS
- `tsc --noEmit`: PASS
- `npm run build`: PASS

## 남은 과제

다음 단계에서는 Common Agent 서버가 이 provenance 필드를 중앙 Graph/문서 registry에
저장하고, 재촬영된 fresh image와 원본 recapture 요청을 lineage로 연결하는지
라이브 API smoke test로 확인해야 한다.
