# Process Matrix Integration

## Source Workbook

- `PROCESS(IN-HOUSE)`: in-house process descriptions
- `PROCESS(SET)`: set/milestone-oriented process descriptions
- `Matrix(AUTOMOBILE)`, `Matrix(LAMP)`, `Matrix(TV)`: product-group-specific issue matrix

## What the matrix gives us

Each matrix row can be normalized into:

- `productGroup`: AUTOMOBILE / LAMP / TV
- `processGroup`: e.g. 취출성, 외관
- `issueFamily`: e.g. 로봇 취출 가능, 수축 / 자국, Gate
- `issueName`: concrete issue hypothesis
- stage checks:
  - `designChecks`
  - `machiningChecks`
  - `assemblyChecks`
  - `measurementChecks`
  - `trialChecks`
- `commonActions`

## Why it is valuable

This workbook is stronger than plain RAG text because it already encodes:

- product family context
- process-stage ownership
- likely issue hypotheses
- stage-specific verification points
- common downstream actions

That means it can upgrade both:

1. internal DB
2. graph reasoning

## Recommended DB usage

Store normalized rows in `knowledge_matrix`.

Recommended retrieval boosts:

- filter by `productGroup`
- filter by `processGroup`
- match `issueFamily` and `issueName`
- expand answer context with stage-specific checks for the active department

## Recommended Graph usage

Build nodes and edges in this pattern:

- `ProductGroup -> HAS_PROCESS_GROUP -> ProcessGroup`
- `ProcessGroup -> HAS_ISSUE_FAMILY -> IssueFamily`
- `IssueFamily -> HAS_ISSUE -> Issue`
- `Issue -> REQUIRES_*_CHECK -> StageCheck`
- `Issue -> RECOMMENDS_ACTION -> CommonAction`

This graph is especially useful for:

- path-based explanation
- process-aware troubleshooting
- routing recommendations to design/machining/assembly/measurement/trial
- multi-hop search from defect to responsible process checks

## Added in this repo

- SQLite table scaffold in [`database.js`](/I:/AI%20TEAM%20PJT/AI%20PROCESS%20MASTER/mold-master-ai%20%288%29/database.js)
- IPC bridge for import/read in [`main.js`](/I:/AI%20TEAM%20PJT/AI%20PROCESS%20MASTER/mold-master-ai%20%288%29/main.js) and [`preload.js`](/I:/AI%20TEAM%20PJT/AI%20PROCESS%20MASTER/mold-master-ai%20%288%29/preload.js)
- extraction script [`extract-process-matrix.ps1`](/I:/AI%20TEAM%20PJT/AI%20PROCESS%20MASTER/mold-master-ai%20%288%29/scripts/extract-process-matrix.ps1)

## Execution

Example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\extract-process-matrix.ps1 `
  -WorkbookPath "D:\...\Process_Flow_Diagram_Rev02_25Y_Final_V3.xls" `
  -OutputDir ".\data\generated"
```

Outputs:

- `process-matrix-knowledge.json`
- `process-matrix-graph-seed.json`
