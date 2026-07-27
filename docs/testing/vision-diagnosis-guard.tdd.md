# Vision Diagnosis Guard TDD Evidence

## Source Plan

Derived from the Vision AI hardening plan: Vision is the system's eye, so weak or unsafe visual recognition must not finalize downstream GraphRAG diagnosis, LLM causes, countermeasures, or report fields.

## User Journey

As a quality engineer, I want weak Vision candidates to be treated as hypotheses instead of final defects, so that GraphRAG and LLM outputs cannot produce a misleading specification when the image evidence is uncertain.

## Task Report

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Weak Vision candidates may retrieve Graph context but cannot finalize diagnosis | `tests/visionDiagnosisGuard.test.js` | Unit | PASS | `npm run test:vision-diagnosis-guard` |
| 2 | Unverified LLM causes/actions are removed from specification fields when Vision is weak | `tests/visionDiagnosisGuard.test.js` | Unit | PASS | `guard removes unverified LLM causes and actions` |
| 3 | Approved Graph auto-finalization can preserve a weak Vision candidate only when Common Agent says it is safe | `tests/visionDiagnosisGuard.test.js` | Unit | PASS | `approved Graph auto-finalization preserves` |
| 4 | Blocked Vision observations stop Graph retrieval and final diagnosis | `tests/visionDiagnosisGuard.test.js` | Unit | PASS | `blocked Vision observations stop graph retrieval` |
| 5 | Common Agent Graph-missing diagnosis no longer shows the defect label as final | `tests/commonAgentDocumentService.test.ts` via `npm run test:contracts` | Contract | PASS | `Graph-missing LLM supplement never populates specification cause or action fields` |

## RED/GREEN Evidence

RED:

```text
node --test tests\visionDiagnosisGuard.test.js
Error: Cannot find module '../visionDiagnosisGuard'

npm run test:contracts
actual: '미분류 표면 결함'
expected: '판정 보류 (미분류 표면 결함 후보 검토 필요)'
```

GREEN:

```text
npm run test:vision-diagnosis-guard
pass 4
fail 0

npm run test:contracts
pass 52
fail 0
```

## Behavior

Weak Vision evidence now uses this fail-closed policy:

- `blocked`: no Graph retrieval, no LLM supplement, no final defect.
- `needs_review`: Graph cross-check can run, but LLM-only cause/action text cannot populate specification fields.
- `finalizable`: final defect/cause/action is allowed only when Vision is reliable or Common Agent Graph grounding explicitly allows auto-finalization.

## Known Gaps

This guard prevents unsafe finalization in code. It does not improve the underlying Vision model accuracy by itself; the next steps remain collecting balanced learning-ready image data and running the Vision reference benchmark gate.
