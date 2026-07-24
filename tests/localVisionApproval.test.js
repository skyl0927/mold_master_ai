const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildLocalCandidateReviewRequest,
    resolveLocalCandidateApproval
} = require('../localVisionApproval');

const candidate = {
    candidateId: 'local-abc',
    contentSha256: 'ABC123',
    fileName: 'rib-whitening.png',
    sourceLineage: {
        sourceDocumentId: 'doc-1',
        sourceDocumentTitle: 'Mold defect standard'
    },
    labelEvidence: {
        sourceLabel: '백화',
        visionSuggestedLabel: '백화',
        visionConfidence: 0.91,
        nonPersisting: true
    }
};

test('new local candidate is registered before review', () => {
    const result = resolveLocalCandidateApproval({
        candidate,
        datasetItems: [],
        defectType: '백화'
    });

    assert.equal(result.mode, 'register_then_review');
    assert.equal(result.imageId, undefined);
});

test('existing candidate with the same hash is reviewed without duplicate registration', () => {
    const result = resolveLocalCandidateApproval({
        candidate,
        datasetItems: [{
            image_id: 'image-candidate',
            defect_type: '백화',
            review_status: 'candidate',
            metadata: { content_sha256: 'abc123' }
        }],
        defectType: '백화'
    });

    assert.equal(result.mode, 'review_existing');
    assert.equal(result.imageId, 'image-candidate');
});

test('already approved candidate with the same class is treated as complete', () => {
    const result = resolveLocalCandidateApproval({
        candidate,
        datasetItems: [{
            image_id: 'image-approved',
            defect_type: 'Whitening',
            review_status: 'approved',
            metadata: { content_sha256: 'abc123' }
        }],
        defectType: '백화'
    });

    assert.equal(result.mode, 'already_approved');
    assert.equal(result.imageId, 'image-approved');
});

test('conflicting approved label for the same bytes blocks Graph promotion', () => {
    assert.throws(
        () => resolveLocalCandidateApproval({
            candidate,
            datasetItems: [{
                image_id: 'image-conflict',
                defect_type: '플래시',
                review_status: 'approved',
                metadata: { content_sha256: 'abc123' }
            }],
            defectType: '백화'
        }),
        /conflicting approved label/i
    );
});

test('review request promotes only the human-confirmed label and preserves provenance', () => {
    const request = buildLocalCandidateReviewRequest({
        candidate,
        datasetItem: {
            image_id: 'image-candidate',
            question: '리브 주변에서 백화가 관찰됨',
            observation: {
                summary: '리브 주변 응력 백화',
                visible_features: ['리브 주변 흰색 변색'],
                possible_causes: ['취출 저항'],
                recommended_checks: ['구배 확인']
            },
            labels: ['기존 후보'],
            process_area: 'injection-molding',
            metadata: { content_sha256: 'abc123' }
        },
        defectType: '백화',
        fieldContext: '취출 시 딱 소리와 함께 제품이 튕김'
    });

    assert.equal(request.decision, 'approve');
    assert.equal(request.defectType, '백화');
    assert.equal(request.observationSummary, '리브 주변 응력 백화');
    assert.deepEqual(request.visibleFeatures, ['리브 주변 흰색 변색']);
    assert.deepEqual(request.possibleCauses, ['취출 저항']);
    assert.deepEqual(request.recommendedChecks, ['구배 확인']);
    assert.equal(request.promoteToGraph, true);
    assert.equal(request.metadata.content_sha256, 'abc123');
    assert.equal(request.metadata.reviewed_from, 'mold-master-ai-local-hitl');
    assert.equal(request.metadata.human_label_confirmed, true);
    assert.equal(request.metadata.source_document_id, 'doc-1');
    assert.equal(request.metadata.vision_suggested_defect_type, '백화');
});
