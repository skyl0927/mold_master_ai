const {
  canonicalDefectClass,
  isClassifiableDefectLabel
} = require('../../shared/defect-taxonomy');

const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

const extractOriginalVisionDefectType = item => {
  const rawOutput = item?.observation?.raw_output;
  if (!rawOutput) return '';

  try {
    const parsed = typeof rawOutput === 'string' ? JSON.parse(rawOutput) : rawOutput;
    return compact(parsed?.defect_type);
  } catch {
    return '';
  }
};

const hasExplicitLabelReconciliation = item =>
  item?.metadata?.label_reconciliation_required === true
  && item?.metadata?.label_reconciled === true
  && item?.metadata?.human_label_confirmed === true;

const findObservationLabelConflict = item => {
  if (hasExplicitLabelReconciliation(item)) return null;

  const approvedLabel = compact(item?.defect_type);
  const observationLabel = extractOriginalVisionDefectType(item);
  if (
    !isClassifiableDefectLabel(approvedLabel)
    || !isClassifiableDefectLabel(observationLabel)
  ) {
    return null;
  }

  const approvedClass = canonicalDefectClass(approvedLabel);
  const observationClass = canonicalDefectClass(observationLabel);
  if (approvedClass === observationClass) return null;

  return {
    type: 'approved_label_observation_conflict',
    caseId: `approved-${item.image_id}`,
    approvedLabel,
    observationLabel,
    approvedClass,
    observationClass
  };
};

module.exports = {
  extractOriginalVisionDefectType,
  findObservationLabelConflict,
  hasExplicitLabelReconciliation
};
