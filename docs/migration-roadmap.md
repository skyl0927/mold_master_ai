# Mold Master AI Migration Roadmap

## Common Agent Consolidation Status (2026-07-23)

The app now treats Common Agent as the central AI, RAG, Graph, document, and HITL service.

Completed:

- image diagnosis gateway with `common_agent_primary`, `dual_validation`, and `legacy` modes
- Common Agent chat through `/v1/ask`, including session continuity and evidence traces
- approved-only Graph retrieval through `/v1/graph/paths` and Ask filters
- manual document ingest/delete through `/v1/workflows/ingest-file` and `/v1/documents/{id}`
- manual document upload/list/delete now uses the Common Agent document registry
  only; the normal UI no longer creates or mutates local vector chunks
- report draft assist and document synchronization
- corrected image review through `/v1/datasets/images/{id}/review`, with approved cases promoted to Graph
- SHA-256 duplicate-image label conflict checks before approval
- local `knowledge_matrix` migration into Common Agent SQL and Graph
- migration of 161 curated records into document `doc-f437b78c8eb2`
- 325 blocks, 141 clusters, 163 entities, and 131 relationships generated for the migrated document
- legacy Staging Manager, Graph Builder, RAG OCR, direct RAG image analysis, and the `:5001` client removed
- Electron Graph-only smoke test with 5 approved evidence hits and zero renderer console errors
- approved Graph benchmark: 20/20 passed; latest run p50 4.5s and p95 9.4s
- dual-validation scorecard export available in Settings
- non-persisting Vision/Graph benchmark through direct QA inference plus approved-only `/v1/ask`
- obsolete local image augmentation and unlabeled camera auto-collection writers removed
- in-app approved Vision dataset quality panel with source-file SHA-256 verification
- Common Agent Vision dataset manager for label editing, review hold/rejection, and approved Graph promotion
- legacy local feedback manager converted to a read-only rollback archive
- the renderer/preload `SAVE_VECTOR_STORE` path was removed while existing
  SQLite vector rows and read-only fallback retrieval were preserved
- Common Agent Vision upgraded from `gpt-4o-mini` to `gpt-5.6-terra` with
  `original` image detail; the general answer model remains independently configured
- Vision diagnosis now judges repeated texture, dominant boundary geometry, mold
  functional features, and the final defect class in that order
- diagnosis telemetry now records retrieval mode, evidence count, Graph
  grounding, LLM supplementation, selected engine, multimodal context, latency,
  fallback path, and engine-specific failure reasons
- Settings now exposes diagnosis P50/P95 latency, Graph grounding rate, average
  evidence count, context/ROI/OCR usage, selected-engine distribution, and
  recent failure summaries; the same metrics are included in the exported
  dual-validation JSON scorecard

Remaining multimodal safety gate:

- keep only the direct legacy LLM diagnosis fallback until at least 20 comparable image diagnoses are recorded
- require Common Agent success rate >= 95%, fallback rate <= 5%, and defect-name agreement >= 80%
- current approved benchmark: 1 clean comparable sample, 100% HTTP success,
  100% classifiability, 100% defect-label accuracy, and 100% approved Graph grounding
- 19 additional clean, approved samples are still required before fallback retirement
- require coverage across whitening, short shot, burn, flash, sink, weld line,
  and ejection classes, with at least two clean samples per class
- require at least 80% of samples to have Vision confidence >= 0.6 and each
  covered class to maintain at least 50% defect-label accuracy
- unclassifiable images are excluded from agreement scoring instead of being counted as disagreements
- after the gate passes, remove direct provider diagnosis and API-key settings from the normal user workflow

Do not delete local SQLite or vector data during this gate. It remains rollback evidence, not an active central reasoning source.

## Responsibility Boundary After Common Agent Integration

Keep in Mold Master:

- desktop capture, ROI selection, annotation, OCR context, and field notes
- operator-facing defect review, report preview, and export workflow
- Common Agent health/readiness display and evidence/Graph trace presentation
- local read-only candidate discovery, hash deduplication, and HITL controls
- offline-safe rollback evidence until the multimodal retirement gate passes

Own centrally in Common Agent:

- model routing and multimodal diagnosis
- SQL image/document records and canonical defect taxonomy
- hybrid RAG and approved-only Graph retrieval
- document ingestion, Knowledge Card source lineage, and evidence resolution
- review state, approval history, Graph promotion, and evaluation telemetry

Remove or keep disabled:

- the duplicate `:5001` RAG client and direct RAG image/OCR analysis
- local Staging Manager and local Graph Builder
- automatic image augmentation, unlabeled auto-collection, and direct
  self-learning writes
- duplicate local AI label persistence or Graph mutation paths

Temporary compatibility only:

- direct provider image diagnosis remains a fallback until the 20-image,
  seven-class gate passes
- local SQLite/vector stores remain read-only rollback evidence and must not
  compete with Common Agent as a reasoning source

## Goal

Stabilize the current desktop app and migrate it into a production-ready multimodal assistant with:

- image defect analysis
- domain-knowledge retrieval
- graph-aware retrieval
- human-in-the-loop curation
- self-improving feedback loops

## Current Reality

The current codebase already has useful building blocks:

- Electron desktop workflow
- image capture and annotation
- local vector-store fallback cache
- Common Agent image, document, Graph, and HITL integration
- report drafting, preview, and export
- dual-validation telemetry and evaluation tools

Common Agent is the active central path. The duplicate RAG server, Graph Builder, and Staging implementation have been removed. Only direct LLM diagnosis remains behind the gateway as a temporary multimodal fallback.

## Migration Principles

The migration should follow current best practices for 2026-style AI apps:

1. Hybrid retrieval first
   Combine keyword, vector, metadata, and graph retrieval instead of relying on a single retriever.

2. Multimodal by default
   Treat image, OCR text, annotations, and defect metadata as first-class inputs to retrieval and reasoning.

3. Retrieval orchestration over hardcoded flows
   Use a retrieval planner that decides when to use vector, graph, staging memory, or direct model reasoning.

4. Human feedback as supervised signals
   Approved edits should become curated assets, not raw auto-learning without review.

5. Eval-driven releases
   Every pipeline change should be verified against a defect benchmark set and regression metrics.

6. Graceful fallback
   If the external RAG or agent server is down, the app should still work locally with reduced capability.

## Roadmap

### Phase 0. Stabilize the runtime

Objective:
Make the current app predictable and configurable.

Tasks:

- remove hardcoded server URLs
- align type contracts across renderer, preload, and main
- make the chat RAG toggle actually change behavior
- fix build/type drift
- correct DB stats so dashboards reflect database reality
- support environment variable names that match docs and ops usage

Exit criteria:

- `npm run build` passes
- `npx tsc --noEmit` passes
- local-only chat works without the external agent server
- RAG server and agent server URLs are configurable in settings

### Phase 1. Unify retrieval orchestration

Objective:
Create one retrieval entry point for image analysis and chat.

Tasks:

- add a retrieval orchestrator service
- normalize sources into one schema: image, OCR, vector chunks, graph nodes, graph edges, approved defect cases
- support retrieval modes: `direct`, `local_rag`, `remote_rag`, `hybrid`
- attach provenance to every answer

Recommended shape:

- `services/retrievalOrchestrator.ts`
- `services/sourceAdapters/*`
- `services/provenance.ts`

Exit criteria:

- image analysis and chat call the same orchestrator
- every answer includes source attribution
- retrieval can run in local-only mode and hybrid mode

### Phase 2. Promote graph from admin tool to retrieval asset

Objective:
Use graph knowledge during reasoning instead of just storing it.

Tasks:

- define graph schema for `Defect`, `Cause`, `Countermeasure`, `ProcessParameter`, `Part`, `Machine`, `Material`, `Symptom`
- add graph retrieval queries by defect, symptom, and process relation
- fuse graph paths with vector evidence before LLM generation
- show graph evidence in UI

Recommended retrieval behavior:

- first retrieve vector chunks by semantic similarity
- then expand graph neighbors around matched defect/cause entities
- rerank combined evidence
- send compact evidence bundle to the model

Exit criteria:

- graph retrieval changes answer quality measurably
- graph evidence is visible and inspectable
- analysis results can cite both vector and graph sources

### Phase 3. Convert feedback into a curated learning pipeline

Objective:
Turn manual approval into controlled knowledge growth.

Tasks:

- separate `raw submissions`, `reviewed cases`, and `published knowledge`
- only publish approved cases into retrieval indexes
- version vector indexes and graph snapshots
- support re-index jobs and rollback

Exit criteria:

- no unreviewed item enters production retrieval
- re-index is reproducible
- every published item has reviewer metadata

### Phase 4. Add evaluation and observability

Objective:
Stop guessing whether the algorithm is working.

Tasks:

- create a benchmark dataset of representative defects
- score defect classification, root cause quality, countermeasure usefulness, citation quality
- log retrieval mode, sources used, latency, fallback path, and failure reason
- add dashboards for:
  - server health
  - retrieval hit rate
  - graph expansion usage
  - approval throughput
  - regression score trend

Exit criteria:

- each release has a measurable scorecard
- degraded server states are visible
- retrieval failures can be traced

### Phase 5. Modernize the agent layer

Objective:
Move from a single chat endpoint to a modular assistant workflow.

Tasks:

- add planner/executor pattern for complex tasks
- support substeps such as OCR, retrieval, graph expansion, report drafting, reviewer summary
- keep tools deterministic and narrow
- preserve structured outputs between steps

Suggested agent roles:

- `analysis-agent`
- `retrieval-agent`
- `graph-agent`
- `report-agent`
- `review-agent`

Exit criteria:

- multi-step workflows are traceable
- each agent step has structured inputs/outputs
- final reports cite the evidence chain

## Recommended Data Model Upgrade

Move toward a canonical evidence model:

```ts
type EvidenceItem = {
  id: string;
  sourceType: 'image' | 'ocr' | 'vector' | 'graph_node' | 'graph_edge' | 'reviewed_case';
  sourceId: string;
  title?: string;
  content: string;
  score?: number;
  metadata?: Record<string, any>;
};
```

## What To Implement First

Highest-leverage first steps:

1. Runtime stabilization
2. Unified retrieval orchestrator
3. Graph retrieval integration
4. Curated publish pipeline
5. Evaluation harness

## Work Started In This Repository

This migration has already started with:

- configurable RAG server URL
- configurable agent server URL
- chat fallback from remote agent to local LLM path
- environment key fallback cleanup
- DB stats correction groundwork
- type-contract cleanup groundwork
- Common Agent diagnosis and chat gateway
- centralized manual document lifecycle
- curated process-knowledge migration and approval
- approved-only Graph retrieval
- legacy-only isolation for duplicate admin and direct RAG features
- multimodal diagnosis context combining field description, annotations, OCR, and ROI geometry
- classifiability telemetry and a 20-sample transition gate
- Electron multipart contract smoke test for Common Agent Vision requests
- dedicated image-review contract with corrected fields, approval state, and Graph promotion
- duplicate-image SHA-256 label-conflict preflight
- Common Agent review success required before committing the local feedback state
- obsolete local augmentation and unlabeled camera auto-collection paths removed without deleting historical data
- isolated-profile Electron HITL review smoke test
- in-app Vision readiness panel showing clean approved samples, review queue, hash/label gaps, and duplicate-label conflicts
- isolated-profile Electron readiness smoke test with duplicate-file hash verification
- Common Agent dataset-manager smoke test proving conflict-blocked approval, rejection review API, and quality-gate recalculation
- in-app non-persisting Vision/Graph benchmark runner with per-user reports and configurable QA endpoint
- live Electron benchmark smoke test proving sync, QA inference, Graph grounding, and rendered gate metrics
- packaged-app benchmark verification with only four whitelisted evaluation resources
- global TLS certificate bypass removed; Electron isolation remains enabled
- Vision model and prompt regression test covering `original` image detail and
  circular mold-feature discrimination
- shared defect taxonomy used by dataset readiness, approval labels, fixture
  synchronization, benchmark scoring, and packaged evaluation resources
- API-cost-free per-class collection tracker in Settings and Dataset Control,
  including observed/validated coverage and remaining samples per class
- non-persisting Common Agent Vision label suggestions for HITL review; no SQL
  or Graph write occurs until the reviewer explicitly approves the proposed label
- unclassifiable suggestion guard: `판정 불가`, `분류 불가`, `unknown`, and `-`
  never overwrite the reviewer label or contribute defect confidence
- pre-ingest dataset quality quarantine: ordinary Mold Master diagnosis uses
  `persist_mode=classifiable_only`, so unclassifiable images still receive an
  analysis response but create neither an image file nor a dataset record
- explicit HITL correction remains the only Mold Master path using
  `persist_mode=always`; a human-approved correction can therefore enter the
  review and Graph-promotion lifecycle without weakening the automatic gate
- local manufacturing-image candidate inventory with directory selection,
  SHA-256 deduplication, existing-dataset detection, screenshot/chart warnings,
  non-persisting on-demand label suggestions, and candidate-only registration
- source files are re-hashed before AI suggestion and registration, and the
  latest Common Agent hashes are checked again immediately before upload
- Knowledge Card figure synchronization into a non-persisting source-linked
  candidate manifest; eight unique manufacturing images now retain document,
  version, slide, figure, evidence, source hash, and review-state lineage
- actual-bundle Electron verification confirms all eight standard labels and
  source badges render with zero scan-time network writes or console errors
- central-document Electron verification confirms one Common Agent ingest and
  delete, synchronized UI counts, zero local badges, unchanged vector rows, and
  zero console errors
- source-versus-Vision label reconciliation is enforced in both the renderer
  and Electron IPC before a conflicting candidate can be registered
- a read-only audit of 30 unique product-review images produced 28
  unclassifiable results and two HITL candidates, with zero SQL or Graph writes
- the two product-review candidates retain document, slide, asset, source
  label, Vision label, confidence, summary, and audit-time lineage

## Next Implementation Slice

1. Review the ten source-linked candidates in the app and approve only clear
   defect evidence after reconciling the source and Vision labels.
2. Collect at least two clean samples for the missing burn and sink classes,
   and obtain a second independent weld-line sample before validating that
   class.
3. Export the comparison scorecard from `mold-master-ai:diagnosis-comparisons:v1`.
4. Run the approved Vision benchmark after each approved batch.
5. Remove the direct provider diagnosis fallback only after the multimodal gate
   passes.

The app now captures a per-image field description and sends it with annotation,
OCR, and ROI summaries in the Common Agent Vision `question`. The comparison
scorecard records whether context was present and whether each engine returned a
classifiable defect label. Successful HTTP responses with generic or
unclassifiable labels do not satisfy the migration gate.

Multimodal request evidence:

```powershell
npm run test:electron:multimodal
npm run test:electron:transition
npm run test:electron:vision-readiness
npm run test:electron:dataset-manager
npm run test:electron:vision-benchmark
npm run test:electron:vision-candidates
npm run test:electron:vision-card-candidates
npm run test:electron:central-docs
```

The transition smoke test injects deterministic success and fallback records,
checks the rendered observability panel, exports the JSON scorecard, and verifies
that the UI and export agree on latency, Graph grounding, failure counts, and
retrieval-mode distribution with zero renderer console errors.

Multimodal retirement benchmark:

```powershell
npm run eval:vision:sync-approved
npm run eval:vision:approved
npm run migration:gate-status
npm run migration:verify-post-hitl
```

`migration:gate-status` is read-only. It combines Common Agent and QA health,
live dataset review states, approved-fixture conflicts, the latest HITL packet,
and the latest Vision benchmark into
`artifacts/migration-gate-status.json`.

`migration:verify-post-hitl` is the guarded end-to-end runner. It refreshes the
approved fixture manifest, rebuilds a preflight gate, and executes the Vision
and approved-only Graph benchmarks only when all services are online, 20 clean
unique fixtures are available, approved-label conflicts are zero, and every
high-confidence HITL hash has a terminal human review. If any condition is
missing, it writes `artifacts/post-hitl-verification-report.json` and exits
without model benchmark calls or persistent service writes. A passing Vision
score can no longer authorize fallback retirement while HITL remains
unresolved.

The in-app action `DATABASE TREE -> Vision 벤치마크 실행` now performs the
approved-fixture synchronization, live Vision/Graph benchmark, service and
dataset re-probe, HITL resolution check, and integrated gate report in one
read-only workflow. The runtime report is stored as
`vision-benchmark/latest-gate-status.json` under Electron `userData` and is
rendered with the exact blockers and next action. A high-confidence packet
candidate is considered resolved only when the same SHA-256 image has a
terminal Common Agent review state (`approved` or `rejected`); candidate or
needs-review rows remain unresolved. Dataset query failure is itself a hard
retirement blocker even when benchmark scores pass. Development Electron and
the packaged v13 executable completed this workflow with zero renderer console
errors and no automatic approvals or Graph writes.

Current measured baseline:

- live dataset snapshot (2026-07-24 after explicit HITL): 22 records
  (11 approved, 8 candidate, 1 needs review, 2 rejected)
- Common Agent approved images: 11
- duplicate-image label conflicts requiring HITL: 1 group / 2 records
  (`db23b38c...add6`: `image-6ed00c53f0ee` is `표면 결함`,
  `image-84d73acb3435` is `플래시`)
- same-image same-label duplicates excluded from independent sample counts: 1
- clean runnable fixtures: 8 of 20
- HTTP success: 100%
- classifiable response: 100% in the latest packaged v16 run
- approved Graph grounding: 100%
- reviewed defect-label accuracy: 100%
- observed required defect classes: 5 of 7
- validated defect classes with at least two independent samples: 3 of 7
  (`whitening`, `flash`, `ejection`)
- Vision confidence >= 0.6 rate: 100% in the latest packaged v16 run
- additional independent approved images required: 12
- latest non-persisting HITL packet: 35 SHA-256-verified candidates, eighteen
  high-confidence source/Vision class agreements, five class conflicts, ten
  unclassifiable images, and zero automatic approvals
- the six previously confirmed priority-one candidates remain approved and
  Graph-promoted; twelve reusable-license Web Case candidates are still pending
  human review: burn 3, short shot 2, flash 3, sink 3, and weld line 1
- the weld-line Figure first required one non-persisting Vision call; the
  latest supplemental rebuild requested three new calls and reused the other 32
  immutable SHA-256 observations
- if all twelve are independently confirmed, every class reaches at least 2/2
  and the clean approved count rises from 8 to the 20-sample gate
- HITL hash resolution: 6 of 18 resolved; unresolved priority-one candidates: 12
- a non-persisting hash-bound authorization template now resolves those exact
  twelve hashes from the live dataset and packet digest; its default pending
  state is rejected by the live approval runner before Electron or any write
- remaining class minimums: short shot 1, burn 2, sink 2, and weld line 1
- the guarded post-HITL runner currently reports
  `waiting_for_human_hitl`, skips both model benchmarks, and records
  `serviceWritesPerformed=false`
- repeatability warning: one intermediate packaged run classified the single
  short-shot fixture as unclassifiable (7/8), while packaged v16 classified all
  eight fixtures correctly; this is another reason not to retire fallback
  before more independent samples are collected
- latest development Electron retest: 7/8 passed, HTTP 100%, Graph grounding
  100%, defect accuracy 87.5%, and classifiable rate 87.5%; approved image
  `image-b00ca4a30e10` was returned as `판정 불가` at Vision confidence 0.52
- three earlier unapproved records were non-persistently audited as software
  error screenshots rather than manufacturing images; five newer records carry
  user-entered labels (`기포`, `제팅`, `흐름 자국`, `백화`, `밀핀 자국`) and
  remain candidates until explicit human review
- live pre-ingest quarantine check: an existing software-error screenshot was
  diagnosed as `판정 불가` with reported confidence 0.99, returned
  `persisted_to_dataset=false`, produced no storage file, returned 404 from the
  dataset lookup, and left the dataset count unchanged at that test snapshot
- local source audit found no additional automatically trustworthy benchmark
  images: 11 CAD views and seven process/tooling images were excluded; internal
  PPT-extracted product photographs remain HITL candidates requiring slide
  context and defect-label confirmation
- product-review audit: 30 unique embedded images, 28 unclassifiable, one
  whitening candidate, and one source-labeled weld-line candidate whose Vision
  result conflicts with the source annotation
- product-review audit persistence: zero SQL writes, zero Graph writes, zero
  auto-approvals, and zero promotions
- weld-line remains unvalidated until a reviewer resolves the label conflict
  and a second independent sample is approved

The direct provider fallback must remain enabled. The only clean sample was
reviewed as `밀핀 자국`; after the Vision-only model and geometry-first prompt
upgrade, the model independently classified the ROI as `밀핀 자국`. The minimum
20-sample requirement remains mandatory, so this one-sample recovery does not
authorize fallback removal.

Graph/RAG retirement evidence:

```powershell
npm run eval:graph
npm run graph:trace -- "리브 주변 백화 취출 딱 소리 원인 대책"
```

The benchmark report is written to `artifacts/approved-graph-benchmark-report.json`.

## Common Agent document-assist runtime verification

The central Common Agent now owns cases, report drafts, revisions, HITL review
events, and approved draft promotion. Mold Master calls the following APIs
instead of maintaining a duplicate local document-learning workflow:

- `POST /v1/cases`
- `POST /v1/report-drafts`
- `POST /v1/report-drafts/assist`
- `POST /v1/report-drafts/{draft_id}/submit`
- `POST /v1/report-drafts/{draft_id}/review`

The assist path is a four-node LangGraph workflow:
`prepare_query -> retrieve_graph_evidence -> compose_sections -> validate_draft`.
The manufacturing problem is placed before generic instructions so the bounded
Graph query terms prioritize part, defect, process, and ejection symptoms.

Live verification:

```powershell
npm run test:live:document-assist
```

The smoke requires all central API capabilities, verifies the LangGraph trace,
checks that `rib` and `whitening` are in the Graph query terms, submits the
draft, and finishes with `needs_changes`. It does not approve or promote test
content to the production Graph.

## Vision Human Review Packet Progress

The remaining fallback-retirement gate now has a consolidated in-app review
queue rather than three disconnected candidate folders.

- 23 candidates were copied after source SHA-256 verification.
- All seven required classes are represented in the candidate pool.
- All 23 received non-persisting Vision audit results.
- Six candidates have high-confidence source/Vision class agreement.
- Seven have class conflicts requiring label reconciliation.
- Ten are unclassifiable or likely normal functional images.
- Electron and the packaged v12 executable loaded all 23 manifest entries,
  enabled the six-item `1순위 사람 검토` filter by default, issued zero server
  writes, and reported zero console errors.

The app action is `DATABASE TREE -> 준비된 검토 패킷`. Each candidate now has
an explicit human-image confirmation. The reviewer may keep registration as a
separate action or use `등록 + 승인 + Graph`; an existing candidate skips
duplicate registration and uses `승인 + Graph`. A same-byte approved label
conflict blocks promotion, and a registration that succeeds before a promotion
failure remains recoverable as a candidate. The packaged smoke proved one
diagnosis write, one human approval, `promote_to_graph=true`, and zero renderer
console errors. These 23 candidates still do not count as approved benchmark
truth until a reviewer explicitly confirms and runs that action.

The user explicitly confirmed the six priority-one originals and their
Vision/Graph content on 2026-07-24. The guarded live workflow then registered,
approved, and promoted exactly those six immutable hashes. The complete audit
is stored in `artifacts/live-hitl-approval-2026-07-24T03-24-21-895Z.json`.
Separate approved-only Graph traces for whitening, short shot, flash, and
ejection are stored in `artifacts/graph-trace-approved-*.txt`; each trace
returned at least one newly approved image block, entity, or relationship.

The review queue is coverage-driven rather than file-order driven. It combines
the current approved class counts, remaining per-class quota, source/Vision
agreement bucket, suspicious-image warnings, and existing candidate status.
For the prepared packet, `1순위 사람 검토` is enabled and `전체 후보` is
selected by default. This keeps total-sample supplements visible even when
their per-class minimum is complete. `미충족 결함군만` remains available for
reviewers who want to focus only on class-coverage gaps.
This prioritization never checks the human-approval confirmation or writes to
the dataset automatically. Every card shows the class and additional approved-image count needed.

Candidate thumbnails now open a read-only original-image review dialog on
demand instead of stretching the 320 x 220 scan thumbnail. The dialog loads
the current source bytes only after the reviewer clicks, revalidates the
SHA-256 before returning them, and shows the original dimensions, source label,
Vision suggestion and confidence, Vision observation, field/source context,
review reasons, and content hash together. `Esc`, the close button, and the
backdrop all dismiss the dialog without changing a label or review state.
Development Electron and the packaged v14 executable displayed a 4000-pixel
wide source image, closed through both keyboard and button paths, produced zero
server writes, and reported zero renderer console errors.

The dialog also acts as a sequential review session over the currently visible
queue. Reviewers can move with `이전` and `다음`, see the current position, and
explicitly confirm the original image and current label. That confirmation is
shared with the underlying card but remains renderer-only; it does not call the
Common Agent until the separate approval action is pressed and all warning or
label-reconciliation gates pass. Development Electron and the packaged v15
executable preserved confirmation through `1/6 -> 2/6 -> 1/6` navigation with
zero server writes and zero renderer console errors.

After all six hashes were approved, the queue now separates resolved from
pending work: `1순위 해소 완료 6` is shown, the unresolved priority filter is
removed, and remaining coverage candidates become the default review focus.
Development Electron and the packaged v17 executable verified this post-
approval state with zero write requests and zero renderer console errors.
The shared taxonomy includes production wording such as `가스 탐/번 마크`, so
all 23 packet candidates map to the intended seven-class coverage model.

Local HITL queue decisions are persisted in
`vision-review-decisions.json` under Electron `userData`, keyed by immutable
source SHA-256. Reviewers can select a reason and use `보류` or `후보 제외`;
these decisions never create Common Agent dataset rows or Graph writes.
Excluded candidates are hidden by default but remain auditable through
`제외 포함`, and `판정 해제` restores them to the active queue. Candidate
registration and approval are blocked until a local hold/exclusion is cleared.
The restart smoke verifies exclusion persistence, default hiding, restoration,
decision clearing, and zero server writes.

### Hash-bound multi-item approval

For a controlled multi-item approval session, `npm run vision:hitl:prepare`
creates a non-persisting authorization template bound to the complete packet
digest and the currently unresolved high-confidence hashes. The resulting file
cannot be executed until a named human reviewer records an explicit decision,
original-image confirmation, final-label confirmation, timestamp, and review
comment for each retained target.

`npm run vision:hitl:approve -- --authorization <reviewed-json>` revalidates
those facts, blocks stale packets, duplicate hashes, rejected images, and
conflicting approved labels, then records every write and result in a versioned
audit file. This replaces the old hard-coded six-item approval path without
weakening the human-required policy.

## Capture Session Freshness

Desktop capture frames are scoped to one capture generation. Starting or
initiating a new region capture immediately invalidates the previous frame,
hides Mold Master capture UI, waits for the desktop to settle, and obtains a
fresh frame for every display. Completion and cancellation both clear captured
pixels. A late result from an older concurrent capture cannot overwrite the
newer frame.

`GET_CAPTURE_DATA` no longer performs an emergency desktop capture after the
overlay is visible because that fallback can recursively capture the overlay
and create the multi-level screen effect.

Verification:

```powershell
npm run test:capture
npm run test:electron:capture-fresh-frame
```

The Electron smoke displays two different marker scenes and captures them in
sequence on the same display source. Both the development runtime and packaged
v7 executable produced different frame hashes for capture one and capture two.
