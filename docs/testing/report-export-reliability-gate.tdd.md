# Report Export Reliability Gate TDD Evidence

## Source

Derived during the Vision AI hardening plan. The user requirement is that Vision AI acts as the product-inspection "eye", so uncertain visual diagnosis must not contaminate final reports, verified local feedback, Graph promotion, or Common Agent document sync.

## User Journey

As a Mold Master AI operator, I want PPTX/XLSX/report export to respect the Vision Diagnostic Reliability Card, so that a wrong or weak Vision diagnosis cannot be written as a final defect cause/countermeasure or verified learning artifact.

## RED Evidence

Command:

```powershell
node --test tests\reportExportReliabilityGate.test.js
```

Expected RED result before implementation:

```text
Error: Cannot find module '../reportExportReliabilityGate'
```

This confirms the new export preflight contract was executed before production code existed.

## GREEN Evidence

Command:

```powershell
node --test tests\reportExportReliabilityGate.test.js
```

Result:

```text
pass 5
fail 0
```

## Guarantees

| # | What is guaranteed | Test file or command | Type | Result |
|---|--------------------|----------------------|------|--------|
| 1 | Auto-report-ready Vision cards allow PPTX export | `tests/reportExportReliabilityGate.test.js` | unit | PASS |
| 2 | Graph-cross-check-required Vision cards block final report export | `tests/reportExportReliabilityGate.test.js` | unit | PASS |
| 3 | Blocked Vision cards prevent verified write/promotion actions | `tests/reportExportReliabilityGate.test.js` | unit | PASS |
| 4 | Legacy images without a reliability card remain exportable with a warning | `tests/reportExportReliabilityGate.test.js` | unit | PASS |
| 5 | Mixed report items are flattened and the exact blocked image/section is identified | `tests/reportExportReliabilityGate.test.js` | unit | PASS |

## Implementation Notes

The preflight is connected in two places:

- `App.tsx` blocks UI-driven PPTX/XLSX generation before layout loading, report generation, Common Agent document sync, or verified mode can run.
- `services/reportService.ts` blocks direct service calls before PPTX verified feedback saving or XLSX file generation.

## Known Gaps

This gate only evaluates the reliability card already produced by the Vision/Graph pipeline. It does not improve Vision recognition accuracy by itself; that remains covered by the Vision benchmark/HITL dataset roadmap.
