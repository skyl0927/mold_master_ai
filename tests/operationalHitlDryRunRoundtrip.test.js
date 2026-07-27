const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDryRunRoundtrip
} = require('../operationalHitlDryRunRoundtrip');

const workspaceManifest = () => ({
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  editableFiles: [
    {
      queueCode: 'vision_pending_hitl',
      titleKo: 'Vision pending HITL 판정',
      editablePath: 'C:\\repo\\workspace\\vision.decisions.json',
      allowedActions: ['approve_candidate', 'request_recapture'],
      decisionIdentifierField: 'queueId',
      verifyCommand: 'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\vision.decisions.json"'
    },
    {
      queueCode: 'web_knowledge_hitl',
      titleKo: 'Web Knowledge HITL 승인',
      editablePath: 'C:\\repo\\workspace\\web.decisions.json',
      allowedActions: ['approve_card', 'mark_needs_changes'],
      decisionIdentifierField: 'caseId',
      verifyCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\web.decisions.json"'
    }
  ]
});

const editableFiles = () => new Map([
  [
    'C:\\repo\\workspace\\vision.decisions.json',
    JSON.stringify({
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      decisions: [
        {
          queueId: 'pending-hitl-001',
          defectType: '싱크',
          defectClass: 'sink',
          action: 'pending',
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
          approvedDefectType: '싱크'
        }
      ]
    }, null, 2)
  ],
  [
    'C:\\repo\\workspace\\web.decisions.json',
    JSON.stringify({
      contractVersion: 'common-agent-web-knowledge-hitl-decisions/v1',
      decisions: [
        {
          caseId: 'web-basf-14-sink-marks',
          action: 'pending',
          requiredFieldsByAction: {
            approve_card: [
              'action',
              'reviewerId',
              'decidedAt',
              'reviewComment',
              'confirmed',
              'reviewedDefectName',
              'reviewedProblem',
              'reviewedPhenomenon',
              'causeCandidates',
              'causeLabels',
              'checkItems',
              'actions'
            ]
          }
        }
      ]
    }, null, 2)
  ]
]);

const worktableExport = () => ({
  contractVersion: 'operational-hitl-decision-worktable-export/v1',
  rows: [
    {
      queueCode: 'vision_pending_hitl',
      decisionId: 'pending-hitl-001',
      currentAction: 'pending',
      rowStatus: 'pending',
      displayLabel: '싱크 / sink',
      approvedDefectType: '싱크',
      editablePath: 'C:\\repo\\workspace\\vision.decisions.json'
    },
    {
      queueCode: 'web_knowledge_hitl',
      decisionId: 'web-basf-14-sink-marks',
      currentAction: 'pending',
      rowStatus: 'pending',
      displayLabel: '싱크 / sink',
      editablePath: 'C:\\repo\\workspace\\web.decisions.json'
    }
  ]
});

const worktableSuggestion = overrides => ({
  contractVersion: 'operational-hitl-decision-worktable-suggestion/v1',
  rows: [
    {
      queueCode: 'vision_pending_hitl',
      decisionId: 'pending-hitl-001',
      recommendedNewAction: 'approve_candidate',
      recommendationReasonKo: '비전 설명과 결함명이 일치하는 승인 후보입니다.',
      suggestedReviewComment: '원본 제조 이미지와 결함 라벨을 확인한 뒤 승인 후보로 검토합니다.',
      suggestedApprovedDefectType: '싱크'
    },
    {
      queueCode: 'web_knowledge_hitl',
      decisionId: 'web-basf-14-sink-marks',
      recommendedNewAction: 'approve_card',
      recommendationReasonKo: '필수 도메인 카드 필드가 채워져 있어 승인 후보입니다.',
      suggestedReviewComment: '필수 지식 카드 필드가 충족되어 Common Agent 수동 import 후보로 검토합니다.',
      suggestedReviewedDefectName: '싱크',
      suggestedReviewedProblem: '두꺼운 리브 주변에 표면 함몰이 보인다.',
      suggestedReviewedPhenomenon: '냉각 수축으로 표면이 국부적으로 꺼진다.',
      suggestedCauseCandidates: '두꺼운 육부 냉각 지연',
      suggestedCauseLabels: '두께 편차 | 보압 부족',
      suggestedCheckItems: '리브 두께 확인 | 보압 유지 시간 확인',
      suggestedActions: '리브 두께 조정 | 보압 조건 재확인'
    }
  ],
  ...overrides
});

test('simulates recommendation-based HITL completion and validates the import path without writes', () => {
  const writes = [];
  const report = buildOperationalHitlDryRunRoundtrip({
    generatedAt: '2026-07-27T15:30:00.000Z',
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    sourceArtifacts: {
      workspaceManifest: 'C:\\repo\\workspace\\manifest.json',
      worktableExport: 'C:\\repo\\artifacts\\worktable.json',
      worktableSuggestion: 'C:\\repo\\artifacts\\suggestion.json'
    },
    readFileText: filePath => editableFiles().get(filePath),
    writeFileText: (filePath, text) => writes.push({ filePath, text })
  });

  assert.equal(report.contractVersion, 'operational-hitl-dry-run-roundtrip/v1');
  assert.equal(report.status, 'simulated_roundtrip_ready');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localEditableWritesPerformed, false);
  assert.equal(report.policy.simulationOnly, true);
  assert.equal(report.policy.humanDecisionSubstitutionAllowed, false);
  assert.equal(report.policy.allowGeneratedCsvApply, false);
  assert.equal(report.summary.totalRows, 2);
  assert.equal(report.summary.simulatedRows, 2);
  assert.equal(report.summary.importPlannedUpdates, 2);
  assert.equal(report.summary.invalidRows, 0);
  assert.equal(report.summary.filesToUpdate, 2);
  assert.equal(writes.length, 0);
  assert.match(report.simulatedCsv, /SIMULATION ONLY/);
  assert.match(report.simulatedCsv, /approve_candidate/);
  assert.match(report.simulatedCsv, /approve_card/);
  assert.deepEqual(report.verificationCommandsReady, [
    'npm run vision:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\vision.decisions.json"',
    'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\web.decisions.json"'
  ]);
  assert.match(report.recommendedAction, /실제 CSV/);
});

test('reports simulation gaps when a recommended action cannot satisfy required fields', () => {
  const files = editableFiles();
  files.set('C:\\repo\\workspace\\vision.decisions.json', JSON.stringify({
    contractVersion: 'common-agent-hitl-review-decisions/v1',
    decisions: [
      {
        queueId: 'pending-hitl-001',
        action: 'pending',
        requiredFieldsByAction: {
          approve_candidate: [
            'action',
            'approvedDefectType',
            'manufacturingImageConfirmed',
            'labelConfirmed',
            'reviewer.id',
            'decidedAt',
            'reviewComment',
            'rootCauseConfirmed'
          ]
        }
      }
    ]
  }, null, 2));

  const report = buildOperationalHitlDryRunRoundtrip({
    workspaceManifest: workspaceManifest(),
    worktableExport: worktableExport(),
    worktableSuggestion: worktableSuggestion(),
    readFileText: filePath => files.get(filePath)
  });

  assert.equal(report.status, 'simulated_roundtrip_invalid');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.summary.invalidRows, 1);
  assert.equal(report.invalidRows[0].decisionId, 'pending-hitl-001');
  assert.deepEqual(report.invalidRows[0].missingFields, ['rootCauseConfirmed']);
  assert.match(report.recommendedAction, /추천값으로도 충족되지 않는 필드/);
});

test('fails closed when required dry-run evidence is missing', () => {
  const report = buildOperationalHitlDryRunRoundtrip({});

  assert.equal(report.status, 'missing_evidence');
  assert.equal(report.serviceWritesPerformed, false);
  assert.equal(report.localEditableWritesPerformed, false);
  assert.deepEqual(report.summary.missingArtifactNames, [
    'workspaceManifest',
    'worktableExport',
    'worktableSuggestion'
  ]);
  assert.equal(report.simulatedCsv, '');
});
