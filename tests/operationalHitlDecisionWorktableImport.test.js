const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDecisionWorktableImport
} = require('../operationalHitlDecisionWorktableImport');

const workspaceManifest = () => ({
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  editableFiles: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      editablePath: 'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json',
      allowedActions: ['keep_label', 'mark_needs_review', 'request_recapture'],
      decisionIdentifierField: 'conflictId',
      verifyCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      editablePath: 'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
      allowedActions: ['approve_candidate', 'reject_candidate', 'request_recapture'],
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
      reviewer: { id: '', name: '' },
      decisions: [
        {
          conflictId: 'conflict-001',
          candidateLabels: ['백화', '웰드라인'],
          action: 'pending',
          selectedLabel: '',
          imageSetConfirmed: false,
          labelConfirmed: false,
          requestedViews: [],
          decidedAt: '',
          reviewComment: ''
        }
      ]
    }, null, 2)
  ],
  [
    'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
    JSON.stringify({
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      reviewer: { id: '', name: '' },
      decisions: [
        {
          queueId: 'pending-hitl-001',
          defectType: '싱크',
          defectClass: 'sink',
          action: 'pending',
          approvedDefectType: '싱크',
          manufacturingImageConfirmed: false,
          labelConfirmed: false,
          requestedViews: [],
          decidedAt: '',
          reviewComment: ''
        }
      ]
    }, null, 2)
  ]
]);

const csv = [
  'queueCode,decisionId,newAction,reviewerId,reviewerName,decidedAt,reviewComment,selectedLabel,imageSetConfirmed,labelConfirmed,manufacturingImageConfirmed,requestedViews,approvedDefectType',
  'vision_label_conflicts,conflict-001,keep_label,reviewer-01,품질 담당자,2026-07-27T14:00:00.000Z,원본 이미지 재확인 결과 백화가 맞습니다.,백화,true,true,,,',
  'vision_pending_hitl,pending-hitl-001,approve_candidate,reviewer-01,품질 담당자,2026-07-27T14:05:00.000Z,제조 이미지와 싱크 라벨을 확인했습니다.,,,true,true,,싱크'
].join('\n');

test('dry-runs worktable CSV updates without writing editable decision files', () => {
  const files = editableFiles();
  const writes = [];
  const report = buildOperationalHitlDecisionWorktableImport({
    generatedAt: '2026-07-27T14:10:00.000Z',
    workspaceManifest: workspaceManifest(),
    worktableCsv: csv,
    apply: false,
    sourceArtifacts: {
      workspaceManifest: 'C:\\repo\\workspace\\manifest.json',
      worktableCsv: 'C:\\repo\\workspace\\worktable.csv'
    },
    readFileText: filePath => files.get(filePath),
    writeFileText: (filePath, text) => writes.push({ filePath, text })
  });

  assert.equal(report.contractVersion, 'operational-hitl-decision-worktable-import/v1');
  assert.equal(report.status, 'dry_run_ready');
  assert.equal(report.applyRequested, false);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localEditableWritesPerformed, false);
  assert.equal(report.policy.explicitApplyRequired, true);
  assert.equal(report.policy.allowGraphPromotion, false);
  assert.equal(report.summary.totalRows, 2);
  assert.equal(report.summary.plannedUpdates, 2);
  assert.equal(report.summary.filesToUpdate, 2);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(writes.length, 0);
  assert.equal(report.plannedUpdates[0].fieldUpdates.selectedLabel, '백화');
  assert.equal(report.plannedUpdates[0].fieldUpdates.imageSetConfirmed, true);
  assert.equal(report.plannedUpdates[1].fieldUpdates.manufacturingImageConfirmed, true);
  assert.deepEqual(report.verificationCommandsReady, [
    'npm run vision:label-conflicts:verify-decisions -- --decisions "C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json"',
    'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json"'
  ]);
});

test('explicit apply writes only local editable decision JSON files', () => {
  const files = editableFiles();
  const writes = new Map();
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: workspaceManifest(),
    worktableCsv: csv,
    apply: true,
    readFileText: filePath => files.get(filePath),
    writeFileText: (filePath, text) => writes.set(filePath, text)
  });

  assert.equal(report.status, 'applied');
  assert.equal(report.applyRequested, true);
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localEditableWritesPerformed, true);
  assert.equal(report.summary.appliedUpdates, 2);
  assert.equal(writes.size, 2);

  const labelPacket = JSON.parse(writes.get('C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json'));
  assert.equal(labelPacket.decisions[0].action, 'keep_label');
  assert.equal(labelPacket.decisions[0].selectedLabel, '백화');
  assert.equal(labelPacket.decisions[0].reviewerId, 'reviewer-01');
  assert.equal(labelPacket.decisions[0].reviewComment, '원본 이미지 재확인 결과 백화가 맞습니다.');
  assert.equal(labelPacket.decisions[0].imageSetConfirmed, true);
  assert.equal(labelPacket.decisions[0].labelConfirmed, true);

  const visionPacket = JSON.parse(writes.get('C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json'));
  assert.equal(visionPacket.decisions[0].action, 'approve_candidate');
  assert.equal(visionPacket.decisions[0].approvedDefectType, '싱크');
  assert.equal(visionPacket.decisions[0].manufacturingImageConfirmed, true);
  assert.equal(visionPacket.decisions[0].labelConfirmed, true);
});

test('fails closed when the CSV contains unsupported actions or unknown decisions', () => {
  const writes = [];
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: workspaceManifest(),
    worktableCsv: [
      'queueCode,decisionId,newAction,reviewerId,decidedAt,reviewComment',
      'vision_label_conflicts,conflict-001,approve_card,reviewer-01,2026-07-27T14:00:00.000Z,허용되지 않은 action입니다.',
      'vision_pending_hitl,pending-hitl-999,approve_candidate,reviewer-01,2026-07-27T14:05:00.000Z,큐에 없는 decision입니다.'
    ].join('\n'),
    apply: true,
    readFileText: filePath => editableFiles().get(filePath),
    writeFileText: (filePath, text) => writes.push({ filePath, text })
  });

  assert.equal(report.status, 'invalid_worktable');
  assert.equal(report.localEditableWritesPerformed, false);
  assert.equal(report.summary.invalidRows, 2);
  assert.deepEqual(report.invalidRows.map(row => row.code), [
    'unsupported_action',
    'unknown_decision'
  ]);
  assert.equal(writes.length, 0);
});

test('fails closed when action-specific required fields are missing before apply', () => {
  const writes = [];
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: workspaceManifest(),
    worktableCsv: [
      'queueCode,decisionId,newAction,approvedDefectType,reviewComment',
      'vision_pending_hitl,pending-hitl-001,approve_candidate,싱크,짧음'
    ].join('\n'),
    apply: true,
    readFileText: filePath => editableFiles().get(filePath),
    writeFileText: (filePath, text) => writes.push({ filePath, text })
  });

  assert.equal(report.status, 'invalid_worktable');
  assert.equal(report.applyRequested, true);
  assert.equal(report.localEditableWritesPerformed, false);
  assert.equal(report.summary.plannedUpdates, 0);
  assert.equal(report.summary.invalidRows, 1);
  assert.equal(report.invalidRows[0].code, 'missing_required_fields');
  assert.equal(report.invalidRows[0].decisionId, 'pending-hitl-001');
  assert.deepEqual(report.invalidRows[0].missingFields, [
    'manufacturingImageConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'reviewComment'
  ]);
  assert.equal(writes.length, 0);
});

test('accepts rows whose fields satisfy the selected action requirements', () => {
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: workspaceManifest(),
    worktableCsv: [
      'queueCode,decisionId,newAction,reviewerId,decidedAt,reviewComment,requestedViews',
      'vision_label_conflicts,conflict-001,request_recapture,reviewer-01,2026-07-27T14:20:00.000Z,원본 이미지 품질이 낮아 재촬영을 요청합니다.,제품 전체 정면 | 결함부 근접'
    ].join('\n'),
    readFileText: filePath => editableFiles().get(filePath)
  });

  assert.equal(report.status, 'dry_run_ready');
  assert.equal(report.summary.plannedUpdates, 1);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(report.plannedUpdates[0].action, 'request_recapture');
  assert.deepEqual(report.plannedUpdates[0].fieldUpdates.requestedViews, [
    '제품 전체 정면',
    '결함부 근접'
  ]);
});

test('ignores exported read-only rows until newAction or explicit action is entered', () => {
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: workspaceManifest(),
    worktableCsv: [
      'queueCode,decisionId,currentAction,rowStatus,reviewedProblem,reviewComment',
      'vision_pending_hitl,pending-hitl-001,pending,pending,이미 존재하는 설명,'
    ].join('\n'),
    readFileText: filePath => editableFiles().get(filePath)
  });

  assert.equal(report.status, 'no_actionable_rows');
  assert.equal(report.summary.plannedUpdates, 0);
  assert.equal(report.summary.unchangedRows, 1);
  assert.deepEqual(report.plannedUpdates, []);
});

test('fails closed when workspace or CSV evidence is missing', () => {
  const report = buildOperationalHitlDecisionWorktableImport({
    workspaceManifest: null,
    worktableCsv: ''
  });

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.summary.missingArtifacts, 2);
  assert.deepEqual(report.summary.missingArtifactNames, ['workspaceManifest', 'worktableCsv']);
  assert.equal(report.serviceWritesPerformed, false);
});
