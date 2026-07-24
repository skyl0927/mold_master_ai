# Mold Master AI

Electron 기반 사출 성형 결함 분석, Graph/RAG 근거 검색, HITL 검토 및
제품 검토서·시방서 작성 도구다. Common Agent가 중앙 Vision, 문서,
SQL, Graph 및 승인 상태를 소유하고 Mold Master는 캡처와 작업자 검토
UI를 담당한다.

## Run Locally

Prerequisites: Node.js and a running Common Agent.

```powershell
npm install
npm start
```

## Common Agent sync

- Default Common Agent URL: `http://127.0.0.1:8000`
- Default Vision QA URL: `http://127.0.0.1:8103`
- Image diagnosis endpoint: `POST /v1/vision/diagnose`
- ROI annotation endpoint: `POST /v1/datasets/images/{image_id}/annotations`
- Approved-only answer endpoint: `POST /v1/ask`

See [docs/common-agent-sync.md](./docs/common-agent-sync.md) for the field test workflow.

## Verification

```powershell
npm run build
npx tsc --noEmit
npm run test:contracts
npm run test:web-knowledge
npm run test:candidates
npm run test:electron:vision-review-packet
```

Web Case 기반 부족 결함군 후보 준비:

```powershell
npm run vision:candidates:sync-web
npm run vision:review-packet
npm run vision:review-packet:audit
```

후보 생성과 Vision 감사는 비영속이다. 사람의 명시적 승인 전에는
데이터셋 또는 Graph에 기록하지 않는다.
