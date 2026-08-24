# Calibrated Dimension Tool TDD Record

## Scope

The annotation editor measures in source-image coordinates and persists both linear and four-point planar calibrations. Dimension evidence records the automatic value, optional manual display correction, calibration provenance, and HITL review status.

Only approved real-unit measurements may be promoted as Common Agent or Graph evidence. Pixel-only legacy dimensions and candidate or rejected measurements remain observational context.

## Operator Flow

### Linear reference

1. Enter the known reference length and unit.
2. Select `기준 치수` and drag over the known reference.
3. Select `치수` and drag the target dimension.
4. Correct the display value only when necessary, then approve or reject it.

### Four-point planar correction

1. Enter the plane width and height in the selected unit.
2. Select `원근 4점`.
3. Click the same plane in this order: top-left, top-right, bottom-right, bottom-left.
4. Measure only features that lie on that calibrated plane.
5. Review the automatic result and explicitly approve or reject it.

Use the planar correction when a flat target is photographed obliquely. Use the linear reference for a near-orthographic image where the reference and measured feature are on the same plane.

## Safety Rules

- A calibration is a traceable reference, not a tolerance verdict. Pass or fail requires a separate approved specification.
- Manual correction retains the automatic comparison value and resets review to candidate.
- Graph promotion is fail-closed unless every included real-unit measurement is approved.
- Four-point correction does not compensate for lens distortion, curved surfaces, or features outside the calibrated plane.
- Crop operations rebuild the planar transform in the shifted source coordinate system.

## TDD Checkpoints

- `6e8343b`: red tests for the calibrated dimension engine and governed evidence.
- `148a856`: linear calibration engine.
- `099b271`: red editor-state contract.
- `e84ca6e`: editor-state history and HITL behavior.
- `6e94e48`: red Electron editor journey.
- `9f4a216`: source-coordinate editor integration.
- `bb9d8e3`: red AI, Graph, and report evidence contract.
- `c707740`: governed Common Agent and report integration.
- `68153bb`, `b73e3cb`: red planar perspective and crop invariants.
- `25c16f5`: homography engine and editor-state API.
- `edf837e`: red Electron perspective journey.
- `19f46ce`: four-point editor workflow and UI regression fix.

## Verification Evidence

- `npm run test:dimension`: 33/33 passed.
- `npm run test:contracts`: 330/330 passed.
- New-module aggregate coverage: 92.50% lines and 91.89% functions.
- `npx --no-install tsc --noEmit --pretty false --allowJs false`: passed.
- `npm run build`: passed.
- `npm run test:electron:dimension`: passed; 5.02 mm linear measurement persisted.
- `npm run test:electron:dimension:perspective`: passed; both trapezoid edges resolved to 10.00 mm, approval persisted, no renderer errors.
- `npm run test:electron:capture-session`: passed.
- `npm run test:electron:capture-fresh-frame`: passed; consecutive captures used different frames.

Visual artifacts are written to `artifacts/electron-calibrated-dimension.png` and `artifacts/electron-perspective-dimension.png`.
