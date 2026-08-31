# Physical Five-Image Vision No-Write and Timeout Verification

Date: 2026-08-31

## User Journey

1. Load five 2992 x 2992 physical-product photographs.
2. Separate four same-part views from one visually different marked-edge image.
3. Run Common Agent Vision and Graph retrieval with `persist_mode=never`.
4. Confirm that neither dataset records nor image files change.
5. Verify that the Electron UI can submit and render the multi-view result.

## RED

`npm run test:contracts` reproduced four failures out of 343 tests:

- Initial Vision diagnosis used `classifiable_only` instead of `never`.
- The API service defaulted to `classifiable_only` instead of `never`.
- An explicit operation timeout was ignored in favor of 45 seconds.
- The direct OpenAI client timeout was only 20 seconds.

The existing Electron multi-view smoke test also failed because it still expected the old always-expanded capture fields and reused the operator profile.

## GREEN

- Initial Vision diagnosis explicitly sends `persist_mode=never`.
- The Vision API timeout is 180 seconds and honors a shorter explicit override.
- The direct OpenAI client timeout is 120 seconds.
- Ephemeral responses do not retain Common Agent image IDs unless persistence is explicitly confirmed.
- The Electron smoke test uses an isolated `--user-data-dir` and follows the current `capture -> phenomenon -> analysis` tab flow.
- The Electron smoke test asserts `persist_mode=never` in the actual multipart form.

## Verification Evidence

- `npm run test:contracts`: 343 passed.
- `npm run test:benchmark`: 43 passed.
- `npm run test:inspection-card`: 3 passed.
- `npm run build`: passed.
- `npx tsc --noEmit --allowJs false`: passed.
- `node scripts/electron-multimodal-diagnosis-smoke.js`: passed with two views, one supplementary file, zero console errors, multi-view fusion, Graph cross-validation, and HITL controls rendered.
- Full `tsc` with JavaScript enabled remains blocked by a binary JavaScript file under an old packaged artifact, not by application source.

## Physical Image Result

The four same-part views produced `needs_review` with a disagreement score of `0.7176`. The leading candidates were surface delamination or tearing (`0.6461`), flash or burr (`0.6266`), and surface scratch (`0.5027`). No approved Graph path was found, so automatic finalization correctly remained blocked.

The marked-edge photograph was evaluated separately. Foreign material or surface residue was the leading candidate (`0.56`), but the result remained unverified because focus, framing, and external markings limited defect localization.

The before/after Common Agent dataset fingerprint, record counts, and image-file count were unchanged. The runtime response explicitly reported `persisted_to_dataset=false` and `service_writes_performed=false`.

Detailed runtime evidence: `artifacts/goal-review-20260828/physical-product-five-image-no-write-20260831.json`.

## Remaining Human Gate

The leaf-shaped local damage, separate scratches, and possible rib-edge burr must not be merged into one approved label. A reviewer should confirm the primary defect and whether the marked-edge image belongs to the same physical part before any Common Agent learning or Graph promotion.
