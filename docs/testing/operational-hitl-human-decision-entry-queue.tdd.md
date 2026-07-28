# Operational HITL Human Decision Entry Queue TDD

## Intent

Operational HITL is currently blocked by manual CSV decisions. The app must reduce operator friction without auto-populating `newAction`, approving graph promotion, or applying any service write.

## User Story

As an operator, I want the next HITL decision entries to be visible as a copy-ready queue in the generated human brief and Settings UI, so I can fill the original worktable CSV faster while still confirming every value manually.

## Red Checks

- `tests/operationalHitlHumanDecisionBrief.test.js` expects `summary.decisionEntryQueueRows`, top-level `decisionEntryQueue`, copyable fields, session paths, and safety flags.
- `tests/visionOperationalHitlWorkflowDisplay.test.js` expects `entryQueuePreviews` for Settings UI display.

## Green Behavior

- The queue is derived from existing review sessions and `nextRows`.
- Each entry includes session identity, decision id, recommended action, risk, copyable fields, manual confirmation fields, worktable path, session packet path, and safety flags.
- `requiresHumanReview` stays `true`.
- `autoPopulateAllowed` and `autoApplyAllowed` stay `false`.
- CLI output surfaces queue counts and the first entry fields for quick operator handoff.

## Verification

- `npm run test:operational-hitl-human-brief`
- `npm run test:vision-operational-hitl-display`
- `npm run operational:hitl:human-brief`

