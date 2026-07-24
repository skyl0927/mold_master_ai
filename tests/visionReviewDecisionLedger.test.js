const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    createVisionReviewDecisionLedger
} = require('../visionReviewDecisionLedger');

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

test('deferred and excluded decisions persist by immutable content hash', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-ledger-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const filePath = path.join(root, 'decisions.json');
    const ledger = createVisionReviewDecisionLedger({
        filePath,
        now: () => new Date('2026-07-24T01:02:03.000Z')
    });

    ledger.set({
        contentSha256: hashA,
        candidateId: 'local-a',
        fileName: 'normal-shape.png',
        decision: 'excluded',
        reason: '정상 형상/결함 미확인'
    });
    ledger.set({
        contentSha256: hashB,
        candidateId: 'local-b',
        fileName: 'needs-expert.png',
        decision: 'deferred',
        reason: '전문가 검토 필요'
    });

    const reloaded = createVisionReviewDecisionLedger({ filePath });
    assert.equal(reloaded.get(hashA).decision, 'excluded');
    assert.equal(reloaded.get(hashA).decidedAt, '2026-07-24T01:02:03.000Z');
    assert.equal(reloaded.get(hashB).decision, 'deferred');
    assert.equal(reloaded.all().length, 2);
});

test('clearing a decision makes the candidate active again', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-ledger-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const ledger = createVisionReviewDecisionLedger({
        filePath: path.join(root, 'decisions.json')
    });
    ledger.set({
        contentSha256: hashA,
        candidateId: 'local-a',
        fileName: 'candidate.png',
        decision: 'deferred',
        reason: '현장 정보 필요'
    });

    assert.equal(ledger.clear(hashA), true);
    assert.equal(ledger.get(hashA), null);
    assert.equal(ledger.all().length, 0);
});

test('invalid hashes, decisions, and empty reasons are rejected', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-ledger-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const ledger = createVisionReviewDecisionLedger({
        filePath: path.join(root, 'decisions.json')
    });

    assert.throws(() => ledger.set({
        contentSha256: 'bad',
        decision: 'excluded',
        reason: '정상'
    }), /sha-256/i);
    assert.throws(() => ledger.set({
        contentSha256: hashA,
        decision: 'approved',
        reason: '자동 승인'
    }), /decision/i);
    assert.throws(() => ledger.set({
        contentSha256: hashA,
        decision: 'excluded',
        reason: ''
    }), /reason/i);
});

test('corrupt ledger data is quarantined as an empty review state', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-ledger-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const filePath = path.join(root, 'decisions.json');
    fs.writeFileSync(filePath, '{not-json', 'utf8');

    const ledger = createVisionReviewDecisionLedger({ filePath });

    assert.deepEqual(ledger.all(), []);
    assert.equal(ledger.get(hashA), null);
});
