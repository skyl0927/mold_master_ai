# Vision Pending HITL Decision Template TDD

작성일: 2026-07-27

## 목적

미해결 Vision HITL queue packet을 Common Agent 또는 사람 검토자가 바로 채울 수
있는 판정 입력 JSON 템플릿으로 변환한다. 템플릿은 자동 승인이나 Graph/Reference
학습을 수행하지 않으며, 모든 항목은 `action=pending`으로 시작한다.

## RED

테스트 파일: `tests/visionPendingHitlDecisionTemplate.test.js`

처음에는 `visionPendingHitlDecisionTemplate` 모듈이 없어 실패하도록 계약을
정의했다.

```powershell
node --test tests\visionPendingHitlDecisionTemplate.test.js
```

기대 실패:

```text
Cannot find module '../visionPendingHitlDecisionTemplate'
```

## GREEN

구현 파일:

- `visionPendingHitlDecisionTemplate.js`
- `scripts/build-vision-pending-hitl-decision-template.js`

검증 기준:

- `vision-pending-hitl-review-queue-packet/v1`의 모든 queue item을
  `common-agent-hitl-review-decisions/v1` 템플릿 decision으로 변환한다.
- reviewer, reviewedAt, decidedAt, reviewComment는 빈 값으로 시작한다.
- 각 decision은 `action=pending`으로 시작해 검토 전 자동 승인으로 해석되지
  않는다.
- 승인 action에는 이미지 확인, 라벨 확인, 승인 라벨, reviewer, 판정 시각,
  코멘트 필드가 필요하다는 required field 안내를 포함한다.
- 템플릿도 `serviceWritesPerformed=false`, `autoApplyAllowed=false`,
  `allowGraphPromotion=false`, `allowReferenceLearning=false`를 유지한다.

## 실제 운영 데이터 확인

현재 PC artifact 기준:

```powershell
npm run vision:hitl:decision-template -- --output .tmp-tests\common-agent-hitl-review-decisions-template.json
```

확인 결과:

```text
status=template_ready
queueItems=12
decisionsPrepared=12
serviceWritesPerformed=false
```

다음 단계는 이 템플릿을 사람이 채운 뒤 다음 명령으로 검증하는 것이다.

```powershell
npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>
```
