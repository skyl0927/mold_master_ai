# Vision Diagnostic Reliability Card TDD

## Source Plan

Derived from the current vision advancement goal: Vision AI acts as the first diagnostic "eye", so a mistaken visual candidate must not contaminate Graph/RAG cause and countermeasure generation.

## User Journeys

1. As an operator, I want a single reliability card before report generation, so that Top-1 Vision guesses are not treated as confirmed defects.
2. As a Graph/RAG workflow, I want Vision, Graph, bbox/safety, and classifier gates summarized together, so that cause/countermeasure output is allowed only when the evidence agrees.
3. As a reviewer, I want weak or conflicting Vision evidence routed to HITL, so that incorrect samples are not promoted into Graph or model learning.

## RED Evidence

Command:

```powershell
node --test tests\visionDiagnosticReliabilityCard.test.js
```

Initial failure:

```text
Error: Cannot find module '../visionDiagnosticReliabilityCard'
```

Integration failure before wiring the card into `visionDiagnosisGuard`:

```text
TypeError: Cannot read properties of undefined (reading 'contractVersion')
```

## GREEN Evidence

Command:

```powershell
node --test tests\visionDiagnosticReliabilityCard.test.js
```

Result:

```text
tests 6
pass 6
fail 0
```

Regression command:

```powershell
npm run test:vision-diagnosis-guard
```

Result:

```text
tests 7
pass 7
fail 0
```

## Guarantees

| # | Guarantee | Test file or command | Result |
|---|-----------|----------------------|--------|
| 1 | Automatic report content is allowed only when Vision, Graph, and classifier gates agree. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |
| 2 | Reliable-looking Vision without Graph grounding requires Graph cross-check and blocks cause/countermeasure output. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |
| 3 | Weak visual evidence remains high contamination risk even when Top-1 confidence is high. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |
| 4 | Vision-Graph conflict or classifier disagreement routes to HITL and blocks LLM supplement. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |
| 5 | Non-diagnostic or rejected images block Graph retrieval and report generation. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |
| 6 | Guarded diagnosis output now carries `diagnosticReliabilityCard` for downstream report UI and audit display. | `tests/visionDiagnosticReliabilityCard.test.js` | PASS |

## Known Gaps

This card is deterministic and no-write. It does not improve the model's visual recognition by itself; it prevents unsafe downstream use of weak recognition. The next accuracy step is to feed this card into the report modal/UI and collect approved HITL outcomes as evaluation fixtures.
