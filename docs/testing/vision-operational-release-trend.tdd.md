# Vision Operational Release Trend TDD Evidence

Date: 2026-07-27

## Scope

This phase turns the accumulated Vision operational release history into a
compact operating signal. The app now summarizes repeated release blockers,
evidence readiness, operator confirmation rate, and the next recommended
release action.

The trend summary is advisory only. It does not activate, roll back, promote, or
fine-tune a Vision model automatically.

## RED Evidence

- Commit `51fc281` added a contract test for
  `summarizeVisionOperationalReleaseTrend()`.
- `npm run test:contracts` failed at compile time because the trend summary
  export did not exist yet. This was the intended RED signal.

## GREEN Evidence

- `vision-operational-release-trend/v1` reports history window size, evidence
  readiness rate, operator confirmation rate, top blocking reasons, latest
  action code, latest action label, and a Korean narrative.
- Missing evidence produces `collect_operational_evidence`.
- Complete evidence with weak candidate metrics produces
  `improve_candidate_metrics`.
- A promoted candidate without operator confirmation produces
  `confirm_operator_decision`.
- A confirmed release or rollback report produces `maintain_confirmed_release`.
- Settings displays the next action, readiness trend, and repeated blockers in
  the Vision release gate panel.
- The transition JSON export includes `operationalReleaseTrend`.

## Verification

- `npm run test:contracts`: 80 passed, including the new release trend
  contract.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `git diff --check`: passed with Windows CRLF conversion warnings only.
- `npm run build`: passed with stale baseline-browser-mapping/Browserslist data
  warnings.
- `npm run test:electron:transition`: passed. The smoke confirmed Settings shows
  the next release action and readiness trend, and the exported JSON contains
  `operationalReleaseTrend.latestActionCode = maintain_confirmed_release`,
  `historyWindowSize = 1`, `evidenceReadyRate = 100`, and
  `operatorConfirmationRate = 100`.

## Known Gaps

The trend summary can only be as accurate as the release reports in local
history. Production trend authority still requires real Common Agent benchmark
artifacts, approved Graph snapshot URIs, and repeated HITL-confirmed field
datasets.
