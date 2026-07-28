# Vision Capture Work Order Plan TDD Evidence

## Source

Derived from the active Vision AI hardening plan. Current benchmark evidence shows low top-k accuracy and 0% capture protocol readiness, so the next operational bottleneck is structured data capture rather than unrestricted model/Graph promotion.

## User Journey

As a quality/vision operator, I want weak Vision benchmark evidence to be converted into defect-class capture work orders, so that the team can collect the exact multi-view product images needed for safer Vision diagnosis and later Graph/RAG grounding.

## RED Evidence

Command:

```powershell
node --test tests\visionCaptureWorkOrderPlan.test.js
```

Expected RED result before implementation:

```text
Error: Cannot find module '../visionCaptureWorkOrderPlan'
```

## GREEN Evidence

Command:

```powershell
node --test tests\visionCaptureWorkOrderPlan.test.js
```

Result:

```text
pass 4
fail 0
```

Follow-up integration command:

```powershell
node --test tests\moldMasterDevelopmentProgressReport.test.js tests\operationalStatusBundle.test.js tests\visionOperationalHitlWorkflowDisplay.test.js tests\operationalStatusRefresh.test.js
```

Result:

```text
pass 41
fail 0
```

## Guarantees

| # | What is guaranteed | Test file or command | Type | Result |
|---|--------------------|----------------------|------|--------|
| 1 | Missing benchmark evidence fails closed with no service writes | `tests/visionCaptureWorkOrderPlan.test.js` | unit | PASS |
| 2 | Weak benchmark results become prioritized defect-class capture work orders | `tests/visionCaptureWorkOrderPlan.test.js` | unit | PASS |
| 3 | Covered classes with missing capture views become recapture-only work orders | `tests/visionCaptureWorkOrderPlan.test.js` | unit | PASS |
| 4 | Strong sample, accuracy, and capture protocol evidence moves to shadow validation | `tests/visionCaptureWorkOrderPlan.test.js` | unit | PASS |
| 5 | Capture work order status is surfaced in the development progress report | `tests/moldMasterDevelopmentProgressReport.test.js` | contract | PASS |
| 6 | Capture work order artifacts are embedded and restorable in the operational status bundle | `tests/operationalStatusBundle.test.js` | contract | PASS |
| 7 | Settings handoff display shows capture counts and top work order previews | `tests/visionOperationalHitlWorkflowDisplay.test.js` | display | PASS |
| 8 | Operational status refresh includes a non-failing capture work order status step | `tests/operationalStatusRefresh.test.js` | contract | PASS |

## Runtime Command

```powershell
npm run vision:capture:work-orders
```

The command writes a JSON artifact and a Markdown table under `artifacts/`. If the plan status is `capture_required`, the command intentionally exits non-zero to keep release automation fail-closed.

For status refresh and Settings handoff, use the non-failing companion command:

```powershell
npm run vision:capture:work-orders:status
```

This still writes the same artifact shape, but it does not fail the refresh pipeline when data capture is still required.

## Known Gaps

This artifact does not collect images by itself and does not train or promote references. It only converts benchmark gaps into auditable capture tasks.
