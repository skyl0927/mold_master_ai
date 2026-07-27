const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDecisionInputReviewPacket
} = require('../operationalHitlDecisionInputReviewPacket');

const labelConflictTemplate = () => ({
  contractVersion: 'vision-approved-label-conflict-decisions/v1',
  status: 'template_ready',
  serviceWritesPerformed: false,
  reviewer: { id: '', name: '' },
  reviewedAt: '',
  summary: {
    conflicts: 2,
    decisionsPrepared: 2
  },
  verification: {
    command: 'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>'
  },
  decisions: [
    {
      conflictId: 'conflict-001',
      action: 'pending',
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
        ],
        mark_needs_review: [
          'action',
          'reviewer.id',
          'decidedAt',
          'reviewComment'
        ],
        request_recapture: [
          'action',
          'requestedViews',
          'reviewer.id',
          'decidedAt',
          'reviewComment'
        ]
      },
      selectedLabel: '',
      imageSetConfirmed: false,
      labelConfirmed: false,
      requestedViews: [],
      decidedAt: '',
      reviewComment: ''
    },
    {
      conflictId: 'conflict-002',
      action: 'pending',
      allowedActions: ['keep_label', 'mark_needs_review'],
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
      selectedLabel: '',
      imageSetConfirmed: false,
      labelConfirmed: false,
      decidedAt: '',
      reviewComment: ''
    }
  ]
});

const visionHitlTemplate = () => ({
  contractVersion: 'common-agent-hitl-review-decisions/v1',
  status: 'template_ready',
  serviceWritesPerformed: false,
  reviewer: { id: '', name: '' },
  reviewedAt: '',
  summary: {
    queueItems: 3,
    decisionsPrepared: 3
  },
  verification: {
    command: 'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>'
  },
  decisions: [
    {
      queueId: 'pending-hitl-001',
      contentSha256: 'a'.repeat(64),
      defectType: '싱크',
      defectClass: 'sink',
      action: 'pending',
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
        ],
        request_recapture: [
          'action',
          'requestedViews',
          'reviewer.id',
          'decidedAt',
          'reviewComment'
        ]
      },
      approvedDefectType: '싱크',
      manufacturingImageConfirmed: false,
      labelConfirmed: false,
      requestedViews: [],
      decidedAt: '',
      reviewComment: ''
    },
    {
      queueId: 'pending-hitl-002',
      contentSha256: 'b'.repeat(64),
      defectType: '흑점/탄화',
      defectClass: 'burn',
      action: 'pending',
      allowedActions: ['approve_candidate', 'mark_needs_review']
    },
    {
      queueId: 'pending-hitl-003',
      contentSha256: 'c'.repeat(64),
      defectType: '플래시',
      defectClass: 'flash',
      action: 'pending',
      allowedActions: ['approve_candidate', 'reject_candidate']
    }
  ]
});

const webKnowledgeTemplate = () => ({
  contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
  status: 'template_ready',
  serviceWritesPerformed: false,
  reviewer: { id: '', name: '', reviewedAt: '' },
  summary: {
    totalCards: 4,
    targetCardCount: 3,
    currentApprovalsMissing: 3,
    decisionsPrepared: 4,
    pendingCards: 4
  },
  decisions: [
    {
      caseId: 'web-case-001',
      sourceContentSha256: 'd'.repeat(64),
      defectClass: 'weld_line',
      action: 'pending',
      allowedActions: ['approve_card', 'mark_needs_changes', 'reject_card'],
      reviewedDefectName: '웰드라인',
      reviewedProblem: '사출 성형품에서 웰드라인 결함이 발생한다.',
      reviewedPhenomenon: '',
      causeCandidates: [],
      causeLabels: [],
      checkItems: [],
      actions: [],
      reviewerId: '',
      reviewComment: '',
      decidedAt: '',
      confirmed: false
    },
    {
      caseId: 'web-case-002',
      sourceContentSha256: 'e'.repeat(64),
      defectClass: 'delamination',
      action: 'pending',
      allowedActions: ['approve_card', 'mark_needs_changes', 'reject_card']
    },
    {
      caseId: 'web-case-003',
      sourceContentSha256: 'f'.repeat(64),
      defectClass: 'flash',
      action: 'pending',
      allowedActions: ['approve_card', 'reject_card']
    },
    {
      caseId: 'web-case-004',
      sourceContentSha256: '1'.repeat(64),
      defectClass: 'sink',
      action: 'pending',
      allowedActions: ['approve_card', 'mark_needs_changes']
    }
  ]
});

test('builds a safe decision input review packet from prepared HITL templates', () => {
  const packet = buildOperationalHitlDecisionInputReviewPacket({
    generatedAt: '2026-07-27T13:00:00.000Z',
    decisionTemplates: {
      labelConflict: labelConflictTemplate(),
      visionPendingHitl: visionHitlTemplate(),
      webKnowledgeHitl: webKnowledgeTemplate()
    },
    sourceArtifacts: {
      labelConflict: 'artifacts/vision-approved-label-conflict-decisions-template.json',
      visionPendingHitl: 'artifacts/common-agent-hitl-review-decisions-template.json',
      webKnowledgeHitl: 'artifacts/common-agent-web-knowledge-hitl-decisions-template.json'
    }
  });

  assert.equal(packet.contractVersion, 'operational-hitl-decision-input-review-packet/v1');
  assert.equal(packet.status, 'awaiting_human_input');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.policy.autoApplyAllowed, false);
  assert.equal(packet.policy.allowGraphPromotion, false);
  assert.equal(packet.policy.allowReferenceLearning, false);
  assert.equal(packet.policy.allowModelTraining, false);
  assert.equal(packet.summary.totalTemplateItems, 9);
  assert.equal(packet.summary.totalPendingActions, 9);
  assert.equal(packet.summary.targetDecisionInputsMissing, 8);
  assert.equal(packet.summary.firstQueueCode, 'vision_label_conflicts');
  assert.deepEqual(packet.reviewOrder.map(item => item.queueCode), [
    'vision_label_conflicts',
    'vision_pending_hitl',
    'web_knowledge_hitl'
  ]);
  assert.deepEqual(packet.sections.map(section => section.queueCode), [
    'vision_label_conflicts',
    'vision_pending_hitl',
    'web_knowledge_hitl'
  ]);
  assert.equal(packet.sections[0].preparedDecisionItems, 2);
  assert.equal(packet.sections[0].pendingActions, 2);
  assert.equal(packet.sections[0].decisionIdentifierField, 'conflictId');
  assert.deepEqual(packet.sections[0].requiredFields, [
    'action',
    'selectedLabel',
    'imageSetConfirmed',
    'labelConfirmed',
    'reviewer.id',
    'decidedAt',
    'reviewComment',
    'requestedViews'
  ]);
  assert.equal(packet.sections[1].decisionIdentifierField, 'queueId');
  assert.ok(packet.sections[1].requiredFields.includes('manufacturingImageConfirmed'));
  assert.equal(packet.sections[2].targetPending, 3);
  assert.equal(packet.sections[2].preparedDecisionItems, 4);
  assert.ok(packet.sections[2].requiredFields.includes('reviewedPhenomenon'));
  assert.ok(packet.sections[2].requiredFields.includes('confirmed'));
  assert.deepEqual(packet.humanGatedCommands, [
    'npm run vision:label-conflicts:verify-decisions -- --decisions <filled-vision-label-conflict-decisions.json>',
    'npm run vision:hitl:verify-decisions -- --decisions <filled-common-agent-hitl-decisions.json>',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions <filled-web-knowledge-hitl-decisions.json>'
  ]);
  assert.equal(packet.sources.labelConflict, 'artifacts/vision-approved-label-conflict-decisions-template.json');
  assert.match(packet.recommendedAction, /vision_label_conflicts/);
});

test('fails closed when prepared decision templates are missing', () => {
  const packet = buildOperationalHitlDecisionInputReviewPacket({
    generatedAt: '2026-07-27T13:01:00.000Z'
  });

  assert.equal(packet.status, 'missing_evidence');
  assert.equal(packet.serviceWritesPerformed, false);
  assert.equal(packet.summary.missingArtifacts, 3);
  assert.deepEqual(packet.summary.missingArtifactNames, [
    'labelConflict',
    'visionPendingHitl',
    'webKnowledgeHitl'
  ]);
  assert.deepEqual(packet.sections, []);
  assert.deepEqual(packet.humanGatedCommands, []);
  assert.match(packet.recommendedAction, /operational:hitl:prepare-run/);
});
