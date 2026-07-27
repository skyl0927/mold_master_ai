# Vision Pending HITL Review Queue Packet TDD

작성일: 2026-07-27

## 목적

post-HITL 검증에서 남은 고신뢰 Vision 후보를 Common Agent/HITL이 바로
검토할 수 있는 큐 패킷으로 변환한다. 이 패킷은 자동 승인이나 DB 쓰기를 하지
않고, 사람이 승인·보류·반려·재촬영 결정을 내릴 대상만 안전하게 식별한다.

## RED

테스트 파일: `tests/visionPendingHitlReviewQueuePacket.test.js`

처음에는 `visionPendingHitlReviewQueuePacket` 모듈이 없어 실패하도록
정의했다.

```powershell
node --test tests\visionPendingHitlReviewQueuePacket.test.js
```

기대 실패:

```text
Cannot find module '../visionPendingHitlReviewQueuePacket'
```

## GREEN

구현 파일:

- `visionPendingHitlReviewQueuePacket.js`
- `scripts/build-vision-pending-hitl-review-queue-packet.js`

검증 기준:

- 이미 승인 manifest에 있는 고신뢰 후보는 큐에서 제외한다.
- 미승인 `agreement_high_confidence` 후보만 `pending-hitl-NNN` 항목으로
  변환한다.
- 라벨 충돌 또는 저신뢰 후보는 이 큐에 섞지 않는다.
- `serviceWritesPerformed=false`를 유지한다.
- Graph promotion, reference learning, model training은 사람 승인 전까지
  금지한다.
- review packet이 없으면 `missing_review_packet`으로 fail-closed 처리한다.

## 실제 운영 데이터 확인

현재 PC artifact 기준 실행:

```powershell
npm run vision:hitl:pending-packet -- --output .tmp-tests\vision-pending-hitl-review-queue-packet.json
```

확인 결과:

```text
status=action_required
pendingHighConfidence=12
resolvedHighConfidence=6
skippedNonHighConfidence=17
matchesPostHitlReport=true
serviceWritesPerformed=false
```

해석: 비전 진단 소프트웨어 안전 레일은 계속 동작하지만, 운영 승격 전에는
이 12건을 사람이 승인/보류/반려/재촬영 중 하나로 닫아야 한다.
