# PC / Common Agent Communication Security Recovery

Date: 2026-08-28 (Asia/Seoul)

## Scope

- Restore Node/npm TLS verification without bypass flags.
- Keep local Common Agent development endpoints usable over loopback HTTP.
- Reject plaintext HTTP before any request to a non-loopback Common Agent.
- Add bounded request timeouts and package the policy with Electron.
- Verify the currently available Common Agent SQL/Graph/Vision stack without writes.

## Recovery Evidence

| Check | Before | After |
| --- | --- | --- |
| npm registry | `http://registry.npmjs.org/` | `https://registry.npmjs.org/` |
| npm `strict-ssl` | `false` | `true` |
| `NODE_TLS_REJECT_UNAUTHORIZED` user env | `0` | unset |
| Node system CA | unset | `NODE_USE_SYSTEM_CA=1` |
| npm HTTPS ping | TLS chain failure | `PONG` |
| npm production audit transport | HTTP `426 Upgrade Required` | completed over verified HTTPS |

The original user npm configuration is preserved at:

`backups/security-recovery-20260828-192429/user.npmrc.before`

The backup is rollback evidence only. Do not restore `strict-ssl=false` or
`NODE_TLS_REJECT_UNAUTHORIZED=0`; use the Windows system CA path instead.

## Service Evidence

- `http://127.0.0.1:8000/healthz`: HTTP 200
- `http://127.0.0.1:8103/healthz`: HTTP 200
- Common Agent orchestrator, QA, preprocessor, clustering, PostgreSQL, and Neo4j containers: healthy
- Saved Mold Master `agentServerUrl`: blank, therefore the validated loopback default `http://127.0.0.1:8000` is used
- Previous public endpoint `218.151.133.137:5011`: connection refused on 2026-08-28
- Public HTTP must not be restored. A future remote endpoint requires HTTPS termination and server authentication before configuration.

## TDD Evidence

| Stage | Evidence |
| --- | --- |
| RED: transport contract missing | `node --test tests/commonAgentTransport.test.js` failed with `MODULE_NOT_FOUND` |
| RED checkpoint | commit `03a6d03` |
| GREEN: transport policy | 5/5 tests passed |
| GREEN checkpoint | commit `75add61` |
| RED: services still used plaintext external HTTP | contract suite 335/336; insecure endpoint reported online |
| RED checkpoint | commit `0a07b35` |
| GREEN: runtime, services, IPC, CSP integrated | contract suite 336/336 |
| GREEN checkpoint | commit `27e85dc` |
| Package RED | runtime package test reported missing `commonAgentTransport.js` |
| Package GREEN | package runtime test 1/1 passed; commits `88f6739`, `87dcfff` |

## Verification

- `node scripts/run-contract-tests.js`: PASS, 336/336
- `npm run build`: PASS
- `npx --no-install tsc --noEmit --allowJs false`: PASS
- `npm run test:package-runtime`: PASS, 1/1
- `npm audit --omit=dev --json`: completed; 0 critical, 10 high, 3 moderate

Dependency findings remain a separate migration task. They do not justify
disabling certificate verification or bypassing the new endpoint policy.
