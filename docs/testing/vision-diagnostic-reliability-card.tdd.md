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

## UI Display Follow-up

Additional user journey:

4. As an operator reading the diagnosis modal, I want the reliability card summarized in Korean before the cause/countermeasure sections, so that I can see whether the result is auto-report-ready, Graph-cross-check-only, HITL-required, or blocked.

RED command:

```powershell
node --test tests\visionDiagnosticReliabilityDisplay.test.js
```

Initial failure:

```text
Error: Cannot find module '../visionDiagnosticReliabilityDisplay'
```

GREEN command:

```powershell
npm run test:vision-diagnostic-reliability-display
```

Result:

```text
tests 4
pass 4
fail 0
```

New guarantees:

| # | Guarantee | Test file or command | Result |
|---|-----------|----------------------|--------|
| 7 | Accepted reliability cards render as low-risk Graph-grounded report guidance. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 8 | Missing Graph grounding renders as cross-check-required and blocks final cause/countermeasure guidance. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 9 | Blocked cards render as recapture-first and hide candidate trust. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 10 | Incompatible or missing cards are ignored instead of breaking the modal. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |

UI integration:

- `components/AnalysisModal.tsx` renders the display model near the top of the Vision section.
- The card shows status, contamination risk, confidence score, allowed/blocked actions, Top-K candidate lines, risk reasons, next actions, and policy/evidence badges.

## Action Gate Follow-up

Additional user journey:

5. As an operator, I want final report copy and Graph promotion approval blocked unless the reliability card is `auto_report_ready`, so that uncertain Vision output cannot become a formal report or learning signal by accident.

RED command:

```powershell
node --test tests\visionDiagnosticReliabilityDisplay.test.js
```

Initial failure after adding action policy tests:

```text
TypeError: buildVisionDiagnosticReliabilityActionGate is not a function
```

GREEN command:

```powershell
npm run test:vision-diagnostic-reliability-display
```

Result:

```text
tests 7
pass 7
fail 0
```

New guarantees:

| # | Guarantee | Test file or command | Result |
|---|-----------|----------------------|--------|
| 11 | Final report copy is allowed only when the reliability card is auto-report-ready. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 12 | Graph promotion approval is allowed only when the reliability card is auto-report-ready. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 13 | HITL, correction, recapture, and rejection actions remain available even when reliability is not ready. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |
| 14 | Missing legacy reliability cards keep existing actions available for backward compatibility. | `tests/visionDiagnosticReliabilityDisplay.test.js` | PASS |

UI action integration:

- `handleCopyReport` now fail-closes through `buildVisionDiagnosticReliabilityActionGate(..., 'copy_final_report')`.
- Admin Graph promotion approval now combines the existing Vision promotion guard with `approve_graph_promotion` reliability gating.
- The final report copy button is disabled with a tooltip when the reliability card is not ready.
