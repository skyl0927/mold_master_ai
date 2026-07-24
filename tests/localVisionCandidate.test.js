const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    isLikelyNonManufacturingImage,
    scanLocalVisionCandidates
} = require('../localVisionCandidate');
const { canonicalDefectClass } = require('../shared/defect-taxonomy');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('local candidate scan deduplicates files and marks existing or suspicious images', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-local-candidates-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'nested'));
    fs.mkdirSync(path.join(root, 'node_modules'));

    const productBytes = Buffer.from('part');
    const existingBytes = Buffer.from('ok');
    fs.writeFileSync(path.join(root, 'product.png'), productBytes);
    fs.writeFileSync(path.join(root, 'nested', 'product-copy.jpg'), productBytes);
    fs.writeFileSync(path.join(root, 'error-screenshot.png'), Buffer.from('bad'));
    fs.writeFileSync(path.join(root, 'existing.jpeg'), existingBytes);
    fs.writeFileSync(path.join(root, 'oversize.bmp'), Buffer.from('0123456789'));
    fs.writeFileSync(path.join(root, 'node_modules', 'ignored.png'), Buffer.from('ignored'));

    const result = scanLocalVisionCandidates({
        rootPath: root,
        existingHashes: [sha256(existingBytes)],
        maxBytes: 5,
        inspectImage: () => ({
            width: 640,
            height: 480,
            previewDataUrl: 'data:image/png;base64,preview'
        })
    });

    assert.equal(result.summary.discoveredImageFiles, 5);
    assert.equal(result.summary.uniqueCandidates, 3);
    assert.equal(result.summary.duplicatesSkipped, 1);
    assert.equal(result.summary.oversizeSkipped, 1);
    assert.equal(result.summary.existingMatches, 1);
    assert.equal(result.summary.likelyNonManufacturing, 1);
    assert.equal(result.candidates.filter(item => item.alreadyRegistered).length, 1);
    assert.equal(result.candidates.filter(item => item.likelyNonManufacturing).length, 1);
});

test('non-manufacturing filename hints are conservative and path based', () => {
    assert.equal(isLikelyNonManufacturingImage('D:\\quality\\화면 캡처 2026.png'), true);
    assert.equal(isLikelyNonManufacturingImage('D:\\quality\\burn-mark-product.jpg'), false);
});

test('missing scan roots return an operator-facing validation error', () => {
    assert.throws(
        () => scanLocalVisionCandidates({
            rootPath: path.join(os.tmpdir(), 'mold-master-missing-candidate-root'),
            inspectImage: () => null
        }),
        /유효한 이미지 후보 폴더/
    );
});

test('sidecar labels are trusted only when the source image hash still matches', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-candidate-manifest-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const imageBytes = Buffer.from('manifest-image');
    const imagePath = path.join(root, 'short-shot.png');
    fs.writeFileSync(imagePath, imageBytes);
    const manifestPath = path.join(root, 'vision-candidates.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
        candidates: [{
            relativePath: 'short-shot.png',
            defectType: '미성형',
            fieldContext: '원문 카드: 미성형',
            contentSha256: sha256(imageBytes),
            requiresLabelReconciliation: true,
            labelEvidence: {
                sourceLabel: '웰드 라인',
                visionSuggestedLabel: '취출/이형',
                visionConfidence: 0.88,
                conflict: true,
                nonPersisting: true
            },
            sourceLineage: { knowledgeId: 'STD-SHORT-SHOT' }
        }]
    }));

    const scan = () => scanLocalVisionCandidates({
        rootPath: root,
        inspectImage: () => ({
            width: 800,
            height: 600,
            previewDataUrl: 'data:image/png;base64,preview'
        })
    });
    const matched = scan();
    assert.equal(matched.summary.manifestMatched, 1);
    assert.equal(matched.summary.manifestHashMismatches, 0);
    assert.equal(matched.candidates[0].proposedDefectType, '미성형');
    assert.equal(matched.candidates[0].sourceLineage.knowledgeId, 'STD-SHORT-SHOT');
    assert.equal(matched.candidates[0].requiresLabelReconciliation, true);
    assert.equal(matched.candidates[0].labelEvidence.sourceLabel, '웰드 라인');
    assert.equal(matched.candidates[0].labelEvidence.visionSuggestedLabel, '취출/이형');

    const tamperedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    tamperedManifest.candidates[0].contentSha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(tamperedManifest));
    const rejected = scan();
    assert.equal(rejected.summary.manifestMatched, 0);
    assert.equal(rejected.summary.manifestHashMismatches, 1);
    assert.equal(rejected.candidates[0].proposedDefectType, '');
    assert.equal(rejected.candidates[0].sourceLineage, null);
    assert.equal(rejected.candidates[0].requiresLabelReconciliation, false);
    assert.equal(rejected.candidates[0].labelEvidence, null);
});

test('domain ejection wording maps to the shared benchmark class', () => {
    assert.equal(canonicalDefectClass('제품 캐비티측으로 딸려감'), 'ejection');
    assert.equal(canonicalDefectClass('제품 금형 이탈 안됌'), 'ejection');
});
