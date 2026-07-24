# Evaluation Fixtures

This folder provides starter fixtures for validating the Mold Master AI retrieval and analysis flow.

## Goal

Use these cases to compare:

- visible defect classification accuracy
- cause and countermeasure keyword coverage
- retrieval mode consistency
- citation quality

For text and Graph retrieval, use the 20-case approved-only benchmark:

```powershell
npm run eval:graph
```

For the multimodal image gate, synchronize approved Common Agent images and run
the non-persisting QA Vision plus approved-Graph benchmark:

```powershell
npm run eval:vision:sync-approved
npm run eval:vision:approved
```

The sync step hashes source images and excludes duplicate pixels with conflicting
approved labels. The benchmark calls the QA Vision service directly and then
calls Common Agent `/v1/ask` with `graph_approved_only`, so evaluation runs do not
create duplicate image-dataset records.

This validates approved evidence retrieval independently from the image-classification gate. Image comparison records are exported from Settings with `JSON 내보내기`; unclassifiable images do not count as agreement samples.

## Recommended Workflow

1. Prepare an image or ROI capture for each case.
2. Enter the observed phenomenon and process conditions in the image card.
3. Run the image through the app analysis flow.
4. Compare the actual result with the expected fields in the fixture JSON.
5. Record pass/fail and notes in a separate evaluation log.

## Suggested Checks

- `defectType` matches exactly or is semantically equivalent
- `severity` is reasonable for the sample
- `possibleCauses` includes at least one expected keyword
- `countermeasures` includes at least one expected keyword
- `retrievalSummary.modeUsed` is not `direct` when local/remote knowledge should be available
- citations contain at least one relevant source when RAG is enabled
- `contextProvided` is true when field evidence was entered
- `commonAgentClassifiable` is true before counting the sample toward migration

## File Layout

- `manifest.json`: list of available cases
- `sample-defect-case.json`: starter case schema and example

Add one JSON file per defect scenario as the evaluation set grows.

## Code Hook

The app now includes [`services/evaluationService.ts`](/I:/AI%20TEAM%20PJT/AI%20PROCESS%20MASTER/mold-master-ai%20%288%29/services/evaluationService.ts) for fixture-based comparison logic.
