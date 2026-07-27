const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  createOperationalHitlEditableDecisionWorkspace
} = require('../operationalHitlEditableDecisionWorkspace');

const inputReviewPacket = () => ({
  contractVersion: 'operational-hitl-decision-input-review-packet/v1',
  status: 'awaiting_human_input',
  serviceWritesPerformed: false,
  summary: {
    totalTemplateItems: 59,
    totalPendingActions: 59,
    targetDecisionInputsMissing: 56,
    firstQueueCode: 'vision_label_conflicts'
  },
  sections: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      sourceArtifact: 'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
      targetPending: 4,
      pendingActions: 4,
      requiredFields: [
        'action',
        'selectedLabel',
        'imageSetConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment'
      ],
      allowedActions: [
        'keep_label',
        'mark_needs_review',
        'reject_conflicting_cases',
        'request_recapture'
      ],
      decisionIdentifierField: 'conflictId',
      decisionIdsPreview: ['conflict-001', 'conflict-002'],
      verificationCommand: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
    },
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      owner: 'quality_hitl',
      sourceArtifact: 'C:\\repo\\artifacts\\common-agent-hitl-review-decisions-template.json',
      targetPending: 12,
      pendingActions: 12,
      requiredFields: [
        'action',
        'approvedDefectType',
        'manufacturingImageConfirmed',
        'labelConfirmed',
        'reviewer.id',
        'decidedAt',
        'reviewComment'
      ],
      allowedActions: [
        'approve_candidate',
        'mark_needs_review',
        'reject_candidate',
        'request_recapture'
      ],
      decisionIdentifierField: 'queueId',
      decisionIdsPreview: ['pending-hitl-001'],
      verificationCommand: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>'
    },
    {
      queueCode: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      owner: 'knowledge_owner',
      sourceArtifact: 'C:\\repo\\artifacts\\common-agent-web-knowledge-hitl-decisions-template.json',
      targetPending: 40,
      pendingActions: 43,
      requiredFields: [
        'action',
        'reviewerId',
        'decidedAt',
        'reviewComment',
        'confirmed',
        'reviewedPhenomenon',
        'causeCandidates',
        'actions'
      ],
      allowedActions: [
        'approve_card',
        'mark_needs_changes',
        'reject_card'
      ],
      decisionIdentifierField: 'caseId',
      decisionIdsPreview: ['web-basf-04-weld-line'],
      verificationCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>'
    }
  ]
});

const sourceFiles = () => new Map([
  [
    'C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json',
    '{"contractVersion":"vision-approved-label-conflict-decisions/v1","decisions":[]}\n'
  ],
  [
    'C:\\repo\\artifacts\\common-agent-hitl-review-decisions-template.json',
    '{"contractVersion":"common-agent-hitl-review-decisions/v1","decisions":[]}\n'
  ],
  [
    'C:\\repo\\artifacts\\common-agent-web-knowledge-hitl-decisions-template.json',
    '{"contractVersion":"common-agent-web-knowledge-hitl-decisions-template/v1","decisions":[]}\n'
  ]
]);

test('creates editable decision copies while preserving source templates', () => {
  const sources = sourceFiles();
  const writes = new Map();

  const manifest = createOperationalHitlEditableDecisionWorkspace({
    generatedAt: '2026-07-27T13:40:00.000Z',
    inputReviewPacket: inputReviewPacket(),
    workspaceRoot: 'C:\\repo\\artifacts\\operational-hitl-editable-decision-workspace-fixed',
    sourceArtifacts: {
      inputReviewPacket: 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json'
    },
    readFileText: filePath => sources.get(filePath),
    writeFileText: (filePath, content) => writes.set(filePath, content)
  });

  assert.equal(manifest.contractVersion, 'operational-hitl-editable-decision-workspace/v1');
  assert.equal(manifest.status, 'ready_for_human_edit');
  assert.equal(manifest.serviceWritesPerformed, false);
  assert.equal(manifest.policy.autoApplyAllowed, false);
  assert.equal(manifest.policy.allowGraphPromotion, false);
  assert.equal(manifest.policy.allowReferenceLearning, false);
  assert.equal(manifest.policy.allowModelTraining, false);
  assert.equal(manifest.summary.totalDecisionInputsMissing, 56);
  assert.equal(manifest.summary.workspaceFileCount, 3);
  assert.equal(manifest.summary.copiedSourceFileCount, 3);
  assert.equal(manifest.summary.firstEditableQueueCode, 'vision_label_conflicts');
  assert.deepEqual(manifest.editableFiles.map(item => item.queueCode), [
    'vision_label_conflicts',
    'vision_pending_hitl',
    'web_knowledge_hitl'
  ]);
  assert.deepEqual(manifest.editableFiles.map(item => path.basename(item.editablePath)), [
    '01-vision-label-conflicts.decisions.json',
    '02-vision-pending-hitl.decisions.json',
    '03-web-knowledge-hitl.decisions.json'
  ]);
  assert.ok(manifest.editableFiles.every(item => item.sourcePreserved === true));
  assert.ok(manifest.editableFiles.every(item => item.verifyCommand.includes(item.editablePath)));
  assert.ok(manifest.editableFiles.every(item => !item.verifyCommand.includes('<filled')));
  assert.deepEqual(manifest.writtenArtifacts.map(item => path.basename(item.path)), [
    '01-vision-label-conflicts.decisions.json',
    '02-vision-pending-hitl.decisions.json',
    '03-web-knowledge-hitl.decisions.json',
    'README.md',
    'manifest.json'
  ]);
  assert.equal(
    writes.get(manifest.editableFiles[0].editablePath),
    sources.get('C:\\repo\\artifacts\\vision-approved-label-conflict-decisions-template.json')
  );
  assert.match(writes.get(manifest.readmePath), /원본 template 파일은 수정하지 마세요/);
  assert.match(writes.get(manifest.readmePath), /vision_label_conflicts/);
  assert.match(writes.get(manifest.manifestPath), /operational-hitl-editable-decision-workspace\/v1/);
  assert.equal(manifest.sources.inputReviewPacket, 'C:\\repo\\artifacts\\operational-hitl-decision-input-review-packet.json');
  assert.match(manifest.recommendedAction, /01-vision-label-conflicts/);
});

test('fails closed without writes when required evidence is missing', () => {
  const writes = new Map();
  const manifest = createOperationalHitlEditableDecisionWorkspace({
    generatedAt: '2026-07-27T13:41:00.000Z',
    writeFileText: (filePath, content) => writes.set(filePath, content)
  });

  assert.equal(manifest.status, 'missing_evidence');
  assert.equal(manifest.serviceWritesPerformed, false);
  assert.equal(manifest.summary.missingArtifacts, 1);
  assert.deepEqual(manifest.editableFiles, []);
  assert.deepEqual(manifest.writtenArtifacts, []);
  assert.equal(writes.size, 0);
  assert.match(manifest.recommendedAction, /operational:hitl:decision-review-packet/);
});

test('fails closed before writing when a template source cannot be read', () => {
  const writes = new Map();
  const manifest = createOperationalHitlEditableDecisionWorkspace({
    generatedAt: '2026-07-27T13:42:00.000Z',
    inputReviewPacket: inputReviewPacket(),
    workspaceRoot: 'C:\\repo\\artifacts\\operational-hitl-editable-decision-workspace-fixed',
    readFileText: () => null,
    writeFileText: (filePath, content) => writes.set(filePath, content)
  });

  assert.equal(manifest.status, 'missing_source_templates');
  assert.equal(manifest.summary.missingSourceTemplateCount, 3);
  assert.equal(manifest.summary.copiedSourceFileCount, 0);
  assert.deepEqual(manifest.writtenArtifacts, []);
  assert.equal(writes.size, 0);
  assert.match(manifest.recommendedAction, /decision template/);
});
