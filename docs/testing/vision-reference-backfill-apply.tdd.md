# Vision Reference Backfill Apply TDD Evidence

## Source

Derived from the active migration goal: continue the Vision reference learning flow after backfill authorization while preventing accidental Common Agent writes.

## User Journey

As an engineer with a reviewed reference-backfill write plan, I want a dry-run-first apply command, so that Common Agent is updated only when `--apply` is explicitly provided and every request remains auditable.

## RED Evidence

Command:

```powershell
node --test tests/visionReferenceBackfillApply.test.js
```

Result:

```text
Error: Cannot find module '../visionReferenceBackfillApply'
fail 1
```

The new apply tests referenced a missing module before implementation.

## GREEN Evidence

Commands:

```powershell
npm run test:vision-reference-backfill-apply
npm run test:vision-reference-backfill-authorization
npm run test:vision-reference-backfill-plan
npm run test:contracts
npx --no-install tsc --noEmit --pretty false
npm run build
```

Results:

```text
test:vision-reference-backfill-apply: pass 4
test:vision-reference-backfill-authorization: pass 4
test:vision-reference-backfill-plan: pass 3
test:contracts: pass 48
typecheck: pass
build: pass
```

Build produced only existing Browserslist/baseline freshness warnings.

## Guarantees

| # | Guarantee | Test or command | Result |
|---|-----------|-----------------|--------|
| 1 | Dry-run builds encoded Common Agent review requests without service writes | `tests/visionReferenceBackfillApply.test.js` | PASS |
| 2 | Apply mode posts authorized review payloads and audits learning-ready signals | `tests/visionReferenceBackfillApply.test.js` | PASS |
| 3 | Invalid or non-v2 observation write plans are rejected before writes | `tests/visionReferenceBackfillApply.test.js` | PASS |
| 4 | Failed Common Agent writes are recorded and later targets are not attempted | `tests/visionReferenceBackfillApply.test.js` | PASS |
| 5 | Existing Common Agent contracts and app build remain valid | `npm run test:contracts`, `npm run build` | PASS |

## Operational Notes

Use `npm run vision:reference:backfill-apply -- --write-plan <validated-write-plan.json>` for dry-run. Add `--apply` only after reviewing the generated request bodies and confirming Common Agent includes full v2 observation persistence support.
