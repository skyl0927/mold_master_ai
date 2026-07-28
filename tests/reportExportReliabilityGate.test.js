const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildReportExportReliabilityGate
} = require('../reportExportReliabilityGate');

const reliabilityCard = overrides => ({
  contractVersion: 'vision-diagnostic-reliability-card/v1',
  status: 'auto_report_ready',
  contaminationRisk: 'low',
  confidenceScore: 92,
  automaticReportAllowed: true,
  graphRetrievalAllowed: true,
  causeCountermeasureAllowed: true,
  llmSupplementAllowed: true,
  humanReviewRequired: false,
  serviceWritesAllowed: false,
  policy: {
    failClosed: true,
    top1VisionCandidateTrustedAlone: false,
    graphGroundingRequiredForFinalReport: true,
    llmSupplementRequiresGraphAcceptance: true,
    modelTrainingAllowed: false,
    graphPromotionAllowed: false
  },
  candidateSummary: {
    topCandidate: 'whitening',
    topCandidateConfidence: 0.91,
    topCandidateMargin: 0.52,
    topK: [
      { rank: 1, defectType: 'whitening', confidence: 0.91, supportingObservationCount: 3, contradictingObservationCount: 0 }
    ]
  },
  riskReasons: [],
  nextActions: ['use_graph_grounded_report'],
  evidence: {
    visionSafetyStatus: 'reliable',
    graphGrounded: true,
    graphTopCandidateSupported: true,
    graphAutoFinalizeAllowed: true,
    visionGraphConflict: false,
    classifierStatus: 'accepted'
  },
  ...overrides
});

const capturedImage = (id, card) => ({
  id,
  dataUrl: 'data:image/png;base64,AAAA',
  analysis: {
    defectType: 'whitening',
    description: 'rib 주변 백화',
    countermeasures: '취출 간섭 확인',
    visionSummary: card ? { diagnosticReliabilityCard: card } : undefined
  }
});

const reportItem = (id, images) => ({
  id,
  images,
  analysis: {
    problem: '리브 주변 백화',
    cause: '취출 간섭 가능성',
    countermeasures: '이젝터/언더컷/취출 조건 확인'
  }
});

test('allows report export when every reliability card is auto-report-ready', () => {
  const gate = buildReportExportReliabilityGate([
    reportItem('section-1', [capturedImage('image-1', reliabilityCard())])
  ], { exportType: 'pptx' });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.exportAllowed, true);
  assert.equal(gate.verifiedWriteAllowed, true);
  assert.equal(gate.checkedImageCount, 1);
  assert.equal(gate.cardCount, 1);
  assert.equal(gate.blockedCount, 0);
  assert.deepEqual(gate.blockers, []);
});

test('blocks final report export when Graph cross-check is still required', () => {
  const gate = buildReportExportReliabilityGate([
    reportItem('section-1', [
      capturedImage('image-1', reliabilityCard({
        status: 'graph_cross_check_required',
        contaminationRisk: 'medium',
        automaticReportAllowed: false,
        causeCountermeasureAllowed: false,
        llmSupplementAllowed: false,
        humanReviewRequired: true,
        evidence: {
          visionSafetyStatus: 'reliable',
          graphGrounded: false,
          graphTopCandidateSupported: false,
          graphAutoFinalizeAllowed: false,
          visionGraphConflict: false,
          classifierStatus: 'accepted'
        }
      }))
    ])
  ], { exportType: 'pptx' });

  assert.equal(gate.status, 'blocked');
  assert.equal(gate.exportAllowed, false);
  assert.equal(gate.verifiedWriteAllowed, true);
  assert.equal(gate.blockedCount, 1);
  assert.equal(gate.blockers[0].action, 'copy_final_report');
  assert.equal(gate.blockers[0].imageId, 'image-1');
  assert.equal(gate.blockers[0].itemId, 'section-1');
  assert.match(gate.message, /리포트 생성이 보류되었습니다/);
});

test('blocks verified export writes and promotion when a card is blocked', () => {
  const gate = buildReportExportReliabilityGate([
    reportItem('section-1', [
      capturedImage('image-1', reliabilityCard({
        status: 'blocked',
        contaminationRisk: 'blocked',
        confidenceScore: 0,
        automaticReportAllowed: false,
        graphRetrievalAllowed: false,
        causeCountermeasureAllowed: false,
        llmSupplementAllowed: false,
        humanReviewRequired: true,
        riskReasons: ['image_quality_rejected']
      }))
    ])
  ], { exportType: 'pptx', verified: true });

  assert.equal(gate.status, 'blocked');
  assert.equal(gate.exportAllowed, false);
  assert.equal(gate.verifiedWriteAllowed, false);
  assert.equal(gate.blockedCount, 2);
  assert.deepEqual(gate.blockers.map(blocker => blocker.action), [
    'copy_final_report',
    'approve_graph_promotion'
  ]);
});

test('keeps legacy images exportable while warning that no reliability card exists', () => {
  const gate = buildReportExportReliabilityGate([
    capturedImage('legacy-image', null)
  ], { exportType: 'xlsx' });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.exportAllowed, true);
  assert.equal(gate.verifiedWriteAllowed, true);
  assert.equal(gate.checkedImageCount, 1);
  assert.equal(gate.cardCount, 0);
  assert.equal(gate.warnings.length, 1);
  assert.equal(gate.warnings[0].code, 'legacy_reliability_card_missing');
});

test('flattens mixed report items and identifies the exact blocked image', () => {
  const gate = buildReportExportReliabilityGate([
    reportItem('section-ready', [capturedImage('image-ready', reliabilityCard())]),
    reportItem('section-hitl', [
      capturedImage('image-hitl', reliabilityCard({
        status: 'hitl_required',
        contaminationRisk: 'high',
        automaticReportAllowed: false,
        causeCountermeasureAllowed: false,
        humanReviewRequired: true
      }))
    ])
  ], { exportType: 'pptx' });

  assert.equal(gate.checkedImageCount, 2);
  assert.equal(gate.cardCount, 2);
  assert.equal(gate.status, 'blocked');
  assert.equal(gate.blockedCount, 1);
  assert.equal(gate.blockers[0].imageId, 'image-hitl');
  assert.equal(gate.blockers[0].itemId, 'section-hitl');
});
