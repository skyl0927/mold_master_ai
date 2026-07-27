# Vision Quality Concern Recapture Gate TDD

작성일: 2026-07-27

## 목적

Vision AI는 현장 사진에서 문제 특징을 보는 눈 역할을 한다. 공급 모델이
`quality_status`를 명시하지 않고 `quality_concerns`에만 흐림, ROI 부족,
식별 불가 같은 촬영 문제를 기록하면 기존 로직은 이를 `warn`으로 처리해
후보 결함을 남길 수 있었다. 이 경우 Graph 검색과 후속 원인/대책 생성이
잘못된 시각 후보에 끌려갈 위험이 있다.

## RED

`tests/visionObservation.test.js`에 `quality_status`가 없고
`quality_concerns = ["motion blur hides the defect edge", "ROI too small..."]`
인 V2 관찰 계약을 추가했다.

실패 결과:

```text
node --test tests\visionObservation.test.js
'warn' !== 'reject'
```

## GREEN

구현 내용:

- `quality_concerns` 문자열을 정규화해 재촬영급 품질 문제를 감지한다.
- motion blur, out-of-focus, unreadable, ROI too small, low resolution,
  severe over/under exposure, strong reflection 계열 표현을 reject marker로
  처리한다.
- 한국어 표현인 초점 불량, 흔들림, 식별 불가, ROI 부족, 해상도 부족,
  심한 과노출/저노출, 강한 반사도 reject marker에 포함한다.
- reject로 승격된 관찰은 기존 `image_quality_rejected` 경로를 사용하므로
  후보 제거, Graph 후보 사용 차단, 사람 검토/재촬영 요구가 동일하게 적용된다.

## 검증

```powershell
node --test tests\visionObservation.test.js
npm run test:contracts
```

결과:

- `visionObservation`: 19/19 PASS
- `test:contracts`: 전체 계약 테스트 PASS

## 보장

| # | 보장 내용 | 테스트 | 결과 |
|---|---|---|---|
| 1 | `quality_status`가 없어도 재촬영급 `quality_concerns`는 reject로 승격된다 | `tests/visionObservation.test.js` | PASS |
| 2 | reject로 승격된 사진의 결함 후보는 폐기된다 | `tests/visionObservation.test.js` | PASS |
| 3 | Graph 후보 사용 정책은 `do_not_use_vision_candidate`가 된다 | `tests/visionObservation.test.js` | PASS |

## 운영 의미

비전 모델이 애매한 사진을 보고 자신 있게 결함명을 말하는 문제를 줄인다.
촬영 품질이 나쁘면 결함 후보를 억지로 Graph에 넣지 않고, 재촬영 또는 사람
검토로 되돌려 후속 원인/대책의 연쇄 오류를 차단한다.
