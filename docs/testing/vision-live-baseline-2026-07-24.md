# Vision Live Baseline Evidence - 2026-07-24

## 결론

현재 승인 13건은 blind Vision 운영 승격에 사용할 수 없다. 현장 설명을
Vision 질문에 포함한 구버전 실행은 Top-1 46.2%였지만 데이터 누출이므로
유효 기준선에서 제외했다. 현장 설명, 예상 라벨, Graph 지시를 제거한 중립
질문으로 재실행한 실제 운영 결과는 Top-1 0%, Top-3 7.7%였다.

## 측정 결과

| 실행 | Top-1 | Top-3 | 위험 자동 오판 | P95 경향 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| 구버전 질문 포함 실행 | 46.2% | 53.8% | 0% | 약 56초 | 데이터 누출로 무효 |
| 운영 컨테이너 중립 질문 | 0% | 7.7% | 0% | 약 43초 | HOLD |
| 엄격한 Vision V2 | 0% | 0% | 30.8% | 약 44초 | ROLLBACK |
| V3 lean differential 후보 | 0% | 0% | 7.7% | 약 43초 | HOLD |

공통 조건:

- 승인 manifest 13건
- `gpt-5.6-terra`
- Common Agent Graph 검색 `graph_approved_only`
- 촬영 프로토콜 준비도 0%
- 클래스 최소 표본 및 전체 최소 20건 조건 미달

## 발견 사항

1. 실행 중 운영 QA 서비스는 `vision_model`만 보고하고
   `vision_prompt_version`, `vision_image_detail`을 보고하지 않았다.
2. 기존 벤치마크 질문은 현장 설명과 Graph 지시를 Vision 서비스에 전달해,
   구버전 서비스가 이를 읽으면 blind 정확도가 과대평가됐다.
3. 엄격한 V2는 구조화 계약을 지켰지만 자유형 결함명을 높은 신뢰도로
   생성해 위험 자동 오판이 발생했다.
4. 일부 승인 사진은 라벨 결함이 픽셀에서 명확하지 않고 전체/근접/사선광
   시점이 없어 모델만으로 확인할 수 없다.
5. 프롬프트 확장만으로는 정확도가 개선되지 않았으므로 VLM 단독 분류
   개발을 중단하고 승인 이미지 분류기와 합의하는 구조가 필요하다.

## 적용한 안전 조치

- Vision 질문에서 현장 설명, 예상 라벨, Graph 원인·대책 지시 분리
- Graph 검색 질문은 blind 관찰 완료 후에만 현장 설명과 결합
- Vision이 생성한 원인 추측은 Graph 검색 질문에 전달하지 않음
- model/prompt/detail 계보 누락 시 release gate 실패
- Common Agent에 VLM/참조 이미지 분류기 불일치 시 Graph 검색 차단 계약 추가

## 다음 완료 조건

- 핵심 결함별 승인 다중 시점 세션 30건 이상
- 전체/근접 필수 시점 100%, 결함별 추가 시점 준비도 80% 이상
- DINOv2/SigLIP2 k-NN 기준선 비교
- 제품군·금형·카메라 분리 holdout Top-1 85%, Top-3 95%
- 선택 정확도 95% 이상, 위험 자동 오판율 1% 이하
- 동일 코호트 baseline/candidate shadow release gate 통과
