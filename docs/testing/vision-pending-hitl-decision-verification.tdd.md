# Vision Pending HITL Decision Verification TDD

작성일: 2026-07-27

## 목적

Common Agent 또는 사람 검토자가 반환한 HITL 판정 결과를 곧바로 Graph DB나
Vision reference store에 반영하지 않고, 먼저 hash-bound 감사 보고서로
검증한다. 승인, 보류, 반려, 재촬영 판정은 모두 queue item과 content hash에
묶여야 하며 승인 판정은 원본 이미지 확인과 최종 라벨 확인이 있어야 한다.

## RED

테스트 파일: `tests/visionPendingHitlDecisionVerification.test.js`

처음에는 `visionPendingHitlDecisionVerification` 모듈이 없어 실패하도록
계약을 정의했다.

```powershell
node --test tests\visionPendingHitlDecisionVerification.test.js
```

기대 실패:

```text
Cannot find module '../visionPendingHitlDecisionVerification'
```

## GREEN

구현 파일:

- `visionPendingHitlDecisionVerification.js`
- `scripts/verify-vision-pending-hitl-decisions.js`

검증 기준:

- queue packet에 없는 판정은 `unknown_queue_item`으로 거부한다.
- 동일 queue id 또는 동일 content hash 중복 판정은 `duplicate_decision`으로
  거부한다.
- 승인 판정은 제조 이미지 확인, 라벨 확인, queue class와 일치하는 승인
  라벨, 8자 이상의 사람 코멘트, reviewer id, 유효한 판정 시각이 필요하다.
- 보류/반려/재촬영도 사람 코멘트와 reviewer id, 판정 시각이 필요하다.
- 보고서는 `serviceWritesPerformed=false`를 유지하고 자동 import, Graph
  promotion, reference learning, model training을 모두 금지한다.

## 실제 운영 데이터 확인

현재 PC artifact 기준:

```powershell
npm run vision:hitl:pending-packet
npm run vision:hitl:verify-decisions -- --output .tmp-tests\vision-pending-hitl-decision-verification-report.json
```

판정 파일이 아직 없을 때의 확인 결과:

```text
status=awaiting_human_review
queueItems=12
decisionsReceived=0
pendingQueueItems=12
serviceWritesPerformed=false
```

해석: 현재는 검토 대상 12건이 준비되어 있지만, Common Agent/HITL 판정 결과가
아직 들어오지 않았으므로 운영 승격은 계속 차단된다.
