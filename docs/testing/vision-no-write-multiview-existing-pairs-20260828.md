# Vision no-write multiview evaluation (2026-08-28)

## Scope

- Common Agent endpoint: `http://127.0.0.1:8000/v1/vision/diagnose`
- Mode: `persist_mode=never`
- Runtime contract: `gpt-5.6-terra`, `vision-diagnosis-v2`, `original`
- Input scope: three existing same-part image pairs from slides 3, 5, and 7
- Evidence status: `provisional_pair`; these are not governed physical recapture sets
- Report: `artifacts/goal-review-20260828/vision-no-write-multiview-existing-pairs.json`

## Safety evidence

- All three calls returned `persisted_to_dataset=false` and `service_writes_performed=false`.
- Every response trace included `answer_ledger_persisted=false`, `image_dataset_persisted=false`, and `service_writes_performed=false`.
- Central dataset count stayed `23 -> 23`.
- Dataset list stayed `15 -> 15`.
- The deterministic dataset fingerprint stayed `2cb841de14a6f530a2ba7fdcbb1545ee207d6e2714c3dd0d9fab918b4a64ae41`.
- No pair is release-evidence eligible.

## Quality result

- Multiview fusion: `3/3` (`100%`)
- Expected-label Top-1: `0/3` (`0%`)
- Expected-label Top-3: `0/3` (`0%`)
- Approved Graph grounding: `0/3` (`0%`)
- Shadow pair 001, expected whitening: Vision returned edge damage or chipping and requested normal/reference views.
- Shadow pair 002, expected short shot: Vision abstained and requested normal-light, reverse-light, and normal-part comparison views.
- Shadow pair 003, expected flash: Vision abstained and requested close edge, alternate-light, cleaned-surface, and wider context views.

## Gate decision

The Common Agent no-write and multiview transport contracts are operational. The current image labels are not visually reproducible from the supplied pixels, and the Graph cannot ground the resulting open-set candidates. Do not approve, learn, import, or release these pairs. Continue with governed physical recapture and then rerun the same no-write evaluation gate.

The next required physical recapture work remains:

- `pending-hitl-007` flash: full part, defect closeup, parting-line context, edge profile
- `pending-hitl-010` burn: full part, defect closeup, fill-end context, vent context
- `pending-hitl-006` weld line: full part, defect closeup, flow-convergence context
- `pending-hitl-011` sink: full part, defect closeup, oblique light

## Verification

- `node --test tests/visionNoWriteMultiviewEvaluation.test.js`: 7 passed
- `npm run eval:vision:multiview:no-write -- --output artifacts/goal-review-20260828/vision-no-write-multiview-existing-pairs.json`: no-write gate passed, exit 0
