const nextPendingReviewCaseId = (queue, currentCaseId) => {
  const items = Array.isArray(queue) ? queue : [];
  if (items.length === 0) return '';
  const currentIndex = Math.max(
    0,
    items.findIndex(item => item?.card?.caseId === currentCaseId)
  );
  const ordered = [
    ...items.slice(currentIndex + 1),
    ...items.slice(0, currentIndex + 1)
  ];
  const next = ordered.find(item =>
    item?.isCurrent === false || item?.decision === 'pending'
  );
  return next?.card?.caseId || '';
};

module.exports = {
  nextPendingReviewCaseId
};
