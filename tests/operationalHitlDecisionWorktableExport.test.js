const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOperationalHitlDecisionWorktableExport
} = require('../operationalHitlDecisionWorktableExport');

const workspaceManifest = () => ({
  contractVersion: 'operational-hitl-editable-decision-workspace/v1',
  status: 'ready_for_human_edit',
  serviceWritesPerformed: false,
  summary: {
    totalDecisionInputsMissing: 3,
    workspaceFileCount: 2,
    firstEditableQueueCode: 'vision_label_conflicts'
  },
  editableFiles: [
    {
      queueCode: 'vision_label_conflicts',
      titleKo: '승인 이미지 라벨 충돌 판정',
      owner: 'quality_hitl',
      editablePath: 'C:\\repo\\workspace\\01-vision-label-conflicts.decisions.json',
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
      decisions: [
        {
          conflictId: 'conflict-001',
          conflictType: 'same_hash_multi_label',
          candidateLabels: ['제팅', '플로우마크'],
          affectedCaseIds: ['approved-image-001', 'approved-image-002'],
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
            request_recapture: [
              'action',
              'requestedViews',
              'reviewer.id',
              'decidedAt',
              'reviewComment'
            ]
          },
          evidence: {
            humanReviewFocusKo: '동일 이미지 hash에서 실제 지배 결함을 확인하세요.'
          }
        }
      ]
    })
  ],
  [
    'C:\\repo\\workspace\\02-vision-pending-hitl.decisions.json',
    JSON.stringify({
      contractVersion: 'common-agent-hitl-review-decisions/v1',
      decisions: [
        {
          queueId: 'pending-hitl-001',
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
            ]
          },
          evidence: {
            visionSummary: '두꺼운 단면부에서 함몰 형상이 관찰됩니다.'
          }
        },
        {
          queueId: 'pending-hitl-002',
          defectType: '플래시',
          defectClass: 'flash',
          action: 'reject_candidate',
          reviewComment: '웹 도식 이미지라 제조 이미지로 보기 어렵습니다.'
        }
      ]
    })
  ]
]);

test('exports editable HITL decisions as no-write CSV and Markdown worktables', () => {
  const files = editableFiles();
  const exportPacket = buildOperationalHitlDecisionWorktableExport({
    generatedAt: '2026-07-27T13:15:00.000Z',
    workspaceManifest: workspaceManifest(),
    sourceArtifacts: {
      workspaceManifest: 'C:\\repo\\workspace\\manifest.json'
    },
    readFileText: filePath => files.get(filePath)
  });

  assert.equal(exportPacket.contractVersion, 'operational-hitl-decision-worktable-export/v1');
  assert.equal(exportPacket.status, 'ready_for_human_edit');
  assert.equal(exportPacket.serviceWritesPerformed, false);
  assert.equal(exportPacket.policy.autoApplyAllowed, false);
  assert.equal(exportPacket.policy.autoVerifyAllowed, false);
  assert.equal(exportPacket.summary.workspaceFileCount, 2);
  assert.equal(exportPacket.summary.decisionRowCount, 3);
  assert.equal(exportPacket.summary.pendingRowCount, 2);
  assert.equal(exportPacket.summary.actionableRowCount, 1);
  assert.equal(exportPacket.summary.queueCount, 2);
  assert.deepEqual(exportPacket.columns.slice(0, 6), [
    'queueCode',
    'decisionId',
    'titleKo',
    'owner',
    'currentAction',
    'rowStatus'
  ]);
  assert.equal(exportPacket.rows[0].decisionId, 'conflict-001');
  assert.equal(exportPacket.rows[0].displayLabel, '제팅 | 플로우마크');
  assert.equal(exportPacket.rows[0].rowStatus, 'pending');
  assert.match(exportPacket.rows[0].reviewFocusKo, /지배 결함/);
  assert.equal(exportPacket.rows[1].decisionId, 'pending-hitl-001');
  assert.equal(exportPacket.rows[1].displayLabel, '싱크 / sink');
  assert.match(exportPacket.rows[1].reviewFocusKo, /함몰 형상/);
  assert.equal(exportPacket.rows[2].rowStatus, 'action_entered');
  assert.match(exportPacket.csv, /^queueCode,decisionId,titleKo,owner,currentAction,rowStatus/m);
  assert.match(exportPacket.csv, /"제팅 \| 플로우마크"/);
  assert.match(exportPacket.markdown, /# Operational HITL Decision Worktable/);
  assert.match(exportPacket.markdown, /pending-hitl-001/);
  assert.match(exportPacket.markdown, /자동 적용 금지/);
  assert.equal(exportPacket.sources.workspaceManifest, 'C:\\repo\\workspace\\manifest.json');
  assert.match(exportPacket.recommendedAction, /CSV/);
});

test('fails closed when workspace manifest evidence is missing', () => {
  const exportPacket = buildOperationalHitlDecisionWorktableExport({});

  assert.equal(exportPacket.status, 'missing_evidence');
  assert.equal(exportPacket.serviceWritesPerformed, false);
  assert.equal(exportPacket.summary.missingArtifacts, 1);
  assert.deepEqual(exportPacket.rows, []);
  assert.equal(exportPacket.csv, '');
  assert.equal(exportPacket.markdown, '');
  assert.match(exportPacket.recommendedAction, /operational:hitl:editable-workspace/);
});

test('marks rows from unreadable editable files as blocked without throwing', () => {
  const exportPacket = buildOperationalHitlDecisionWorktableExport({
    workspaceManifest: workspaceManifest(),
    readFileText: () => null
  });

  assert.equal(exportPacket.status, 'blocked_missing_editable_files');
  assert.equal(exportPacket.summary.missingEditableFileCount, 2);
  assert.equal(exportPacket.summary.decisionRowCount, 2);
  assert.ok(exportPacket.rows.every(row => row.rowStatus === 'missing_editable_file'));
  assert.match(exportPacket.csv, /missing_editable_file/);
  assert.match(exportPacket.recommendedAction, /workspace/);
});

test('exports Web Knowledge required review fields without dropping source suggestions', () => {
  const editablePath = 'C:\\repo\\workspace\\03-web-knowledge-hitl.decisions.json';
  const exportPacket = buildOperationalHitlDecisionWorktableExport({
    workspaceManifest: {
      contractVersion: 'operational-hitl-editable-decision-workspace/v1',
      summary: {
        totalDecisionInputsMissing: 1,
        workspaceFileCount: 1
      },
      editableFiles: [
        {
          queueCode: 'web_knowledge_hitl',
          titleKo: 'Web Knowledge HITL 승인',
          owner: 'knowledge_owner',
          editablePath,
          allowedActions: ['approve_card', 'mark_needs_changes', 'reject_card'],
          requiredFields: [
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
          ],
          decisionIdentifierField: 'caseId',
          verifyCommand: 'npm run knowledge:web:hitl:verify-decisions -- --decisions "C:\\repo\\workspace\\03-web-knowledge-hitl.decisions.json"'
        }
      ]
    },
    readFileText: filePath => filePath === editablePath
      ? JSON.stringify({
        contractVersion: 'common-agent-web-knowledge-hitl-decisions-template/v1',
        decisions: [
          {
            caseId: 'web-basf-04-weld-line',
            action: 'pending',
            reviewedDefectName: '웰드라인',
            reviewedProblem: '사출 성형품에서 웰드라인 결함이 발생한다.',
            reviewedPhenomenon: '두 수지 유동 선단이 합류한 위치에 선형 자국이 보인다.',
            causeCandidates: ['두 개 이상의 용융 수지 선단이 낮은 온도로 합류한다.'],
            suggestedCauseLabels: ['유동 선단', '금형 온도'],
            suggestedCheckItems: ['보압 절환점 확인', '벤트 청소 상태 확인'],
            suggestedActions: ['수지 온도 상승', '게이트 위치 검토']
          }
        ]
      })
      : null
  });

  assert.equal(exportPacket.status, 'ready_for_human_edit');
  assert.ok(exportPacket.columns.includes('reviewedDefectName'));
  assert.ok(exportPacket.columns.includes('reviewedProblem'));
  assert.ok(exportPacket.columns.includes('reviewedPhenomenon'));
  assert.equal(exportPacket.rows[0].reviewedDefectName, '웰드라인');
  assert.equal(exportPacket.rows[0].reviewedProblem, '사출 성형품에서 웰드라인 결함이 발생한다.');
  assert.equal(exportPacket.rows[0].reviewedPhenomenon, '두 수지 유동 선단이 합류한 위치에 선형 자국이 보인다.');
  assert.equal(exportPacket.rows[0].causeLabels, '유동 선단 | 금형 온도');
  assert.equal(exportPacket.rows[0].checkItems, '보압 절환점 확인 | 벤트 청소 상태 확인');
  assert.equal(exportPacket.rows[0].actions, '수지 온도 상승 | 게이트 위치 검토');
  assert.match(exportPacket.csv, /reviewedDefectName,reviewedProblem,reviewedPhenomenon/);
  assert.match(exportPacket.csv, /두 수지 유동 선단이 합류한 위치/);
});
