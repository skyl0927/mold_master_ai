const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlEditableDecisionPreflight
} = require('../operationalHitlEditableDecisionPreflight');

const workspaceManifest = () => ({
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  status: 'ready_for_human_edit',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 4,
    workspaceFileCount: 2,
    firstEditableQueueCode: 'vision_label_conflicts'
  },
  editableFiles: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      editablePath: 'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json',
      targetPending: 2,
      allowedActions: [
        'keep_label',
        'mark_needs_review',
        'reject_conflicting_cases',
        'request_recapture'
      ],
      requiredFields: [
        'action',
        'selectedLabel',
        'imageSetConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment',
        'requestedViews'
      ],
      decisionIdentifierField: 'conflictId',
      verifyCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      editablePath: 'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
      targetPending: 2,
      allowedActions: [
        'approve_candidate',
        'mark_needs_review',
        'reject_candidate',
        'request_recapture'
      ],
      requiredFields: [
        'action',
        'approvedDefectType',
        'manufacturingImageConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment',
        'requestedViews'
      ],
      decisionIdentifierField: 'queueId',
      verifyCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json"'
    }
  ]
});

const editableFiles = () => new Map([
  [
    'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json',
    JSON.stringify({
      contractVersion: 'vision-approved-label-conflict-decisions/v1',
      reviewer: { id: 'reviewer-a' },
      reviewedAt: '2026-07-27T13:50:00.000Z',
      decisions: [
        {
          conflictId: 'conflict-001',
          contentHash: 'a'.repeat(64),
          action: 'keep_label',
          allowedActions: [
            'keep_label',
            'mark_needs_review',
            'reject_conflicting_cases',
            'request_recapture'
          ],
          requiredFieldsByAction: {
            keep_label: [
              'action',
              'selectedLabel',
              'imageSetConfirmed',
              'labelConfirmed',
              'reviewer.id',
              'decidedAt',
              'reviewComment'
            ]
          },
          selectedLabel: '제팅',
          imageSetConfirmed: true,
          labelConfirmed: true,
          decidedAt: '2026-07-27T13:52:00.000Z',
          reviewComment: '원본 이미지와 라벨 후보를 확인했습니다.'
        },
        {
          conflictId: 'conflict-002',
          action: 'pending',
          allowedActions: [
            'keep_label',
            'mark_needs_review'
          ]
        }
      ]
    })
  ],
  [
    'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
    JSON.stringify({
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      reviewer: { id: 'reviewer-a' },
      reviewedAt: '2026-07-27T13:50:00.000Z',
      decisions: [
        {
          queueId: 'pending-hitl-001',
          contentSha256: 'b'.repeat(64),
          defectType: '싱크',
          defectClass: 'sink',
          action: 'approve_candidate',
          allowedActions: [
            'approve_candidate',
            'mark_needs_review',
            'reject_candidate',
            'request_recapture'
          ],
          requiredFieldsByAction: {
            approve_candidate: [
              'action',
              'approvedDefectType',
              'manufacturingImageConfirmed',
              'labelConfirmed',
              'reviewer.id',
              'decidedAt',
              'reviewComment'
            ]
          },
          approvedDefectType: '싱크',
          manufacturingImageConfirmed: false,
          labelConfirmed: true,
          decidedAt: '2026-07-27T13:53:00.000Z',
          reviewComment: '제조 이미지 여부를 아직 다시 확인해야 합니다.'
        },
        {
          queueId: 'pending-hitl-002',
          action: 'not_supported_action'
        }
      ]
    })
  ]
]);

test('summarizes pending, invalid, and missing-field state without running verification', () => {
  const files = editableFiles();
  const report = buildOperationalHitlEditableDecisionPreflight({
    generatedAt: '2026-07-27T13:55:00.000Z',
    workspaceManifest: workspaceManifest(),
    sourceArtifacts: {
      workspaceManifest: 'C:\\repo\\workspace\\manifest.json'
    },
    readFileText: filePath => files.get(filePath)
  });

  assert.equal(report.contractVersion, 'operational-hitl-editable-decision-preflight/v1');
  assert.equal(report.status, 'needs_human_input');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.policy.autoVerifyAllowed, false);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.workspaceFileCount, 2);
  assert.equal(report.summary.totalDecisionItems, 4);
  assert.equal(report.summary.actionableDecisionCount, 2);
  assert.equal(report.summary.pendingDecisionCount, 1);
  assert.equal(report.summary.invalidActionCount, 1);
  assert.equal(report.summary.missingRequiredFieldCount, 1);
  assert.equal(report.summary.readyForVerificationFileCount, 0);
  assert.equal(report.summary.firstBlockedQueueCode, 'vision_label_conflicts');
  assert.deepEqual(report.files.map(item => item.status), [
    'needs_human_input',
    'invalid_decisions'
  ]);
  assert.equal(report.files[0].pendingDecisionIds[0], 'conflict-002');
  assert.deepEqual(report.files[1].missingRequiredFields[0], {
    decisionId: 'pending-hitl-001',
    action: 'approve_candidate',
    field: 'manufacturingImageConfirmed'
  });
  assert.equal(report.files[1].invalidActions[0].decisionId, 'pending-hitl-002');
  assert.deepEqual(report.verificationCommandsReady, []);
  assert.equal(report.sources.workspaceManifest, 'C:\\repo\\workspace\\manifest.json');
  assert.match(report.recommendedAction, /vision_label_conflicts/);
});

test('reports ready_for_verification only when every editable decision is complete', () => {
  const manifest = workspaceManifest();
  manifest.editableFiles = [manifest.editableFiles[0]];
  const filePath = manifest.editableFiles[0].editablePath;
  const files = new Map([
    [
      filePath,
      JSON.stringify({
        contractVersion: 'vision-approved-label-conflict-decisions/v1',
        reviewer: { id: 'reviewer-a' },
        reviewedAt: '2026-07-27T13:50:00.000Z',
        decisions: [
          {
            conflictId: 'conflict-001',
            action: 'mark_needs_review',
            allowedActions: ['keep_label', 'mark_needs_review'],
            requiredFieldsByAction: {
              mark_needs_review: [
                'action',
                'reviewer.id',
                'decidedAt',
                'reviewComment'
              ]
            },
            decidedAt: '2026-07-27T13:56:00.000Z',
            reviewComment: '근거가 부족해 재검토 대상으로 전환합니다.'
          }
        ]
      })
    ]
  ]);

  const report = buildOperationalHitlEditableDecisionPreflight({
    workspaceManifest: manifest,
    readFileText: filePathToRead => files.get(filePathToRead)
  });

  assert.equal(report.status, 'ready_for_verification');
  assert.equal(report.summary.pendingDecisionCount, 0);
  assert.equal(report.summary.invalidActionCount, 0);
  assert.equal(report.summary.missingRequiredFieldCount, 0);
  assert.equal(report.summary.readyForVerificationFileCount, 1);
  assert.deepEqual(report.verificationCommandsReady, [
    'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"'
  ]);
  assert.match(report.recommendedAction, /verificationCommandsReady/);
});

test('fails closed when workspace manifest evidence is missing', () => {
  const report = buildOperationalHitlEditableDecisionPreflight({});

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.summary.missingArtifacts, 1);
  assert.deepEqual(report.files, []);
  assert.deepEqual(report.verificationCommandsReady, []);
  assert.match(report.recommendedAction, /operational:hitl:editable-workspace/);
});
