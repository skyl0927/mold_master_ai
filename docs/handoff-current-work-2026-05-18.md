# Mold Master AI Handoff - 2026-05-18

This file is a continuation note for the next login/session/agent.

## Workspace

- Repo/workspace: `I:\AI TEAM PJT\AI PROCESS MASTER\mold-master-ai (8)`
- App type: Electron + React + TypeScript + local SQLite
- Main run command: `npm run start`
- Build check: `npm run build`
- Type check: `npx tsc --noEmit`

## Product Goal

The target system is not a generic LLM report writer. The intended architecture is:

1. Input comes from image and/or text.
2. Multimodal LLM detects the visible/typed issue and surrounding context.
3. Graph/process knowledge is the primary source for causes and countermeasures.
4. LLM knowledge is used only as supplementary reasoning when graph knowledge is incomplete.
5. HITL feedback can be approved and promoted into diagnostic knowledge, but review/status events must not pollute the diagnostic graph.

## Current External Services

- External RAG/FastAPI backend: `http://218.151.133.137:5011`
- Frontend server mentioned earlier: `http://218.151.133.137:5173`
- Runtime config file on this PC:
  `C:\Users\atechcad26\AppData\Roaming\capture-annotate-pro\apiConfig.json`
- Desired runtime config:
  - `ragServerUrl`: `http://218.151.133.137:5011`
  - `agentServerUrl`: empty string, so the app reuses the RAG backend as the single backend.

## Major Work Completed

### Graph-first analysis path

The app was changed so graph/process knowledge can drive the answer before LLM supplementation.

Key files:

- `services/graphFirstWorkflowService.ts`
- `services/aiService.ts`
- `services/retrievalOrchestrator.ts`
- `services/ragApiService.ts`
- `components/AnalysisModal.tsx`
- `types.ts`

Important behavior:

- `Graph Only` mode should produce deterministic graph-grounded output where possible.
- Hybrid analysis should prefer graph-derived issue/cause/countermeasure.
- LLM supplements only missing or weak graph fields.
- The analysis modal now shows `Graph Grounded` and `LLM Supplement` badges.

### Process matrix knowledge

The Excel process matrix was extracted into generated knowledge and graph seed files.

Key files:

- `data/generated/process-matrix-knowledge.json`
- `data/generated/process-matrix-graph-seed.json`
- `scripts/extract-process-matrix.ps1`
- `services/processKnowledgeService.ts`
- `services/graphReasoningService.ts`
- `services/knowledgeGraphSyncService.ts`

Useful test command:

```powershell
npm run knowledge:trace -- "리브 주변 백화 취출시 딱 소리 물림 대책"
```

Expected direction:

- Should rank whitening/ejection/sticking related process knowledge above generic answers.
- Previous strong match:
  `AUTOMOBILE / III core-side / whitening / ejection sticking validation`

### HITL and learning governance

The app previously promoted review/report artifacts into diagnostic graph knowledge. This created bad paths like:

```text
FIELD_FEEDBACK -> Human Review -> Report Verified -> Report Verified
```

That pollution was addressed by adding `knowledgeScope`.

Key files:

- `database.js`
- `main.js`
- `preload.js`
- `types.ts`
- `services/reportService.ts`

Important rule:

- `knowledgeScope: diagnostic` can be promoted to graph/process knowledge.
- `knowledgeScope: review_event` must remain an operational artifact and must not enter diagnostic graph retrieval.
- `Report Verified`, `Human Review`, `FIELD_FEEDBACK`, and similar status/review text should be filtered from diagnostic graph evidence.

### External graph/RAG sync

The app can push local process/HITL diagnostic knowledge to the external RAG graph backend.

Key files:

- `services/knowledgeGraphSyncService.ts`
- `components/AdminDashboard.tsx`
- `services/ragApiService.ts`

Prior sync result observed:

```text
Graph saved successfully to Neo4j
557 nodes / 554 edges
```

Admin UI contains a graph sync action: `Sync Local Graph to RAG`.

### Capture overlay work

There were regressions around region capture alignment and frozen screen behavior.

Key files:

- `main.js`
- `components/RegionSelector.tsx`
- `overlay.html`
- `preload.js`
- `types.ts`

Current known direction:

- Capture overlay uses cached screen snapshot.
- Overlay should not recapture itself.
- Earlier bug found: overlay was opening at work-area height `1920x1032` instead of full display height `1920x1080`.
- Code was adjusted to use `display.size` and cached source dimensions.

Still worth manually validating:

- Screen remains frozen after first click.
- Selection preview aligns with mouse position.
- Cropped result matches the selected bounding box.

## Current Verification Commands

Run these after a new login/session:

```powershell
cd "I:\AI TEAM PJT\AI PROCESS MASTER\mold-master-ai (8)"
npx tsc --noEmit
npm run build
node --check main.js
node --check database.js
npm run knowledge:trace -- "리브 주변 백화 취출시 딱 소리 물림 대책"
```

Optional RAG checks:

```powershell
Invoke-RestMethod "http://218.151.133.137:5011/categories"
Invoke-RestMethod "http://218.151.133.137:5011/api/staging/list?status=pending"
```

Run app:

```powershell
npm run start
```

## Things To Watch

- The repo currently appears mostly untracked in git, so do not rely on git diff/history as the complete source of truth.
- Do not revert user/generated files unless explicitly asked.
- Some older Korean text in files is mojibake/encoding-damaged. Avoid broad text rewrites unless needed.
- Python on this PC previously lacked working `sqlite3`, and plain Node had ABI issues with `better-sqlite3`; Electron runtime is the safer DB execution context.
- External RAG `5011` is the real backend; `5173` is frontend only.
- If RAG badges show offline, check `apiConfig.json` first because missing `ragServerUrl` makes the app fall back to `127.0.0.1:5001`.
- `App.tsx` had a TypeScript predicate issue in `buildCommonAgentAnnotationPayloads`; it was fixed by explicitly typing the ROI annotation payload as `CommonAgentAnnotationRequest`.

## Next Recommended Work

1. Re-run verification commands above.
2. Open the app and confirm `RAG Online` with `http://218.151.133.137:5011`.
3. Test `Graph 추론` on an image and confirm `Report Verified` no longer appears in graph trace.
4. Test Chatbot with `RAG ON` and `Graph Only`.
5. Manually retest capture alignment on the active monitor.
6. If the external backend supports it, move the current graph-first workflow into the FastAPI/LangGraph server so the graph-first behavior is enforced server-side too.

## Last Verification Run

Verified on 2026-05-18:

```powershell
npx tsc --noEmit
npm run build
node --check main.js
node --check database.js
npm run knowledge:trace -- "리브 주변 백화 취출시 딱 소리 물림 대책"
```

Result:

- TypeScript check passed.
- Build passed.
- `main.js` and `database.js` syntax checks passed.
- Knowledge trace ranked whitening/ejection-related paths correctly.
