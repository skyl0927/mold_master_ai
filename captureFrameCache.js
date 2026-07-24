const normalizeDisplayId = value => String(value ?? '');

function createCaptureFrameCache() {
    let generation = 0;
    let sources = [];

    return {
        async refresh(captureFreshSources) {
            if (typeof captureFreshSources !== 'function') {
                throw new TypeError('captureFreshSources must be a function');
            }
            const refreshGeneration = ++generation;
            // Invalidate immediately so no caller can consume the previous desktop frame.
            sources = [];
            const captured = await captureFreshSources();
            if (refreshGeneration !== generation) {
                return sources.slice();
            }
            sources = (Array.isArray(captured) ? captured : []).filter(Boolean);
            return sources.slice();
        },

        getForDisplay(displayId) {
            const normalizedId = normalizeDisplayId(displayId);
            return sources.find(source =>
                normalizeDisplayId(source?.display?.id) === normalizedId
            );
        },

        all() {
            return sources.slice();
        },

        clear() {
            generation += 1;
            sources = [];
        }
    };
}

module.exports = { createCaptureFrameCache };
