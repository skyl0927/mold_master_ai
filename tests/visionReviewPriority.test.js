const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { scanLocalVisionCandidates } = require('../localVisionCandidate');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('review packet priority is preserved and high-confidence agreements sort first', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-priority-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const conflictBytes = Buffer.from('conflict-image');
    const agreementBytes = Buffer.from('agreement-image');
    fs.writeFileSync(path.join(root, 'conflict.png'), conflictBytes);
    fs.writeFileSync(path.join(root, 'agreement.png'), agreementBytes);
    fs.writeFileSync(path.join(root, 'vision-candidates.json'), JSON.stringify({
        candidates: [
            {
                relativePath: 'conflict.png',
                defectType: '웰드라인',
                contentSha256: sha256(conflictBytes),
                reviewPriority: 3,
                reviewBucket: 'class_conflict',
                reviewReasons: ['Source and Vision disagree.']
            },
            {
                relativePath: 'agreement.png',
                defectType: '백화',
                contentSha256: sha256(agreementBytes),
                reviewPriority: 1,
                reviewBucket: 'agreement_high_confidence',
                reviewReasons: ['Source and Vision agree.']
            }
        ]
    }));

    const result = scanLocalVisionCandidates({
        rootPath: root,
        inspectImage: () => ({
            width: 800,
            height: 600,
            previewDataUrl: 'data:image/png;base64,preview'
        })
    });

    assert.equal(result.candidates[0].fileName, 'agreement.png');
    assert.equal(result.candidates[0].reviewPriority, 1);
    assert.equal(result.candidates[0].reviewBucket, 'agreement_high_confidence');
    assert.deepEqual(result.candidates[0].reviewReasons, ['Source and Vision agree.']);
});
