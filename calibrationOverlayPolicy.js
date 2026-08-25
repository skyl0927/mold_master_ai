const shouldRenderCalibrationGuide = ({
  phase,
  showStoredGuides = false
} = {}) => {
  if (phase === 'export') return false;
  if (phase === 'draft') return true;
  return phase === 'editing' && showStoredGuides === true;
};

module.exports = { shouldRenderCalibrationGuide };
