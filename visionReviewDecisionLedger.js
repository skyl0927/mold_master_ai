const fs = require('fs');
const path = require('path');

const ALLOWED_DECISIONS = new Set(['deferred', 'excluded']);
const normalizeHash = value => String(value || '').trim().toLowerCase();
const isSha256 = value => /^[a-f0-9]{64}$/.test(value);

const normalizeRecord = value => {
    const contentSha256 = normalizeHash(value?.contentSha256);
    const decision = String(value?.decision || '').trim();
    const reason = String(value?.reason || '').trim().slice(0, 500);
    if (!isSha256(contentSha256) || !ALLOWED_DECISIONS.has(decision) || !reason) {
        return null;
    }
    return {
        contentSha256,
        candidateId: String(value?.candidateId || '').trim().slice(0, 200),
        fileName: String(value?.fileName || '').trim().slice(0, 500),
        decision,
        reason,
        decidedAt: String(value?.decidedAt || '').trim()
    };
};

const readRecords = filePath => {
    if (!fs.existsSync(filePath)) return [];
    try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const values = Array.isArray(payload) ? payload : payload?.decisions;
        return (Array.isArray(values) ? values : [])
            .map(normalizeRecord)
            .filter(Boolean);
    } catch {
        return [];
    }
};

const writeRecords = (filePath, records) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        decisions: records
    }, null, 2), 'utf8');
    fs.renameSync(tempPath, filePath);
};

const createVisionReviewDecisionLedger = ({
    filePath,
    now = () => new Date()
}) => {
    if (!filePath) throw new TypeError('filePath is required');
    const recordsByHash = new Map(
        readRecords(filePath).map(record => [record.contentSha256, record])
    );

    const persist = () => writeRecords(
        filePath,
        Array.from(recordsByHash.values())
            .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt))
    );

    return {
        get(contentSha256) {
            return recordsByHash.get(normalizeHash(contentSha256)) || null;
        },

        all() {
            return Array.from(recordsByHash.values())
                .sort((left, right) => right.decidedAt.localeCompare(left.decidedAt));
        },

        set(input) {
            const contentSha256 = normalizeHash(input?.contentSha256);
            if (!isSha256(contentSha256)) {
                throw new Error('A valid SHA-256 content hash is required.');
            }
            const decision = String(input?.decision || '').trim();
            if (!ALLOWED_DECISIONS.has(decision)) {
                throw new Error('Decision must be deferred or excluded.');
            }
            const reason = String(input?.reason || '').trim().slice(0, 500);
            if (!reason) {
                throw new Error('A human review reason is required.');
            }
            const record = {
                contentSha256,
                candidateId: String(input?.candidateId || '').trim().slice(0, 200),
                fileName: String(input?.fileName || '').trim().slice(0, 500),
                decision,
                reason,
                decidedAt: now().toISOString()
            };
            recordsByHash.set(contentSha256, record);
            persist();
            return record;
        },

        clear(contentSha256) {
            const removed = recordsByHash.delete(normalizeHash(contentSha256));
            if (removed) persist();
            return removed;
        }
    };
};

module.exports = {
    ALLOWED_DECISIONS,
    createVisionReviewDecisionLedger
};
