# Vision Operational Common Agent Handoff TDD Evidence

Date: 2026-07-27

## Scope

This phase turns the Vision operational blocker worklist into a Common
Agent-readable handoff packet. The packet is intentionally artifact-only: it
does not call Common Agent, write SQL, promote Graph data, or activate a model.

## User Journey

As an operator coordinating Mold Master AI with Common Agent or Antigravity, I
want the current readiness blockers packaged with explicit safety policy, so
that the other agent can continue the work without accidentally treating
unresolved Vision data as approved Graph knowledge.

## RED Evidence

- Commit `f40e8db` added
  `tests/visionOperationalCommonAgentHandoff.test.js` and registered it in
  `npm run test:contracts`.
- `node --test tests\visionOperationalCommonAgentHandoff.test.js` failed with
  `MODULE_NOT_FOUND` for `../visionOperationalCommonAgentHandoff`.
- This was the intended RED signal because no handoff packet builder existed.

## GREEN Evidence

- `visionOperationalCommonAgentHandoff.js` now builds
  `vision-operational-common-agent-handoff-packet/v1`.
- The packet includes source artifact pointers, readiness/worklist status,
  task count, primary task, task-level Common Agent action codes, and safe next
  commands.
- The packet keeps `deliveryMode = artifact_only`,
  `serviceWritesPerformed = false`, `automaticServiceWritesAllowed = false`,
  `allowGraphPromotion = false`, and `allowModelActivation = false`.
- `npm run vision:operational:handoff` writes a packet without contacting any
  server.

## Verification

| # | What is guaranteed | Command | Test type | Result | Evidence |
|---|--------------------|---------|-----------|--------|----------|
| 1 | Blocked worklists produce artifact-only packets that prevent Graph and model promotion | `node --test tests\visionOperationalCommonAgentHandoff.test.js` | Unit contract | PASS | `status: blocked`, `allowGraphPromotion: false` |
| 2 | Clear worklists allow only manual operator import review, never automatic writes | `node --test tests\visionOperationalCommonAgentHandoff.test.js` | Unit contract | PASS | `manualImportAllowed: true`, `automaticServiceWritesAllowed: false` |
| 3 | Missing input fails closed with a readiness-audit task | `node --test tests\visionOperationalCommonAgentHandoff.test.js` | Unit contract | PASS | `primaryTaskCode: run_readiness_audit` |
| 4 | CLI writes the current local handoff artifact | `npm run vision:operational:handoff -- --output .tmp-tests\vision-operational-common-agent-handoff.json` | CLI smoke | PASS | `status: blocked`, `totalTasks: 5`, `primaryTask: resolve_label_conflicts` |

## Known Gaps

This handoff packet is not an API push. That is deliberate until the receiving
Common Agent endpoint contract is pinned. The next safe integration step is to
have Common Agent ingest this packet as a review artifact, not as approved
training or Graph data.
