# Approved Vision No-Write Shadow Evaluation

## Scope

This work adds a blind, single-view shadow benchmark for the 14 approved Vision
fixtures that were runnable in the previous runtime-contract benchmark. It uses
Common Agent `/v1/vision/diagnose` with `persist_mode=never` and does not replace
the governed physical multiview recapture gate.

## User Journey

As an operator, I want to re-evaluate approved Vision evidence without changing
the Common Agent dataset, audit records, answer ledger, or learning state, so
that runtime and diagnosis regressions can be measured safely before physical
recapture and release approval.

## TDD Evidence

| Guarantee | Test or command | RED evidence | GREEN evidence |
|---|---|---|---|
| Only baseline-approved fixtures are selected and recapture decisions are excluded | `node --test tests/approvedVisionNoWriteEvaluation.test.js` | Missing `approved-no-write-evaluation` module | 5/5 tests passed |
| Requests are blind and explicitly use `persist_mode=never` | `builds a blind single-view request with explicit no-write mode` | Missing implementation | PASS |
| A result is operationally valid only when response attestations and dataset fingerprints agree | `accepts an approved shadow result only when all no-write invariants hold` | Missing implementation | PASS |
| Wrong `probable` predictions are counted as unsafe accepted errors | `reports probable wrong predictions as unsafe accepted errors` | Safety fields were undefined | PASS |
| Existing Vision benchmark contracts remain intact | `npm run test:benchmark` | Not applicable | 43/43 tests passed |
| Graph-missing Vision candidates cannot finalize a report | `node --test tests/visionConsensusGate.test.js tests/visionDiagnosisGuard.test.js` | Not applicable | 12/12 tests passed |

RED checkpoint commits:

- `4ef93b5 test: require approved Vision no-write shadow evaluation`
- `44d6838 test: require unsafe Vision acceptance metrics`

GREEN checkpoint commits:

- `56403f1 feat: add approved Vision no-write shadow benchmark`
- `05e99dc feat: report unsafe Vision acceptance errors`

## Live Runtime Evidence

Command:

```powershell
npm run eval:vision:approved:no-write -- `
  --output artifacts/goal-review-20260828/approved-vision-no-write-shadow-20260831.json `
  --base-url http://127.0.0.1:8000
```

Observed runtime:

- Vision model: `gpt-5.6-terra`
- Prompt: `vision-diagnosis-v2`
- Image detail: `original`
- Runtime ready: yes
- Operationally valid: 14/14
- No-write attested: 14/14
- Dataset listed count: 15 before and after
- Dataset central count: 23 before and after
- Dataset fingerprint: unchanged
- Classifiable: 7/14 (50%)
- Top-1: 0/14
- Top-3: 0/14
- Approved Graph grounded: 0/14
- Accepted predictions: 2
- Unsafe accepted errors: 2
- Unsafe error rate across all cases: 14.3%
- Unsafe error rate among accepted predictions: 100%
- Release-eligible cases: 0/14

The two unsafe accepted errors are raw Vision `probable` decisions. Both had
`graph_grounded=false` and `auto_finalize_allowed=false`. Mold Master applies
`visionConsensusGate` and `visionDiagnosisGuard` after the API response, so
these candidates are downgraded to `needs_review`; unverified causes and
countermeasures are removed before the user-facing report can be finalized.

Runtime report SHA-256:

Pre-summary response report:

`B4148E541167B5E4868C2AF395F0AAB490998573F34CF4F1BABDF6E1799CC05F`

Current report after local safety-metric summary:

`50E9718F8F2EB75EBB0B46D368B80D090C4F292EFD1DFD27AEB90050375C5597`

The report was subsequently re-summarized locally from the immutable response
rows to add the unsafe-acceptance metrics, so its current file hash differs from
the pre-summary hash above. No Common Agent request was repeated for that local
summary update.

## Final Verification

- `npm run build`: PASS
- `npx --no-install tsc --noEmit --allowJs false`: PASS
- `npm run test:contracts`: 341/341 PASS
- `npm run test:benchmark`: 43/43 PASS
- Vision consensus and diagnosis guard tests: 12/12 PASS
- Target module coverage: 97.11% lines, 100% functions
- Lint: no project lint script is configured
- Changed-file secret scan: no API key or OpenAI key pattern found

## Known Gaps And Gate Decision

The legacy approved images do not satisfy the governed capture protocol and are
shadow quality evidence only. Four physical multiview work orders remain open.
Web Case approval, Common Agent learning ingestion, Graph roundtrip evaluation,
and operational release remain locked until those physical captures are present
and the no-write multiview reevaluation passes.
