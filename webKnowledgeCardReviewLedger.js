const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { toTacitKnowledgeTemplate } = require('./webKnowledgeCard');

const ALLOWED_DECISIONS = new Set(['approved', 'needs_changes', 'rejected']);
const SHA256 = /^[a-f0-9]{64}$/;

const compactWhitespace = value => String(value || '').replace(/\s+/g, ' ').trim();
const uniqueStrings = values => [...new Set(
  (values || []).map(compactWhitespace).filter(Boolean)
)];

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableValue(value[key])])
  );
};

const cardContent = card => ({
  schemaVersion: card?.schemaVersion,
  caseId: card?.caseId,
  sourceKind: card?.sourceKind,
  defectName: card?.defectName,
  defectClass: card?.defectClass,
  problem: card?.problem,
  phenomenon: card?.phenomenon,
  location: card?.location,
  part: card?.part,
  machine: card?.machine,
  material: card?.material,
  severity: card?.severity,
  causes: card?.causes || [],
  checkItems: card?.checkItems || [],
  actions: card?.actions || [],
  resultEffect: card?.resultEffect,
  evidence: card?.evidence || [],
  metadata: card?.metadata || {}
});

const cardContentSha256 = card => crypto
  .createHash('sha256')
  .update(JSON.stringify(stableValue(cardContent(card))))
  .digest('hex');

const CAUSE_LABEL_RULES = [
  [/clamp|closing force/i, '형체력'],
  [/vent|air trap|gas/i, '가스 배기'],
  [/injection speed|flow rate/i, '사출 속도'],
  [/melt temperature|material temperature/i, '수지 온도'],
  [/mold temperature|tool temperature/i, '금형 온도'],
  [/moist|dry|water/i, '수분 관리'],
  [/holding pressure|packing pressure/i, '보압'],
  [/injection pressure/i, '사출 압력'],
  [/cooling time|cooling/i, '냉각'],
  [/gate|runner|sprue/i, '게이트·러너'],
  [/wall thickness|section thickness/i, '제품 두께'],
  [/parting line|mold damage|tool damage/i, '금형 손상'],
  [/eject|demold|release/i, '취출'],
  [/screw|back pressure/i, '가소화'],
  [/contamin|foreign|black speck/i, '오염'],
  [/residence time|degradation/i, '체류·열화'],
  [/shrink|warpage/i, '수축 변형'],
  [/weld|flow front|melt fronts?/i, '유동 선단']
];

const suggestCauseLabels = card => {
  const source = (card?.causes || []).map(cause => cause?.text).join(' ');
  return uniqueStrings(
    CAUSE_LABEL_RULES
      .filter(([pattern]) => pattern.test(source))
      .map(([, label]) => label)
  ).slice(0, 8);
};

const suggestCheckItems = card => {
  const existing = uniqueStrings(card?.checkItems || []);
  if (existing.length > 0) return existing;
  return uniqueStrings((card?.causes || []).map(cause => {
    const text = compactWhitespace(cause?.text);
    return text ? `원인 조건 확인: ${text}` : '';
  })).slice(0, 8);
};

const normalizeList = (values, limit = 12) => uniqueStrings(values)
  .slice(0, limit)
  .map(value => value.slice(0, 500));

const normalizeRecord = value => {
  const caseId = compactWhitespace(value?.caseId).slice(0, 200);
  const sourceContentSha256 = compactWhitespace(value?.sourceContentSha256).toLowerCase();
  const decision = compactWhitespace(value?.decision);
  const reviewerComment = compactWhitespace(value?.reviewerComment).slice(0, 1000);
  if (!caseId || !SHA256.test(sourceContentSha256)
    || !ALLOWED_DECISIONS.has(decision) || !reviewerComment) {
    return null;
  }
  return {
    caseId,
    sourceContentSha256,
    decision,
    reviewer: compactWhitespace(value?.reviewer).slice(0, 200),
    reviewerComment,
    defectName: compactWhitespace(value?.defectName).slice(0, 200),
    problem: compactWhitespace(value?.problem).slice(0, 2000),
    phenomenon: compactWhitespace(value?.phenomenon).slice(0, 4000),
    causeCandidates: normalizeList(value?.causeCandidates),
    causeLabels: normalizeList(value?.causeLabels),
    checkItems: normalizeList(value?.checkItems),
    actions: normalizeList(value?.actions),
    reviewedAt: compactWhitespace(value?.reviewedAt)
  };
};

const validateApprovedRecord = record => {
  if (!record.defectName) return 'approved_defect_name_missing';
  if (!record.problem) return 'approved_problem_missing';
  if (!record.phenomenon) return 'approved_phenomenon_missing';
  if (record.causeCandidates.length === 0) return 'approved_cause_candidates_missing';
  if (record.causeLabels.length === 0) return 'approved_cause_labels_missing';
  if (record.checkItems.length === 0) return 'approved_check_items_missing';
  if (record.actions.length === 0) return 'approved_actions_missing';
  return null;
};

const readRecords = filePath => {
  if (!fs.existsSync(filePath)) return [];
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const values = Array.isArray(payload) ? payload : payload?.decisions;
    return (Array.isArray(values) ? values : []).map(normalizeRecord).filter(Boolean);
  } catch {
    return [];
  }
};

const writeRecords = (filePath, records) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    decisions: records
  }, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
};

const createWebKnowledgeCardReviewLedger = ({
  filePath,
  now = () => new Date()
}) => {
  if (!filePath) throw new TypeError('filePath is required');
  const recordsByCaseId = new Map(
    readRecords(filePath).map(record => [record.caseId, record])
  );

  const persist = () => writeRecords(
    filePath,
    Array.from(recordsByCaseId.values())
      .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
  );

  const get = card => {
    const record = recordsByCaseId.get(compactWhitespace(card?.caseId));
    if (!record) return null;
    return {
      ...record,
      isCurrent: record.sourceContentSha256 === cardContentSha256(card)
    };
  };

  return {
    get,

    all() {
      return Array.from(recordsByCaseId.values())
        .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt));
    },

    queue(cards) {
      return (cards || []).map(card => {
        const record = get(card);
        return {
          card,
          sourceContentSha256: cardContentSha256(card),
          decision: record?.decision || 'pending',
          isCurrent: record ? record.isCurrent : true,
          review: record,
          suggestedCauseLabels: suggestCauseLabels(card),
          suggestedCheckItems: suggestCheckItems(card),
          suggestedActions: uniqueStrings([
            ...(card?.causes || []).flatMap(cause => cause?.actions || []),
            ...(card?.actions || [])
          ])
        };
      });
    },

    summary(cards) {
      const summary = {
        total: (cards || []).length,
        pending: 0,
        approved: 0,
        needsChanges: 0,
        rejected: 0,
        stale: 0
      };
      for (const card of cards || []) {
        const record = get(card);
        if (!record) summary.pending += 1;
        else if (!record.isCurrent) summary.stale += 1;
        else if (record.decision === 'approved') summary.approved += 1;
        else if (record.decision === 'needs_changes') summary.needsChanges += 1;
        else if (record.decision === 'rejected') summary.rejected += 1;
      }
      return summary;
    },

    set(card, input) {
      const caseId = compactWhitespace(card?.caseId);
      if (!caseId) throw new Error('A card case ID is required.');
      const expectedHash = cardContentSha256(card);
      const suppliedHash = compactWhitespace(input?.sourceContentSha256).toLowerCase();
      if (suppliedHash !== expectedHash) {
        throw new Error('The source content hash does not match the current card.');
      }
      if (input?.confirmed !== true) {
        throw new Error('Explicit human confirmation is required.');
      }
      const decision = compactWhitespace(input?.decision);
      if (!ALLOWED_DECISIONS.has(decision)) {
        throw new Error('Decision must be approved, needs_changes, or rejected.');
      }
      const reviewerComment = compactWhitespace(input?.reviewerComment).slice(0, 1000);
      if (!reviewerComment) throw new Error('A reviewer comment is required.');

      const record = normalizeRecord({
        caseId,
        sourceContentSha256: expectedHash,
        decision,
        reviewer: input?.reviewer,
        reviewerComment,
        defectName: input?.defectName || card?.defectName,
        problem: input?.problem || card?.problem,
        phenomenon: input?.phenomenon || card?.phenomenon,
        causeCandidates: input?.causeCandidates?.length
          ? input.causeCandidates
          : (card?.causes || []).map(cause => cause?.text),
        causeLabels: input?.causeLabels,
        checkItems: input?.checkItems,
        actions: input?.actions,
        reviewedAt: now().toISOString()
      });
      if (!record) throw new Error('The review decision is invalid.');
      if (decision === 'approved') {
        const approvedError = validateApprovedRecord(record);
        if (approvedError === 'approved_defect_name_missing') throw new Error('A reviewed defect name is required.');
        if (approvedError === 'approved_problem_missing') throw new Error('A reviewed problem description is required.');
        if (approvedError === 'approved_phenomenon_missing') throw new Error('A reviewed phenomenon is required.');
        if (approvedError === 'approved_cause_candidates_missing') {
          throw new Error('At least one reviewed cause candidate is required.');
        }
        if (approvedError === 'approved_cause_labels_missing') throw new Error('At least one cause label is required.');
        if (approvedError === 'approved_check_items_missing') throw new Error('At least one check item is required.');
        if (approvedError === 'approved_actions_missing') throw new Error('At least one action is required.');
      }
      recordsByCaseId.set(caseId, record);
      persist();
      return { ...record, isCurrent: true };
    },

    importVerifiedUpdates(cards, updates, options = {}) {
      const apply = options.apply === true;
      const cardsByCaseId = new Map(
        (cards || []).map(card => [compactWhitespace(card?.caseId), card])
      );
      const plannedRecords = [];
      const invalidTargets = [];

      for (const update of updates || []) {
        const caseId = compactWhitespace(update?.caseId);
        const suppliedHash = compactWhitespace(update?.sourceContentSha256).toLowerCase();
        const targetCard = cardsByCaseId.get(caseId);
        if (!targetCard) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision: compactWhitespace(update?.decision),
            code: 'unknown_card',
            message: '검증된 판정 대상이 현재 Web Case collection에 없습니다.'
          });
          continue;
        }

        const expectedHash = cardContentSha256(targetCard);
        if (suppliedHash !== expectedHash) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            expectedSourceContentSha256: expectedHash,
            decision: compactWhitespace(update?.decision),
            code: 'source_content_hash_mismatch',
            message: '검증된 판정 source hash가 현재 카드 hash와 일치하지 않습니다.'
          });
          continue;
        }
        if (update?.confirmed !== true) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision: compactWhitespace(update?.decision),
            code: 'confirmation_missing',
            message: '검증된 판정에도 명시적 confirmed=true가 필요합니다.'
          });
          continue;
        }

        const decision = compactWhitespace(update?.decision);
        if (!ALLOWED_DECISIONS.has(decision)) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision,
            code: 'unsupported_decision',
            message: '지원하지 않는 Web Case HITL ledger decision입니다.'
          });
          continue;
        }

        const reviewedAt = compactWhitespace(
          update?.decidedAt || update?.reviewedAt || options.importedAt || now().toISOString()
        );
        if (!Number.isFinite(Date.parse(reviewedAt))) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision,
            code: 'invalid_decided_at',
            message: '검증된 판정 시각이 유효하지 않습니다.'
          });
          continue;
        }

        const record = normalizeRecord({
          ...update,
          caseId,
          sourceContentSha256: expectedHash,
          reviewedAt
        });
        if (!record) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision,
            code: 'invalid_ledger_record',
            message: '검증된 판정을 로컬 HITL ledger record로 정규화할 수 없습니다.'
          });
          continue;
        }

        const approvedError = decision === 'approved' ? validateApprovedRecord(record) : null;
        if (approvedError) {
          invalidTargets.push({
            caseId,
            sourceContentSha256: suppliedHash,
            decision,
            code: approvedError,
            message: '승인 판정에 필요한 검토 필드가 부족합니다.'
          });
          continue;
        }

        plannedRecords.push(record);
      }

      if (invalidTargets.length > 0) {
        return {
          applyRequested: apply,
          writesPerformed: false,
          plannedUpdates: [],
          appliedUpdates: 0,
          invalidTargets
        };
      }

      if (apply) {
        for (const record of plannedRecords) {
          recordsByCaseId.set(record.caseId, record);
        }
        if (plannedRecords.length > 0) persist();
      }

      return {
        applyRequested: apply,
        writesPerformed: apply && plannedRecords.length > 0,
        plannedUpdates: plannedRecords.map(record => ({ ...record })),
        appliedUpdates: apply ? plannedRecords.length : 0,
        invalidTargets: []
      };
    },

    clear(cardOrCaseId) {
      const caseId = typeof cardOrCaseId === 'string'
        ? compactWhitespace(cardOrCaseId)
        : compactWhitespace(cardOrCaseId?.caseId);
      const removed = recordsByCaseId.delete(caseId);
      if (removed) persist();
      return removed;
    },

    buildApprovedTemplates(cards, options = {}) {
      const generatedAt = options.generatedAt || now().toISOString();
      return (cards || []).flatMap(card => {
        const record = get(card);
        if (!record?.isCurrent || record.decision !== 'approved') return [];
        const reviewedCard = {
          ...card,
          defectName: record.defectName,
          problem: record.problem || card.problem,
          phenomenon: record.phenomenon || card.phenomenon,
          causes: record.causeCandidates.length > 0
            ? record.causeCandidates.map(text => ({ text, actions: [] }))
            : card.causes,
          causeLabels: record.causeLabels,
          checkItems: record.checkItems,
          actions: record.actions,
          review: {
            ...card.review,
            localHitlStatus: 'approved',
            reviewer: record.reviewer,
            reviewerComment: record.reviewerComment,
            reviewedAt: record.reviewedAt,
            sourceContentSha256: record.sourceContentSha256
          },
          metadata: {
            ...card.metadata,
            localHitlApproved: true,
            localHitlReviewedAt: record.reviewedAt,
            sourceContentSha256: record.sourceContentSha256
          }
        };
        const template = toTacitKnowledgeTemplate([reviewedCard], {
          generatedAt,
          documentId: `doc-web-hitl-${card.caseId}-${record.sourceContentSha256.slice(0, 12)}`,
          fileName: `${card.caseId}.json`
        });
        template.metadata = {
          ...template.metadata,
          local_hitl_approved: true,
          local_hitl_reviewer: record.reviewer,
          local_hitl_reviewed_at: record.reviewedAt,
          source_content_sha256: record.sourceContentSha256,
          review_status: 'candidate',
          graph_promotion_allowed_before_review: false
        };
        return [template];
      });
    }
  };
};

module.exports = {
  ALLOWED_DECISIONS,
  cardContentSha256,
  createWebKnowledgeCardReviewLedger,
  suggestCauseLabels,
  suggestCheckItems
};
