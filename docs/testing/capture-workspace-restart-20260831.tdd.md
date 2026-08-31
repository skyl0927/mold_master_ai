# Capture Workspace Restart TDD Evidence

Date: 2026-08-31

## Objective

Preserve captured source pixels, edited pixels, annotations, capture-session metadata, and recapture work-order lineage across an Electron restart. Resume only incomplete work orders and never treat a software smoke fixture as physical recapture evidence.

## RED Evidence

- `8feece8 test: require durable recapture workspace`
  - `tests/captureWorkspaceStore.test.js` failed because `captureWorkspaceStore.js` did not exist.
- `73be92a test: require restart-safe recapture workspace bridge`
  - Missing resumable-session logic and missing Main/Preload/Renderer/package contracts produced 6 intended failures.
- Initial Electron restart smoke exposed a hydration race: the second launch could run an empty sync snapshot before restored React state was committed and delete a newly stored image.
- `tests/captureWorkspaceHydration.test.js` reproduced that race by requiring sync to remain blocked until every restored image ID is present in renderer state.

## GREEN Evidence

- `9a73884 feat: persist recapture workspace images`
  - Uses content-addressed image files and an atomic manifest replacement.
  - Keeps base and rendered image bytes separate when they differ.
  - Stores work-order/session/view lineage without writing to the Common Agent dataset.
- `e8ffef9 feat: restore recapture workspace across restarts`
  - Adds Electron IPC and context-isolated Preload methods.
  - Restores cards at startup and resumes only the latest incomplete work order.
  - Serializes changed-image saves and explicit deletions.
  - Adds a hydration barrier before any renderer-driven save/delete pass.

## Verification

| Gate | Result |
| --- | --- |
| Capture workspace and session tests | 43/43 pass |
| Existing capture geometry/frame tests | 6/6 pass |
| Repository contract suite | 341/341 pass |
| Package runtime dependency audit | 1/1 pass |
| Source TypeScript check | pass (`tsc --noEmit --allowJs false`) |
| Browser bundle build | pass |
| Electron two-launch restart smoke | pass |
| Changed-module coverage | 89.49% lines, 88.89% functions |
| Secret-pattern scan | no matches |
| Lint | no project lint script is defined |

Electron restart smoke sequence:

1. Seed one governed `full_part_context` image in an isolated user-data profile.
2. Launch the app and verify the incomplete work order is restored with `defect_closeup` missing.
3. Upload the second view and verify the workspace becomes 2 images and ready.
4. Close and relaunch with the same profile.
5. Verify both images remain, the work order stays ready, and the completed work order is not reopened.

Screenshot: `artifacts/electron-capture-workspace-restart.png`

Screenshot SHA-256: `796DCBE85B96C7B652AA92B129ECA270BA0BD37099309D596016F9F556BCBDD0`

## Common Agent Contract

- `/v1/vision/status`: `ready`
- Vision model: `gpt-5.6-terra`
- Prompt: `vision-diagnosis-v2`
- Image detail: `original`
- Central image dataset count: `23`
- `/v1/vision/diagnose` OpenAPI `persist_mode`: `always | classifiable_only | never`
- No-write runtime evidence SHA-256: `B9972648FE87735A5DDEE0AFB97C62970A853584A7B8F5AE4BEECE2317BE006E`
- Approved 14-case no-write shadow report SHA-256: `50E9718F8F2EB75EBB0B46D368B80D090C4F292EFD1DFD27AEB90050375C5597`

## Operational Gate

The restart smoke uses the application icon as a synthetic fixture and proves software persistence only. No new physical multi-view recapture files were found in this audit. Vision re-evaluation, Web Case 40 approval, Common Agent ingestion, Graph roundtrip, and release approval remain blocked until governed physical recapture evidence is supplied through the restored capture workflow.
