# Vision Observation Bbox Grounding TDD

작성일: 2026-07-27

## 목적

비전 AI가 결함명을 맞히는 것만으로는 충분하지 않다. 작업자가 “AI가 사진의
어느 부분을 보고 판단했는지” 확인할 수 있어야 HITL 수정, Graph 근거 연결,
향후 segmentation/SAM 적용이 가능하다. 이를 위해 신규 provider Vision V2
관찰 계약에 `region_bbox`를 추가했다.

## 사용자 여정

품질 담당자는 AI 진단 결과를 검토할 때 관찰 문장뿐 아니라 정규화된 결함
위치 좌표를 함께 보고 싶다. bbox가 잘못된 좌표계이거나 이미지 범위를 벗어나면
그 결과는 자동 후보로 쓰지 않고 provider 계약 오류로 차단해야 한다.

## RED

추가한 테스트는 처음에 다음처럼 실패했다.

```text
Expected observation schema required fields to include region_bbox
```

또한 provider parser는 `region_bbox`를 보존하지 않았고, Graph retrieval query에
좌표 근거가 포함되지 않았다.

## GREEN

구현 내용:

- 각 V2 observation에 필수 `region_bbox`를 추가했다.
- bbox 좌표계는 `normalized_xywh`로 고정했다.
- `x`, `y`, `width`, `height`, `confidence`를 모두 0~1 범위로 검증하고,
  `width`/`height`는 0보다 커야 한다.
- provider 응답의 bbox가 잘못된 좌표계, 범위 초과, 0 크기이면
  `provider_contract_invalid`로 fail-closed 처리한다.
- 기존 Common Agent/과거 데이터는 bbox가 없어도 정규화 가능하게 유지했다.
- Graph retrieval query에 bbox 좌표를 포함해 원인·대책 경로가 관찰 위치
  근거와 함께 검색되도록 했다.
- 분석 모달에서 각 관찰 근거의 bbox 좌표와 confidence를 표시한다.

## 검증

```powershell
npm run test:vision-structured-output
npm run test:vision-observation
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
```

결과:

- `test:vision-structured-output`: 4/4 PASS
- `test:vision-observation`: 27/27 PASS
- `test:contracts`: 62/62 PASS
- `tsc --noEmit`: PASS

## 남은 과제

현재는 모델이 bbox 좌표를 반환하고 앱이 검증·표시하는 단계다. 다음 단계는
실제 이미지 위에 bbox overlay를 그려 작업자가 클릭 검수할 수 있게 하고,
SAM 2 또는 Grounding DINO 기반 mask 후보를 별도 shadow 경로로 비교하는 것이다.
