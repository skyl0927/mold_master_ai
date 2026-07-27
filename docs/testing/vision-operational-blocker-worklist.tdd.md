# Vision Operational Blocker Worklist TDD Evidence

Date: 2026-07-27

## Scope

This phase converts the final Vision operational readiness audit into a
human-actionable blocker worklist. It is intended for the quality reviewer,
Common Agent operator, capture owner, and release owner to see exactly which
items must be closed before a Vision candidate can be manually activated.

The worklist is non-mutating. It does not write to Common Agent, Graph, SQL,
model configuration, or the local release history.

## RED Evidence

- Commit `830b280` added `tests/visionOperationalBlockerWorklist.test.js`,
  registered it in `npm run test:contracts`, and added the focused script.
- `npm run test:contracts` failed with `MODULE_NOT_FOUND` for
  `../visionOperationalBlockerWorklist`. This was the intended RED signal.

## GREEN Evidence

- `vision-operational-blocker-worklist/v1` maps readiness audit blockers into
  prioritized Korean tasks.
- Approved label conflicts are top priority because they can poison reference
  learning and Graph promotion.
- HITL unresolved items, approved sample shortage, reference store repair, and
  operational release report generation are separated by owner and dependency.
- When all machine gates pass but operator approval is missing, the worklist
  contains only `record_operator_approval`.
- When readiness is already `approved_for_manual_activation`, the worklist is
  clear and still keeps auto changes disabled.
- Missing readiness audit input fails closed with a `run_readiness_audit` task.
- The Common Agent handoff payload explicitly disables Graph promotion and model
  activation while requiring human review.

## Verification

- `npm run test:vision-operational-worklist`: 4 passed.
- `npm run test:contracts`: 87 passed, including the new worklist tests.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `npm run build`: passed with stale baseline-browser-mapping/Browserslist data
  warnings.
- End-to-end CLI probe:
  `npm run vision:operational:readiness -- --output .tmp-tests\vision-operational-readiness-audit.json`
  followed by
  `npm run vision:operational:worklist -- --readiness .tmp-tests\vision-operational-readiness-audit.json --output .tmp-tests\vision-operational-blocker-worklist.json`
  produced `status = action_required`, `totalTasks = 5`, and
  `firstTask = resolve_label_conflicts`, matching the current local blocker
  state.
- Default-input CLI probe: after `npm run vision:operational:readiness` writes
  a timestamped artifact, `npm run vision:operational:worklist -- --output
  .tmp-tests\vision-operational-blocker-worklist-default-input.json` picks up
  the latest readiness audit automatically and produces the same first task.

## Known Gaps

The worklist shows what to close next, but it cannot replace real data
collection or HITL approval. Production readiness still requires conflict-free
approved field images, a production reference store, passing Graph benchmark,
complete release evidence, and a matching operator decision.
