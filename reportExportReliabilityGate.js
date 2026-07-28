const {
  buildVisionDiagnosticReliabilityActionGate
} = require('./visionDiagnosticReliabilityDisplay');

const CONTRACT_VERSION = 'report-export-reliability-gate/v1';
const RELIABILITY_CARD_VERSION = 'vision-diagnostic-reliability-card/v1';

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const asArray = value => Array.isArray(value) ? value : [];

const isCapturedImage = value =>
  value
  && typeof value === 'object'
  && typeof value.dataUrl === 'string';

const isReportItem = value =>
  value
  && typeof value === 'object'
  && Array.isArray(value.images);

const flattenImages = items =>
  asArray(items).flatMap((entry, index) => {
    if (isReportItem(entry)) {
      return asArray(entry.images).map((image, imageIndex) => ({
        image,
        itemId: compact(entry.id) || `item-${index + 1}`,
        imageIndex
      })).filter(record => record.image && typeof record.image === 'object');
    }

    if (isCapturedImage(entry) || (entry && typeof entry === 'object')) {
      return [{
        image: entry,
        itemId: '',
        imageIndex: index
      }];
    }

    return [];
  });

const getDiagnosticReliabilityCard = image =>
  image?.analysis?.visionSummary?.diagnosticReliabilityCard
  || image?.visionSummary?.diagnosticReliabilityCard
  || image?.analysis?.diagnosticReliabilityCard
  || image?.diagnosticReliabilityCard
  || null;

const isCompatibleReliabilityCard = card =>
  card
  && typeof card === 'object'
  && compact(card.contractVersion) === RELIABILITY_CARD_VERSION
  && compact(card.status);

const buildWarning = (record, code, message) => ({
  code,
  imageId: compact(record.image?.id) || `image-${record.imageIndex + 1}`,
  itemId: record.itemId,
  message
});

const buildBlocker = (record, card, gate) => ({
  action: gate.action,
  imageId: compact(record.image?.id) || `image-${record.imageIndex + 1}`,
  itemId: record.itemId,
  status: compact(card.status),
  defectType: compact(record.image?.analysis?.defectType || card.candidateSummary?.topCandidate),
  message: gate.message
});

const buildReportExportReliabilityGate = (items, options = {}) => {
  const exportType = compact(options.exportType) || 'pptx';
  const verified = options.verified === true;
  const records = flattenImages(items);
  const blockers = [];
  const warnings = [];
  let cardCount = 0;

  for (const record of records) {
    const card = getDiagnosticReliabilityCard(record.image);
    if (!card) {
      warnings.push(buildWarning(
        record,
        'legacy_reliability_card_missing',
        'Vision 신뢰도 카드가 없는 기존 데이터라 레거시 정책으로 export를 허용합니다.'
      ));
      continue;
    }

    if (!isCompatibleReliabilityCard(card)) {
      warnings.push(buildWarning(
        record,
        'legacy_reliability_card_incompatible',
        'Vision 신뢰도 카드 버전이 맞지 않아 레거시 정책으로 export를 허용합니다.'
      ));
      continue;
    }

    cardCount += 1;
    const reportGate = buildVisionDiagnosticReliabilityActionGate(card, 'copy_final_report');
    if (!reportGate.allowed) {
      blockers.push(buildBlocker(record, card, reportGate));
    }

    if (verified) {
      const verifiedGate = buildVisionDiagnosticReliabilityActionGate(card, 'approve_graph_promotion');
      if (!verifiedGate.allowed) {
        blockers.push(buildBlocker(record, card, verifiedGate));
      }
    }
  }

  const exportAllowed = blockers.every(blocker => blocker.action !== 'copy_final_report');
  const verifiedWriteAllowed = !verified || blockers.every(blocker => blocker.action !== 'approve_graph_promotion');
  const status = blockers.length > 0 ? 'blocked' : 'passed';
  const message = status === 'blocked'
    ? 'Vision 신뢰도 검증이 끝나지 않아 리포트 생성이 보류되었습니다. HITL 검토 또는 Graph 교차검증 후 다시 시도하세요.'
    : warnings.length > 0
      ? '리포트 생성 가능: 일부 기존 데이터는 Vision 신뢰도 카드가 없어 레거시 정책으로 처리됩니다.'
      : 'Vision 신뢰도 검증을 통과해 리포트 생성이 가능합니다.';

  return {
    contractVersion: CONTRACT_VERSION,
    exportType,
    verified,
    status,
    exportAllowed,
    verifiedWriteAllowed,
    checkedImageCount: records.length,
    cardCount,
    blockedCount: blockers.length,
    blockers,
    warnings,
    message
  };
};

module.exports = {
  buildReportExportReliabilityGate
};
