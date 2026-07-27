# Vision Operational Evidence Packet TDD Evidence

Date: 2026-07-27

## Scope

This phase adds a safe handoff format between Common Agent/Antigravity central
evidence and Mold Master AI release configs. Instead of manually copying
multiple URIs into a release config, operators can provide a single
`vision-operational-evidence-packet/v1` payload and merge it into the config.

The packet is release preparation evidence only. It does not activate, promote,
roll back, or train any model automatically.

## RED Evidence

- Commit `5112532` added `visionOperationalEvidencePacket.test.js` and included
  it in `npm run test:contracts`.
- `npm run test:contracts` failed with `Cannot find module
  '../scripts/lib/vision-operational-evidence-packet'`. This was the intended
  RED signal.

## GREEN Evidence

- `buildVisionOperationalEvidencePacket()` normalizes pinned Common Agent
  export and Graph snapshot evidence.
- `mergeVisionOperationalEvidencePacketIntoReleaseConfig()` rejects stale Graph
  versions and removes old central evidence entries before adding the packet
  evidence.
- `vision:release:evidence:merge` creates a release config with
  `commonAgentEvidenceUri`, `graphEvidenceUri`, `evidenceBundle.items`, and an
  `operationalEvidencePacket` audit copy.
- `eval/vision-operational-evidence-packet.example.json` documents the handoff
  schema expected from Common Agent/Antigravity.

## Verification

- `npm run test:contracts`: 79 passed after implementation.
- `npx --no-install tsc --noEmit --pretty false`: passed.
- `git diff --check`: passed with Windows CRLF conversion warnings only.
- `npm run build`: passed with stale Browserslist/Baseline data warnings.
- `npm run vision:release:evidence:merge -- --config eval\vision-operational-release.config.example.json --packet eval\vision-operational-evidence-packet.example.json --output .tmp-tools\vision-operational-release-config.with-evidence.example.json --packet-output .tmp-tools\vision-operational-evidence-packet.normalized.json`:
  generated a merged release config and normalized evidence packet.
- `npm run eval:vision:release -- --baseline artifacts\multimodal-vision-strict-v2-baseline-20260724.json --candidate artifacts\multimodal-vision-candidate-v3-lean-20260724.json --config .tmp-tools\vision-operational-release-config.with-evidence.example.json --output .tmp-tools\vision-operational-release-with-evidence-smoke.json`:
  returned the expected non-zero `hold_shadow` because sample data remains below
  operational thresholds, while `evidenceAlignment.passed = true` confirmed the
  merged Common Agent and Graph evidence is structurally release-ready.

## Development Feedback

The app is now ready to receive real central evidence without relying on loose
manual URI edits. The remaining development risk is data availability and
actual benchmark quality, not the local release handoff mechanics.
