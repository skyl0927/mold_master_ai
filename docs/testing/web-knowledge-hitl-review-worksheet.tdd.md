# Web Knowledge HITL Review Worksheet TDD

## Source Plan

Derived from the active Mold Master AI plan: approximately 40 injection molding
defect Web Cases must be human-reviewed before any Common Agent, Graph, RAG, or
model-learning path can trust them. The existing JSON decision template was safe
but not convenient enough for a reviewer to inspect evidence and fill decisions.

## User Journeys

- As a HITL reviewer, I want a Markdown worksheet that summarizes each Web Case,
  evidence, recommended decision action, and required fields, so that I can
  review the queue without hunting through raw JSON.
- As an operator, I want a CSV worksheet with the same queue, so that the review
  work can be filtered, assigned, or shared while the real approval record stays
  in the JSON decision template.
- As a safety owner, I want worksheet generation to remain artifact-only, so
  that no local ledger, Common Agent, SQL, Graph, reference store, or model
  training write can occur during worksheet preparation.

## Task Report

| # | What is guaranteed | Test file or command | Type | Result | Evidence |
|---|--------------------|----------------------|------|--------|----------|
| 1 | The review guide includes `reviewWorksheet.rows`, Markdown, and CSV text for every pending Web Case decision. | `tests/webKnowledgeHitlReviewGuide.test.js` | unit/contract | PASS | `npm run test:web-knowledge -- --test-name-pattern "Web Knowledge HITL review"` |
| 2 | Approval-ready cards are recommended as `approve_card`; stale or incomplete rows are recommended as `mark_needs_changes`. | `tests/webKnowledgeHitlReviewGuide.test.js` | decision-support contract | PASS | Same command |
| 3 | The CLI writes `.md` and `.csv` companion artifacts next to the JSON review guide. | `tests/webKnowledgeHitlReviewGuide.test.js` | CLI integration | PASS | Same command |
| 4 | Actual current Web Knowledge guide generation creates 43 worksheet rows and remains no-write. | `npm run knowledge:web:hitl:review-guide` | operational dry-run | PASS | `decisionsPrepared=43`, `serviceWritesPerformed=false`, Markdown/CSV output paths emitted |

## RED/GREEN Evidence

- RED: worksheet tests failed because `guide.reviewWorksheet` and
  `guide.outputs.markdownWorksheetPath` were undefined.
- GREEN: focused Web Knowledge review tests passed after adding worksheet
  generation and CLI companion artifact writing.

## Known Gaps

- The worksheet is not an approval artifact. Reviewers must still fill the JSON
  decision template and pass `knowledge:web:hitl:verify-decisions`.
- The current production queue is still blocked until at least 40 local HITL
  approvals and 40 central Common Agent approvals are completed.
