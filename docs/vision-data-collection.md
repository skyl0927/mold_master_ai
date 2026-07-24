# Vision Dataset Collection Gate

## Purpose

The direct provider fallback can be retired only after Common Agent has at
least 20 clean, human-approved manufacturing images. The approved set must
cover all seven required defect classes with at least two samples per class:

- whitening
- short shot
- burn mark
- flash
- sink
- weld line
- ejection damage

The remaining six samples may strengthen any class, but duplicate image hashes,
conflicting labels, unclassifiable images, screenshots, charts, CAD views, and
synthetic test graphics do not count.

## In-App Intake

Open `Knowledge & Dataset Control` and use `로컬 후보 폴더 선택`.

1. The app scans the selected directory without modifying its files.
2. SHA-256 removes duplicate files and compares candidates with Common Agent.
3. Screenshot, chart, logo, and error-image filename hints receive a warning.
4. `AI 라벨 제안` is optional, non-persisting, and calls Vision only for the
   selected image.
5. The operator confirms one of the required defect labels and selects
   `검토 후보 등록`.
6. Registration creates a Common Agent `candidate`; it does not approve or
   promote the image.
7. The operator reviews the new Common Agent card and explicitly selects
   `승인 + Graph`.

The app re-hashes the source immediately before suggestion and registration.
If the file changed after scanning, processing stops. It also refreshes the
Common Agent hashes immediately before registration to prevent stale-scan
duplicates.

## Local Source Audit

Read-only discovery performed on 2026-07-23:

- Mold Master repository: no manufacturing images; only the application icon.
- `I:\AI TEAM PJT\photo\data\temp`: 11 images, all annotated CAD/mold views;
  excluded.
- `D:\@팀장업무`: 441 image files. Filename narrowing found seven
  manufacturing-related images, but they were process/robot setup, CAD, tooling,
  and equipment records rather than one of the seven product-defect classes;
  excluded.
- Common Agent image storage: 16 files collapsed to six unique SHA-256 values.
  Only two unique real product photos were present and they are already
  represented in the dataset; duplicate copies must not increase readiness.
- Common Agent embedded-image storage: 7,625 files collapsed to 2,460 unique
  SHA-256 values. Several internal PPT sources contain high-resolution product
  photographs, but they require slide-context and human-label verification
  before dataset intake.

Potential source-document folders for human review include:

- `doc-kcard-af78707ff499dd39a123`: 25M1540Z product review photographs
- `doc-kcard-bb5f728a2564be15c8b4`: assembly/preprocess case photographs
- `doc-kcard-d84d17ee4771ed105ea6`: 25M1550Z product review photographs
- `doc-kcard-8e98f002c6b79c07ae08`: 25M4560 product review photographs

These folders are candidates, not approved truth. Handwritten callouts and
slide context may describe geometry, assembly, or appearance issues outside the
seven benchmark classes. No image from these folders should be auto-labeled or
auto-promoted.

## Source-Linked Knowledge Card Candidates

The following read-only bundle was generated on 2026-07-23 from Common Agent
review session `pre-draft-5c350a0fe9f5`:

```powershell
npm run vision:candidates:sync-card -- --session pre-draft-5c350a0fe9f5 --output artifacts/knowledge-card-vision-candidates/pre-draft-5c350a0fe9f5
```

The bundle contains eight unique, hash-verified manufacturing photographs:

- whitening: 2
- short shot: 2
- flash: 2
- ejection: 2

Each manifest entry retains the source document/version, Knowledge Card,
slide, figure, evidence, asset URI, source hash, and source review status.
Repeated synchronization kept the Common Agent dataset count unchanged at
seven records. The bundle policy is `persistence=none`, `autoApproval=false`,
`graphPromotion=false`, and `requiresHumanReview=true`.

Open this folder through `로컬 후보 폴더 선택`. The app verifies every manifest
hash before trusting its label or lineage, displays `원문 카드 연결`, and
pre-fills the shared taxonomy label. Registration still requires an explicit
operator action, and approval plus Graph promotion remains a separate HITL
step. These eight candidates therefore do not yet count toward the 20-image
retirement gate.

## Product Review Vision Audit

A second read-only audit was performed on 2026-07-23 against 30 unique embedded
images from the 25M1540Z, 25M1550Z, and 25M4560 product-review documents.
Common Agent Vision returned:

- unclassifiable: 28
- whitening suggestion: 1
- ejection-damage suggestion: 1

The audit used non-persisting inference. It created no SQL dataset record,
Knowledge Card update, Graph node, approval, or promotion. The complete audit
evidence is stored in
`artifacts/product-review-discovery/vision-audit.json`.

Two source-linked candidates were copied to
`artifacts/product-review-vision-candidates` for explicit HITL review. Both
require label reconciliation before candidate registration:

- `whitening__25M1540Z__s004-006.jpg`: source label is not confirmed; Vision
  suggests whitening with confidence 0.72.
- `weld_line__25M1550Z__s002-001.jpg`: the source annotation says `Weld Line`,
  while Vision suggests ejection damage with confidence 0.88.

The app verifies the manifest hash, displays the source and Vision labels
side-by-side, disables registration until the reviewer confirms the final
label, and repeats the same check in the Electron IPC handler. These candidates
do not count as approved samples and the weld-line class remains unvalidated.

Read-only Electron verification for this bundle:

```powershell
$env:MOLD_MASTER_CARD_CANDIDATE_ROOT = "$PWD\artifacts\product-review-vision-candidates"
node scripts/electron-knowledge-card-candidate-smoke.js
```

Verification:

```powershell
npm run test:candidates
npm run test:electron:vision-candidates
npm run test:electron:vision-card-candidates
```

## Consolidated Human Review Packet

The source-linked Knowledge Card candidates, product-review conflict
candidates, missing-class discovery candidates, and licensed Web Case images
can be combined into one hash-verified, non-persisting packet:

```powershell
npm run vision:candidates:sync-web
npm run vision:review-packet
npm run vision:review-packet:audit
```

The generated packet is stored under
`artifacts/vision-human-review-packet-<timestamp>`. The current packet contains
29 unique candidates:

- whitening: 3
- short shot: 3
- burn: 4
- flash: 2
- sink: 9
- weld line: 6
- ejection: 2

The Vision audit uses `/internal/vision/describe` only. It does not create SQL
records, image-dataset rows, approvals, or Graph nodes. Completed observations
from older packets are reused by immutable image SHA-256, so rebuilding a
packet does not repeatedly spend Vision calls on the same bytes. The first
weld-line Figure audit requested one new Vision call. The subsequent
lineage-only packet rebuild reused all 29 observations.

- source/Vision high-confidence agreement: 12
- source/Vision low-confidence agreement: 1
- heuristic/Vision agreement requiring source confirmation: 1
- class conflict: 5
- unclassifiable or normal-functional image: 10

The six reusable-license Web Case candidates are all priority-one source/Vision
agreements:

- burn: 2 at confidence 0.90 and 0.91
- short shot: 1 at confidence 0.97
- sink: 2 at confidence 0.83 and 0.90
- weld line: 1 at confidence 0.94

Their Web Case ID, publisher, source URL, author, license, evidence SHA-256,
and packet lineage are displayed in the original-image review dialog and are
forwarded to Common Agent only after explicit human registration and approval.
Five carry `CC BY-SA 4.0` from the authoritative Wikimedia
`imageinfo/extmetadata` API. The weld-line optical micrograph carries
`CC BY 4.0`, an MDPI article citation, and a non-retracted PMC open-access
license record. They are candidates, not benchmark truth.

If all six are independently confirmed, the seven-class minimum is covered.
The clean approved count would rise from 8 to 14, so six more independent
approved images would still be required for the 20-sample retirement gate.

Open `Knowledge & Dataset Control` and select `준비된 검토 패킷`. The app
automatically finds the latest development packet or reuses the packet pointer
stored in Electron `userData`. A packaged deployment can set
`MOLD_MASTER_VISION_REVIEW_PACKET_ROOT` to an external packet directory.

The cards are ordered by review priority. Even priority-one candidates require
the reviewer to inspect the source image and document context, confirm the
label, register a Common Agent candidate, and separately approve Graph
promotion. No batch command performs those human decisions.

Verification:

```powershell
npm run test:review-packet
npm run test:candidates
npm run test:electron:vision-review-packet
```

## Retirement Decision

Run the in-app Vision benchmark after each approved batch. Remove the fallback
only when all of the following are true:

- 20 clean approved unique hashes
- at least two samples in every required class
- HTTP success rate at least 95%
- classifiable rate at least 95%
- defect-label accuracy at least 80%
- Graph grounding rate at least 80%
- every observed class accuracy at least 50%
- Vision confidence of at least 0.6 on at least 80% of samples
