const isCaptureWorkspaceHydrated = (restoredImageIds, currentImages) => {
  const requiredIds = new Set(
    (Array.isArray(restoredImageIds) ? restoredImageIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)
  );
  const currentIds = new Set(
    (Array.isArray(currentImages) ? currentImages : [])
      .map(image => String(image?.id || '').trim())
      .filter(Boolean)
  );
  return [...requiredIds].every(id => currentIds.has(id));
};

module.exports = {
  isCaptureWorkspaceHydrated
};
