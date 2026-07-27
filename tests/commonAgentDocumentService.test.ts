import assert from 'node:assert/strict';
import test from 'node:test';

import './visionOperationalReleaseGate.test';
import {
    CommonAgentDocumentService,
    buildDocumentDraftSyncPayload
} from '../services/commonAgentDocumentService';
import { buildReportPreviewPages } from '../services/reportPreviewModel';
import { compactSpecificationAnalysis } from '../services/reportContentFormatter';
import {
    calculateDiagnosisObservability,
    calculateTransitionReadiness,
    buildDiagnosisVisionReviewPacket,
    CommonAgentGateway,
    assertVisionReferenceBenchmarkReady,
    defectTypesAgree,
    executeDiagnosisStrategy,
    isUsableDefectType,
    selectValidatedDiagnosis
} from '../services/commonAgentGateway';
import { CommonAgentApiService } from '../services/commonAgentApiService';
import { buildMultimodalDiagnosisContext } from '../services/diagnosisContextService';
import { buildProcessKnowledgeMigrationMarkdown } from '../services/processKnowledgeMigrationService';
import { checkServerHealth } from '../services/serverHealthService';
import { calculateVisionDatasetReadiness } from '../services/visionDatasetReadinessService';
import {
    canPromoteVisionAnalysisToGraph,
    resolveVisionHitlDecision
} from '../services/visionHitlDecisionProtocol';
import {
    deleteManualDocument,
    listManualDocuments,
    syncManualDocument
} from '../services/manualKnowledgeSyncService';

test('Vision HITL decisions keep Graph promotion and local learning fail-closed', () => {
    const approved = resolveVisionHitlDecision('approved');
    const corrected = resolveVisionHitlDecision('corrected');
    const rejected = resolveVisionHitlDecision('rejected');
    const recapture = resolveVisionHitlDecision('recapture');
    const pending = resolveVisionHitlDecision('pending');

    assert.deepEqual(approved, {
        apiDecision: 'approve',
        localStatus: 'approved',
        promoteToGraph: true,
        localLearningVerified: true,
        knowledgeScope: 'diagnostic',
        successMessage: 'Common Agent 검토 승인 및 Graph 등록 완료!'
    });
    assert.equal(corrected.apiDecision, 'edit');
    assert.equal(corrected.localStatus, 'pending');
    assert.equal(corrected.promoteToGraph, false);
    assert.equal(corrected.localLearningVerified, false);
    assert.equal(corrected.knowledgeScope, 'review_event');
    assert.equal(rejected.apiDecision, 'reject');
    assert.equal(rejected.localStatus, 'rejected');
    assert.equal(rejected.promoteToGraph, false);
    assert.equal(recapture.apiDecision, 'recapture');
    assert.equal(recapture.localStatus, 'pending');
    assert.equal(recapture.promoteToGraph, false);
    assert.equal(recapture.knowledgeScope, 'review_event');
    assert.equal(pending.apiDecision, 'needs_review');
    assert.equal(pending.localStatus, 'pending');
});

test('blocked Vision analysis cannot be promoted to Graph even with approved HITL decision', () => {
    const approved = resolveVisionHitlDecision('approved');
    assert.equal(approved.promoteToGraph, true);

    const guard = canPromoteVisionAnalysisToGraph({
        defectType: '판정 보류 (사람 검토 필요)',
        severity: '-',
        description: '리브 주변에 유백색으로 보이는 흐린 영역',
        possibleCauses: '',
        countermeasures: '',
        rawOutput: '',
        visionSummary: {
            contractVersion: 'vision-observation/v2',
            imageKind: 'physical_product',
            normalityStatus: 'defect_visible',
            qualityStatus: 'reject',
            visualObservations: [],
            visibleFeatures: [],
            candidates: [],
            primaryCandidate: null,
            requiredAdditionalViews: ['초점 보정 후 리브 기부 근접 촬영'],
            qualityConcerns: ['motion blur hides the defect edge'],
            abstentionReason: 'image_quality_rejected',
            validationIssues: ['image_quality_rejected'],
            groundingStatus: 'invalid',
            decisionStatus: 'unclassifiable',
            decisionReason: 'image_quality_rejected',
            safetyGate: {
                status: 'blocked',
                score: 0,
                reasons: ['image_quality_rejected'],
                candidateUsePolicy: 'do_not_use_vision_candidate',
                autoGraphCandidateUseAllowed: false,
                humanReviewRequired: true,
                supportObservationCount: 0,
                supportCategoryCount: 0,
                topCandidateMargin: null
            }
        }
    });

    assert.equal(guard.allowed, false);
    assert.match(guard.message, /재촬영|HITL/);
});

test('specification analysis removes reasoning text and keeps only concise engineering statements', () => {
    const compact = compactSpecificationAnalysis({
        problem: [
            '문제점: 그릴 리브 주변에 백화가 발생함.',
            'Graph Matched Issue: Rib whitening',
            '분석 과정: 취출 소리와 제품 튕김을 근거로 판단함.'
        ].join('\n'),
        cause: [
            '1. 리브부 구배 부족으로 이형 저항 증가',
            '**Graph Trace**',
            '백화 -> 이형 저항 -> 구배 개선',
            '2. 리브 표면 조도 불량',
            '3. 취출 밸런스 불균일',
            '4. 보압 조건 영향',
        ].join('\n'),
        countermeasures: [
            '대책:',
            '1. 리브 구배를 확대한다.',
            '2. 리브 주변 금형면을 연마한다.',
            '3. 이젝터 작동 밸런스를 점검한다.',
            '4. 사출 조건을 전면 재설정한다.',
            '근거: 승인된 Graph DB 경로'
        ].join('\n')
    });

    assert.equal(compact.problem, '그릴 리브 주변에 백화가 발생함.');
    assert.equal(compact.cause, [
        '1. 리브부 구배 부족으로 이형 저항 증가',
        '2. 리브 표면 조도 불량',
        '3. 취출 밸런스 불균일'
    ].join('\n'));
    assert.equal(compact.countermeasures, [
        '1. 리브 구배를 확대한다.',
        '2. 리브 주변 금형면을 연마한다.',
        '3. 이젝터 작동 밸런스를 점검한다.'
    ].join('\n'));
    assert.doesNotMatch(Object.values(compact).join('\n'), /Graph|->|분석 과정|근거:/);
});

test('Common Agent diagnosis keeps verbose answer as raw evidence but not as a countermeasure', () => {
    const response = {
        image_id: 'image-1',
        file_name: 'rib.png',
        mime_type: 'image/png',
        source_system: 'test',
        observation: {
            defect_type: '백화',
            severity: 'Medium',
            summary: '리브 주변 백화가 관찰됨.',
            possible_causes: [
                '리브 구배 부족',
                '금형면 조도 불량',
                '취출 밸런스 불균일',
                '추가 일반 원인'
            ],
            recommended_checks: [
                '리브 구배 확대',
                '금형면 연마',
                '이젝터 밸런스 점검',
                '전체 조건 재검토'
            ]
        },
        answer: '긴 추론 과정과 검색 경로를 포함한 Common Agent 전체 답변'
    };

    const analysis = CommonAgentApiService.toDefectAnalysis(response);

    assert.equal(analysis.possibleCauses.split('\n').length, 3);
    assert.equal(analysis.countermeasures.split('\n').length, 3);
    assert.doesNotMatch(analysis.countermeasures, /긴 추론 과정|Common Agent 전체 답변/);
    assert.match(analysis.rawOutput, /긴 추론 과정/);
});

test('grounded Vision v2 rejects unlinked candidates and does not inject causes or actions', () => {
    const response = {
        image_id: 'image-v2',
        file_name: 'normal-rib.png',
        mime_type: 'image/png',
        source_system: 'test',
        observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product' as const,
            normality_status: 'uncertain' as const,
            observations: [{
                observation_id: 'obs-1',
                category: 'geometry' as const,
                description: '동일 간격으로 반복되는 리브가 보임',
                region: '제품 중앙',
                confidence: 0.91
            }],
            defect_type: '백화',
            candidates: [{
                defect_type: '백화',
                confidence: 0.94,
                supporting_observation_ids: ['missing-observation'],
                contradicting_observation_ids: []
            }],
            possible_causes: ['이형 저항 증가'],
            recommended_checks: ['구배를 수정한다']
        },
        answer: '원인과 대책을 생성한 잘못된 Vision 응답'
    };

    const analysis = CommonAgentApiService.toDefectAnalysis(response);

    assert.equal(analysis.defectType, '판정 보류 (사람 검토 필요)');
    assert.equal(analysis.description, '동일 간격으로 반복되는 리브가 보임');
    assert.equal(analysis.severity, '-');
    assert.equal(analysis.possibleCauses, '');
    assert.equal(analysis.countermeasures, '');
    assert.deepEqual(
        analysis.visionSummary?.validationIssues,
        ['candidate_without_observation_evidence']
    );
});

test('Vision Graph grounding maps only approved causes actions and path citations', () => {
    const response = {
        image_id: 'image-grounded',
        file_name: 'whitening.png',
        mime_type: 'image/png',
        source_system: 'test',
        observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product' as const,
            normality_status: 'defect_visible' as const,
            observations: [{
                observation_id: 'obs-1',
                category: 'color' as const,
                description: '리브 주변 유백색 변색',
                region: '리브 기부',
                confidence: 0.91
            }],
            candidates: [{
                defect_type: '백화',
                confidence: 0.82,
                supporting_observation_ids: ['obs-1']
            }],
            decision_status: 'probable' as const,
            decision_reason: 'probable_multiview_consensus'
        },
        answer: '[Graph 검증 결과]\nGraph 검증 원인: 과도한 이형 저항',
        evidence: [],
        graph_grounding: {
            contract_version: 'vision-graph-grounding/v1' as const,
            candidate_grounding: [{
                defect_type: '백화',
                vision_rank: 1,
                vision_confidence: 0.82,
                status: 'supported' as const,
                direct_match_score: 1,
                multihop_score: 0.85,
                context_match_score: 0.75,
                graph_support_score: 0.91,
                approved_path_count: 1,
                causes: ['과도한 이형 저항'],
                countermeasures: ['리브 구배 및 표면 거칠기 점검'],
                citations: [{
                    path_id: 'path-whitening-release',
                    document_id: 'doc-approved-1',
                    path_text: '백화 -> 과도한 이형 저항 -> 리브 구배 점검',
                    hop_count: 2,
                    score: 0.93,
                    review_status: 'approved',
                    evidence_ids: ['ev-defect', 'ev-cause', 'ev-action']
                }],
                rejected_path_reasons: []
            }],
            graph_grounded: true,
            top_candidate_supported: true,
            vision_graph_conflict: false,
            approved_path_count: 1,
            citation_count: 1,
            grounded_causes: ['과도한 이형 저항'],
            grounded_countermeasures: ['리브 구배 및 표면 거칠기 점검'],
            requires_human_review: false,
            auto_finalize_allowed: true,
            llm_supplement_allowed: false,
            llm_supplement_training_eligible: false as const,
            decision_status: 'grounded' as const,
            decision_reason: 'vision_top1_approved_graph_path_supported'
        },
        metadata: {
            llm_supplement_used: false
        }
    };

    const analysis = CommonAgentApiService.toDefectAnalysis(response);

    assert.equal(analysis.possibleCauses, '1. 과도한 이형 저항');
    assert.equal(analysis.countermeasures, '1. 리브 구배 및 표면 거칠기 점검');
    assert.equal(analysis.retrievalSummary?.graphGrounded, true);
    assert.equal(analysis.retrievalSummary?.llmSupplemented, false);
    assert.equal(analysis.retrievalSummary?.graphValidation?.decisionStatus, 'grounded');
    assert.equal(analysis.retrievalSummary?.graphValidation?.autoFinalizeAllowed, true);
    assert.equal(analysis.retrievalSummary?.graphValidation?.candidateGrounding[0].supportScore, 0.91);
    assert.deepEqual(
        analysis.retrievalSummary?.citations,
        ['path-whitening-release']
    );
    assert.deepEqual(
        analysis.retrievalSummary?.graphTrace,
        ['백화 -> 과도한 이형 저항 -> 리브 구배 점검']
    );
});

test('Vision classifier disagreement blocks Graph finalization even when Graph grounding exists', () => {
    const response = {
        image_id: 'image-classifier-conflict',
        file_name: 'whitening.png',
        mime_type: 'image/png',
        source_system: 'test',
        observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product' as const,
            normality_status: 'defect_visible' as const,
            observations: [{
                observation_id: 'obs-1',
                category: 'color' as const,
                description: '리브 주변 유백색 변색',
                region: '리브 기부',
                confidence: 0.91
            }, {
                observation_id: 'obs-2',
                category: 'surface' as const,
                description: '표면이 국부적으로 뿌옇게 보임',
                region: '리브 측면',
                confidence: 0.87
            }],
            candidates: [{
                defect_type: '백화',
                confidence: 0.82,
                supporting_observation_ids: ['obs-1', 'obs-2']
            }, {
                defect_type: '웰드라인',
                confidence: 0.64,
                supporting_observation_ids: ['obs-2']
            }],
            decision_status: 'probable' as const,
            decision_reason: 'probable_multiview_consensus'
        },
        classifier_report: {
            contract_version: 'vision-classifier/v1' as const,
            embedding_model_version: 'dinov2:facebook/dinov2-base',
            top_candidates: [{
                defect_type: '웰드라인',
                confidence: 0.88,
                reference_count: 5,
                distance: 0.18,
                support_image_ids: ['ref-weld-1', 'ref-weld-2', 'ref-weld-3']
            }, {
                defect_type: '백화',
                confidence: 0.61,
                reference_count: 4,
                distance: 0.31,
                support_image_ids: ['ref-white-1', 'ref-white-2']
            }],
            minimum_reference_support: 3
        },
        graph_grounding: {
            contract_version: 'vision-graph-grounding/v1' as const,
            candidate_grounding: [{
                defect_type: '백화',
                vision_rank: 1,
                vision_confidence: 0.82,
                status: 'supported' as const,
                direct_match_score: 1,
                multihop_score: 0.85,
                context_match_score: 0.75,
                graph_support_score: 0.91,
                approved_path_count: 1,
                causes: ['과도한 이형 저항'],
                countermeasures: ['리브 구배 및 표면 거칠기 점검'],
                citations: [{
                    path_id: 'path-whitening-release',
                    document_id: 'doc-approved-1',
                    path_text: '백화 -> 과도한 이형 저항 -> 리브 구배 점검',
                    hop_count: 2,
                    score: 0.93,
                    review_status: 'approved',
                    evidence_ids: ['ev-defect', 'ev-cause', 'ev-action']
                }],
                rejected_path_reasons: []
            }],
            graph_grounded: true,
            top_candidate_supported: true,
            vision_graph_conflict: false,
            approved_path_count: 1,
            citation_count: 1,
            grounded_causes: ['과도한 이형 저항'],
            grounded_countermeasures: ['리브 구배 및 표면 거칠기 점검'],
            requires_human_review: false,
            auto_finalize_allowed: true,
            llm_supplement_allowed: false,
            llm_supplement_training_eligible: false as const,
            decision_status: 'grounded' as const,
            decision_reason: 'vision_top1_approved_graph_path_supported'
        },
        metadata: {
            llm_supplement_used: false
        }
    } as any;

    const analysis = CommonAgentApiService.toDefectAnalysis(response);

    assert.equal(analysis.defectType, '판정 보류 (백화 후보 검토 필요)');
    assert.equal(analysis.possibleCauses, '');
    assert.equal(analysis.countermeasures, '');
    assert.equal(analysis.visionSummary?.decisionStatus, 'needs_review');
    assert.equal(analysis.visionSummary?.decisionReason, 'vision_classifier_disagreement');
    assert.equal(analysis.visionSummary?.classifierSummary?.agreementWithVisionTop1, false);
    assert.equal(analysis.visionSummary?.classifierSummary?.topCandidate?.defectType, '웰드라인');
    assert.equal(analysis.retrievalSummary?.graphValidation?.autoFinalizeAllowed, false);
    assert.equal(analysis.retrievalSummary?.graphValidation?.requiresHumanReview, true);
});

test('Graph-missing LLM supplement never populates specification cause or action fields', () => {
    const response = {
        image_id: 'image-unverified',
        file_name: 'unknown.png',
        mime_type: 'image/png',
        source_system: 'test',
        observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product' as const,
            normality_status: 'defect_visible' as const,
            observations: [{
                observation_id: 'obs-1',
                category: 'surface' as const,
                description: '표면 이상이 관찰됨',
                confidence: 0.75
            }],
            candidates: [{
                defect_type: '미분류 표면 결함',
                confidence: 0.62,
                supporting_observation_ids: ['obs-1']
            }],
            decision_status: 'probable' as const,
            decision_reason: 'vision_candidate'
        },
        answer: [
            '[Graph 검증 결과]',
            '승인된 Graph 경로 없음',
            '[LLM 보조 참고 - Graph 미검증/학습 사용 금지]',
            'LLM 추정 원인과 대책'
        ].join('\n'),
        evidence: [{
            node_id: 'rag-1',
            text: '일반 문서 검색 결과',
            score: 0.7,
            source_type: 'rag',
            source_ref: 'doc-general'
        }],
        graph_grounding: {
            contract_version: 'vision-graph-grounding/v1' as const,
            candidate_grounding: [{
                defect_type: '미분류 표면 결함',
                vision_rank: 1,
                vision_confidence: 0.62,
                status: 'unverified' as const,
                direct_match_score: 0,
                multihop_score: 0,
                context_match_score: 0,
                graph_support_score: 0,
                approved_path_count: 0,
                causes: [],
                countermeasures: [],
                citations: [],
                rejected_path_reasons: []
            }],
            graph_grounded: false,
            top_candidate_supported: false,
            vision_graph_conflict: false,
            approved_path_count: 0,
            citation_count: 0,
            grounded_causes: [],
            grounded_countermeasures: [],
            requires_human_review: true,
            auto_finalize_allowed: false,
            llm_supplement_allowed: true,
            llm_supplement_training_eligible: false as const,
            decision_status: 'unverified' as const,
            decision_reason: 'approved_graph_evidence_missing'
        },
        metadata: {
            llm_supplement_used: true
        }
    };

    const analysis = CommonAgentApiService.toDefectAnalysis(response);

    assert.equal(analysis.defectType, '판정 보류 (미분류 표면 결함 후보 검토 필요)');
    assert.equal(analysis.possibleCauses, '');
    assert.equal(analysis.countermeasures, '');
    assert.equal(analysis.visionSummary?.decisionStatus, 'needs_review');
    assert.equal(analysis.visionSummary?.decisionReason, 'approved_graph_evidence_missing');
    assert.equal(analysis.retrievalSummary?.graphGrounded, false);
    assert.equal(analysis.retrievalSummary?.llmSupplemented, true);
    assert.equal(analysis.retrievalSummary?.graphValidation?.requiresHumanReview, true);
    assert.equal(
        analysis.retrievalSummary?.graphValidation?.llmSupplementTrainingEligible,
        false
    );
    assert.deepEqual(analysis.retrievalSummary?.citations, []);
    assert.match(analysis.rawOutput, /LLM 보조 참고/);
});

const diagnosisCandidate = (source: 'common_agent' | 'legacy', defectType: string) => ({
    source,
    analysis: {
        defectType,
        severity: 'Medium',
        description: 'description',
        possibleCauses: 'cause',
        countermeasures: 'action',
        rawOutput: ''
    }
});

test('dual validation selects Common Agent while retaining the legacy comparison', async () => {
    const execution = await executeDiagnosisStrategy(
        'dual_validation',
        async () => diagnosisCandidate('common_agent', 'Whitening'),
        async () => diagnosisCandidate('legacy', 'Whitening defect')
    );

    assert.equal(execution.selected.source, 'common_agent');
    assert.equal(execution.commonAgent?.analysis.defectType, 'Whitening');
    assert.equal(execution.legacy?.analysis.defectType, 'Whitening defect');
    assert.equal(execution.fallbackUsed, false);
    assert.equal(defectTypesAgree('Whitening', 'Whitening defect'), true);
});

test('dual validation prefers the analysis with a richer structured Vision contract', async () => {
    const execution = await executeDiagnosisStrategy(
        'dual_validation',
        async () => ({
            ...diagnosisCandidate('common_agent', '백화'),
            analysis: {
                ...diagnosisCandidate('common_agent', '백화').analysis,
                visionSummary: {
                    contractVersion: 'vision-observation/v2',
                    imageKind: 'physical_product',
                    normalityStatus: 'defect_visible',
                    visualObservations: [{
                        observationId: 'obs-1',
                        category: 'color',
                        description: '유백색 변색',
                        region: '리브 주변',
                        confidence: 0.7,
                        source: 'image'
                    }],
                    visibleFeatures: ['유백색 변색'],
                    candidates: [{
                        defectType: '백화',
                        confidence: 0.7,
                        supportingFeatures: ['유백색'],
                        contradictingFeatures: [],
                        supportingObservationIds: ['obs-1'],
                        contradictingObservationIds: []
                    }],
                    primaryCandidate: {
                        defectType: '백화',
                        confidence: 0.7,
                        supportingFeatures: ['유백색'],
                        contradictingFeatures: [],
                        supportingObservationIds: ['obs-1'],
                        contradictingObservationIds: []
                    },
                    requiredAdditionalViews: [],
                    qualityStatus: 'pass',
                    qualityConcerns: [],
                    abstentionReason: '',
                    validationIssues: [],
                    groundingStatus: 'grounded',
                    decisionStatus: 'needs_review',
                    decisionReason: 'single_candidate_requires_review'
                }
            }
        }),
        async () => ({
            ...diagnosisCandidate('legacy', '밀핀 자국'),
            analysis: {
                ...diagnosisCandidate('legacy', '밀핀 자국').analysis,
                visionSummary: {
                    contractVersion: 'vision-observation/v2',
                    imageKind: 'physical_product',
                    normalityStatus: 'defect_visible',
                    visualObservations: [
                        {
                            observationId: 'obs-1',
                            category: 'geometry',
                            description: '원형 경계',
                            region: '제품 표면',
                            confidence: 0.52,
                            source: 'image'
                        },
                        {
                            observationId: 'obs-2',
                            category: 'color',
                            description: '유백색 변색',
                            region: '원형 경계 주변',
                            confidence: 0.38,
                            source: 'image'
                        }
                    ],
                    visibleFeatures: ['원형 경계', '유백색 변색'],
                    candidates: [
                        {
                            defectType: '밀핀 자국',
                            confidence: 0.52,
                            supportingFeatures: ['원형 경계'],
                            contradictingFeatures: ['밀핀 위치 미확인'],
                            supportingObservationIds: ['obs-1'],
                            contradictingObservationIds: []
                        },
                        {
                            defectType: '백화',
                            confidence: 0.38,
                            supportingFeatures: ['유백색 변색'],
                            contradictingFeatures: [],
                            supportingObservationIds: ['obs-2'],
                            contradictingObservationIds: []
                        }
                    ],
                    primaryCandidate: {
                        defectType: '밀핀 자국',
                        confidence: 0.52,
                        supportingFeatures: ['원형 경계'],
                        contradictingFeatures: ['밀핀 위치 미확인'],
                        supportingObservationIds: ['obs-1'],
                        contradictingObservationIds: []
                    },
                    requiredAdditionalViews: ['사광 확대 사진'],
                    qualityStatus: 'pass',
                    qualityConcerns: [],
                    abstentionReason: '',
                    validationIssues: [],
                    groundingStatus: 'grounded',
                    decisionStatus: 'needs_review',
                    decisionReason: 'confidence_or_margin_gate'
                }
            }
        })
    );

    const selection = selectValidatedDiagnosis(execution);

    assert.equal(selection.candidate.source, 'legacy');
    assert.equal(selection.reason, 'richer_vision_contract');
    assert.equal(selection.candidate.analysis.visionSummary?.candidates.length, 2);
});

test('diagnosis observability summarizes latency, graph usage, context, sources, and failures', () => {
    const records = [
        {
            id: 'comparison-1',
            imageId: 'image-1',
            createdAt: '2026-07-24T00:00:00.000Z',
            strategy: 'dual_validation' as const,
            selectedSource: 'common_agent' as const,
            fallbackUsed: false,
            commonAgentSuccess: true,
            legacySuccess: true,
            commonAgentDurationMs: 100,
            legacyDurationMs: 300,
            retrievalMode: 'graph_only' as const,
            evidenceCount: 4,
            graphGrounded: true,
            llmSupplemented: false,
            visionGraphConflict: false,
            graphAutoFinalizeAllowed: true,
            graphApprovedPathCount: 2,
            graphCitationCount: 2,
            visionClassifierStatus: 'agreed' as const,
            visionClassifierAgreementWithVisionTop1: true,
            visionClassifierVisionCandidate: '백화',
            visionClassifierTopCandidate: '백화',
            visionClassifierReferenceCount: 5,
            visionClassifierMinimumReferenceSupport: 3,
            llmSupplementTrainingEligible: false,
            contextProvided: true,
            roiCount: 1,
            ocrProvided: false,
            visionDecisionStatus: 'probable' as const,
            visionDecisionReason: 'probable_multiview_consensus'
        },
        {
            id: 'comparison-2',
            imageId: 'image-2',
            createdAt: '2026-07-24T00:01:00.000Z',
            strategy: 'common_agent_primary' as const,
            selectedSource: 'legacy' as const,
            fallbackUsed: true,
            commonAgentSuccess: false,
            legacySuccess: true,
            legacyDurationMs: 500,
            retrievalMode: 'hybrid' as const,
            evidenceCount: 0,
            graphGrounded: false,
            llmSupplemented: true,
            visionGraphConflict: true,
            graphAutoFinalizeAllowed: false,
            graphApprovedPathCount: 1,
            graphCitationCount: 1,
            visionClassifierStatus: 'disagreed' as const,
            visionClassifierAgreementWithVisionTop1: false,
            visionClassifierVisionCandidate: '백화',
            visionClassifierTopCandidate: '웰드라인',
            visionClassifierReferenceCount: 4,
            visionClassifierMinimumReferenceSupport: 3,
            llmSupplementTrainingEligible: false,
            contextProvided: false,
            roiCount: 0,
            ocrProvided: true,
            commonAgentError: 'connect ECONNREFUSED 127.0.0.1:8000',
            visionDecisionStatus: 'needs_review' as const,
            visionDecisionReason: 'dual_model_disagreement'
        },
        {
            id: 'comparison-3',
            imageId: 'image-3',
            createdAt: '2026-07-24T00:02:00.000Z',
            strategy: 'dual_validation' as const,
            selectedSource: 'common_agent' as const,
            fallbackUsed: false,
            commonAgentSuccess: true,
            legacySuccess: false,
            commonAgentDurationMs: 300,
            retrievalMode: 'hybrid' as const,
            evidenceCount: 2,
            graphGrounded: true,
            llmSupplemented: true,
            visionGraphConflict: false,
            graphAutoFinalizeAllowed: true,
            graphApprovedPathCount: 1,
            graphCitationCount: 1,
            visionClassifierStatus: 'insufficient_reference' as const,
            visionClassifierAgreementWithVisionTop1: false,
            visionClassifierVisionCandidate: '싱크',
            visionClassifierTopCandidate: '싱크',
            visionClassifierReferenceCount: 1,
            visionClassifierMinimumReferenceSupport: 3,
            llmSupplementTrainingEligible: false,
            contextProvided: true,
            roiCount: 2,
            ocrProvided: true,
            legacyError: 'legacy provider timeout',
            visionDecisionStatus: 'unclassifiable' as const,
            visionDecisionReason: 'image_quality_rejected'
        }
    ];

    const observability = calculateDiagnosisObservability(records);

    assert.equal(observability.total, 3);
    assert.deepEqual(observability.commonAgentLatencyMs, { sampleCount: 2, p50: 100, p95: 300, average: 200 });
    assert.deepEqual(observability.legacyLatencyMs, { sampleCount: 2, p50: 300, p95: 500, average: 400 });
    assert.equal(observability.graphGroundedRate, 66.7);
    assert.equal(observability.graphCitationCoverageRate, 100);
    assert.equal(observability.visionGraphConflictRate, 33.3);
    assert.equal(observability.graphAutoFinalizeRate, 66.7);
    assert.equal(observability.averageApprovedGraphPaths, 1.3);
    assert.equal(observability.visionClassifierAgreementRate, 33.3);
    assert.equal(observability.visionClassifierDisagreementRate, 33.3);
    assert.equal(observability.visionClassifierInsufficientReferenceRate, 33.3);
    assert.equal(observability.averageClassifierReferenceCount, 3.3);
    assert.equal(observability.visionProbableRate, 33.3);
    assert.equal(observability.visionNeedsReviewRate, 33.3);
    assert.equal(observability.visionUnclassifiableRate, 33.3);
    assert.deepEqual(observability.visionDecisionReasonTargets, [
        {
            status: 'needs_review',
            reason: 'dual_model_disagreement',
            count: 1,
            sampleImageIds: ['image-2']
        },
        {
            status: 'unclassifiable',
            reason: 'image_quality_rejected',
            count: 1,
            sampleImageIds: ['image-3']
        },
        {
            status: 'probable',
            reason: 'probable_multiview_consensus',
            count: 1,
            sampleImageIds: ['image-1']
        }
    ]);
    assert.deepEqual(
        observability.visionDecisionRecommendedActions.map(action => action.code),
        [
            'improve_vision_capture_quality',
            'review_vision_decision_disagreement'
        ]
    );
    assert.match(
        observability.visionDecisionRecommendedActions[0].message,
        /image_quality_rejected.*재촬영.*조명.*초점/
    );
    assert.match(
        observability.visionDecisionRecommendedActions[1].message,
        /dual_model_disagreement.*VLM.*Classifier/
    );
    assert.deepEqual(observability.visionDecisionReviewQueue, [
        {
            priority: 100,
            actionCode: 'improve_vision_capture_quality',
            status: 'unclassifiable',
            reason: 'image_quality_rejected',
            count: 1,
            sampleImageIds: ['image-3']
        },
        {
            priority: 90,
            actionCode: 'review_vision_decision_disagreement',
            status: 'needs_review',
            reason: 'dual_model_disagreement',
            count: 1,
            sampleImageIds: ['image-2']
        }
    ]);
    const reviewPacket = buildDiagnosisVisionReviewPacket(
        records,
        observability,
        '2026-07-24T00:03:00.000Z'
    );
    assert.equal(reviewPacket.schemaVersion, 'diagnosis-vision-review-packet/v1');
    assert.equal(reviewPacket.generatedAt, '2026-07-24T00:03:00.000Z');
    assert.deepEqual(reviewPacket.policy, {
        persistence: 'none',
        graphPromotion: 'disabled_until_hitl_approval',
        commonAgentReviewRequired: true
    });
    assert.deepEqual(
        reviewPacket.items.map(item => ({
            priority: item.priority,
            actionCode: item.actionCode,
            imageId: item.imageId,
            comparisonId: item.comparisonId,
            status: item.status,
            reason: item.reason,
            selectedSource: item.selectedSource,
            defectCandidate: item.defectCandidate,
            classifierCandidate: item.classifierCandidate,
            recommendedHumanAction: item.recommendedHumanAction
        })),
        [
            {
                priority: 100,
                actionCode: 'improve_vision_capture_quality',
                imageId: 'image-3',
                comparisonId: 'comparison-3',
                status: 'unclassifiable',
                reason: 'image_quality_rejected',
                selectedSource: 'common_agent',
                defectCandidate: '싱크',
                classifierCandidate: '싱크',
                recommendedHumanAction: '재촬영 기준을 강화하고 조명, 초점, ROI 해상도를 먼저 보정하세요.'
            },
            {
                priority: 90,
                actionCode: 'review_vision_decision_disagreement',
                imageId: 'image-2',
                comparisonId: 'comparison-2',
                status: 'needs_review',
                reason: 'dual_model_disagreement',
                selectedSource: 'legacy',
                defectCandidate: '백화',
                classifierCandidate: '웰드라인',
                recommendedHumanAction: 'VLM/Classifier 후보, ROI 위치, 라벨 alias를 함께 검토하세요.'
            }
        ]
    );
    assert.deepEqual(observability.visionClassifierDisagreementTargets, [
        {
            visionCandidate: '백화',
            classifierCandidate: '웰드라인',
            count: 1,
            sampleImageIds: ['image-2']
        }
    ]);
    assert.deepEqual(observability.visionClassifierReferenceTargets, [
        {
            defectType: '싱크',
            count: 1,
            averageReferenceCount: 1,
            minimumReferenceSupport: 3,
            sampleImageIds: ['image-3']
        }
    ]);
    assert.deepEqual(
        observability.visionClassifierRecommendedActions.map(action => action.code),
        [
            'review_classifier_disagreement',
            'collect_classifier_references'
        ]
    );
    assert.match(
        observability.visionClassifierRecommendedActions[0].message,
        /백화.*웰드라인.*촬영 프로토콜.*라벨 taxonomy/
    );
    assert.match(
        observability.visionClassifierRecommendedActions[1].message,
        /싱크.*1.*3.*승인 이미지.*추가/
    );
    assert.equal(observability.ungroundedLlmTrainingLeakCount, 0);
    assert.equal(observability.averageEvidenceCount, 2);
    assert.equal(observability.contextProvidedRate, 66.7);
    assert.equal(observability.roiContextRate, 66.7);
    assert.equal(observability.ocrContextRate, 66.7);
    assert.deepEqual(observability.selectedSources, { common_agent: 2, legacy: 1 });
    assert.deepEqual(observability.retrievalModes, { direct: 0, local_rag: 0, remote_rag: 0, hybrid: 2, graph_only: 1 });
    assert.deepEqual(observability.metricSamples, {
        graphGrounded: 3,
        llmSupplemented: 3,
        graphValidation: 3,
        visionClassifier: 3,
        visionDecision: 3,
        evidence: 3,
        contextProvided: 3,
        roiContext: 3,
        ocrContext: 3
    });
    assert.equal(observability.commonAgentFailures, 1);
    assert.equal(observability.legacyFailures, 1);
    assert.equal(
        observability.failureReasons.find(reason => reason.source === 'common_agent')?.message,
        'connect ECONNREFUSED 127.0.0.1:8000'
    );
});

test('Common Agent primary mode falls back to legacy analysis on an agent outage', async () => {
    const execution = await executeDiagnosisStrategy(
        'common_agent_primary',
        async () => {
            throw new Error('agent unavailable');
        },
        async () => diagnosisCandidate('legacy', 'Short shot')
    );

    assert.equal(execution.selected.source, 'legacy');
    assert.equal(execution.fallbackUsed, true);
    assert.match(execution.commonAgentError || '', /agent unavailable/);
});

test('transition readiness requires sufficient successful and comparable dual runs', () => {
    const records = Array.from({ length: 20 }, (_, index) => ({
        id: `comparison-${index}`,
        imageId: `image-${index}`,
        createdAt: new Date(0).toISOString(),
        strategy: 'dual_validation' as const,
        selectedSource: 'common_agent' as const,
        fallbackUsed: false,
        commonAgentSuccess: true,
        legacySuccess: true,
        commonAgentDefectType: 'Whitening',
        legacyDefectType: index < 18 ? 'Whitening' : 'Short shot',
        commonAgentClassifiable: true,
        legacyClassifiable: true,
        defectTypeAgreement: index < 18
    }));

    const readiness = calculateTransitionReadiness(records);

    assert.equal(readiness.commonAgentSuccessRate, 100);
    assert.equal(readiness.classifiableCount, 20);
    assert.equal(readiness.classifiableRate, 100);
    assert.equal(readiness.agreementRate, 90);
    assert.equal(readiness.readyForCommonAgentPrimary, true);
    assert.equal(calculateTransitionReadiness(records.slice(0, 10)).readyForCommonAgentPrimary, false);
});

test('unclassified vision labels are excluded from defect agreement scoring', () => {
    assert.equal(isUsableDefectType('Common Agent Diagnosis'), false);
    assert.equal(isUsableDefectType('판정 불가 (사람 검토 필요)'), false);
    assert.equal(isUsableDefectType('리브 주변 백화'), true);
});

test('multimodal diagnosis context combines field notes, annotations, OCR, and ROI details', () => {
    const context = buildMultimodalDiagnosisContext({
        phenomenonDescription: '리브 주변 백화, 취출 시 딱 소리와 함께 제품이 튕김',
        ocrText: '사출압력 82 MPa / 금형온도 60 C',
        annotations: [{
            id: 'annotation-1',
            text: '백화 집중부',
            textPos: { x: 120, y: 80 },
            fontSize: 16,
            fontFamily: 'sans-serif',
            textColor: '#ffffff'
        }],
        shapes: [{
            id: 'roi-1',
            tool: 'rect',
            color: '#ff0000',
            lineWidth: 2,
            points: [{ x: 100, y: 60 }, { x: 220, y: 160 }],
            opacity: 1,
            style: 'outline'
        }]
    }, {
        capture_session_id: 'capture-camera-session-1',
        capture_view_tags: ['defect_closeup'],
        vision_image_kind: 'physical_product',
        capture_source: 'camera',
        capture_protocol_ready: true,
        capture_available_views: ['full_part_context', 'defect_closeup'],
        capture_missing_views: []
    });

    assert.match(context.question, /리브 주변 백화/);
    assert.match(context.question, /백화 집중부/);
    assert.match(context.question, /사출압력 82 MPa/);
    assert.match(context.question, /rect/);
    assert.match(context.question, /밀핀 자국/);
    assert.match(context.question, /판정 불가/);
    assert.match(context.question, /원형 압흔/);
    assert.match(context.question, /결함 근접 사진/);
    assert.match(context.question, /전체 제품 사진/);
    assert.equal(context.metadata.context_provided, true);
    assert.equal(context.metadata.annotation_count, 1);
    assert.equal(context.metadata.roi_count, 1);
    assert.equal(context.metadata.ocr_provided, true);
    assert.equal(context.metadata.capture_session_id, 'capture-camera-session-1');
    assert.equal(context.metadata.capture_protocol_ready, true);
    assert.deepEqual(context.metadata.capture_view_tags, ['defect_closeup']);
});

test('image gateway forwards multimodal question and telemetry to Common Agent', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({
                agentServerUrl: 'http://agent.test',
                aiOrchestrationMode: 'common_agent_primary'
            })
        }
    };
    (globalThis as any).localStorage = {
        getItem: () => '[]',
        setItem: () => undefined
    };

    const originalDiagnose = CommonAgentApiService.diagnoseImage;
    let receivedOptions: Parameters<typeof CommonAgentApiService.diagnoseImage>[1] | undefined;
    CommonAgentApiService.diagnoseImage = async (_file, options) => {
        receivedOptions = options;
        return {
            image_id: 'common-image-1',
            file_name: 'sample.png',
            mime_type: 'image/png',
            source_system: 'mold-master-ai',
            metadata: {
                vision_model_version: 'vision-model-2026.07',
                vision_prompt_version: 'vision-prompt-v6',
                vision_graph_version: 'approved-graph-43'
            },
            observation: {
                contract_version: 'vision-observation/v2',
                image_kind: 'physical_product',
                normality_status: 'defect_visible',
                observations: [{
                    observation_id: 'full::obs-1',
                    category: 'color',
                    description: '리브 주변 유백색 영역',
                    region: '리브 기부',
                    confidence: 0.82
                }],
                candidates: [{
                    defect_type: '백화',
                    confidence: 0.74,
                    supporting_observation_ids: ['full::obs-1']
                }],
                defect_type: '백화',
                severity: 'Medium',
                summary: '리브 주변 백화가 관찰됨'
            },
            evidence: [],
            view_observations: [
                {
                    view_id: 'view-full',
                    local_image_id: 'local-image-1',
                    image_id: 'server-full',
                    file_name: 'full.png',
                    capture_view_tag: 'full_part_context',
                    is_primary: true,
                    observation: {
                        contract_version: 'vision-observation/v2',
                        image_kind: 'physical_product',
                        normality_status: 'defect_visible',
                        observations: [{
                            observation_id: 'obs-1',
                            category: 'color',
                            description: '리브 주변 유백색 영역',
                            confidence: 0.82
                        }],
                        candidates: [{
                            defect_type: '백화',
                            confidence: 0.74,
                            supporting_observation_ids: ['obs-1']
                        }]
                    }
                },
                {
                    view_id: 'view-close',
                    local_image_id: 'local-image-full',
                    image_id: 'server-close',
                    file_name: 'close.png',
                    capture_view_tag: 'defect_closeup',
                    is_primary: false,
                    observation: {
                        contract_version: 'vision-observation/v2',
                        image_kind: 'physical_product',
                        normality_status: 'defect_visible',
                        observations: [{
                            observation_id: 'obs-2',
                            category: 'surface',
                            description: '근접 표면 변색',
                            confidence: 0.8
                        }],
                        candidates: [{
                            defect_type: '백화',
                            confidence: 0.7,
                            supporting_observation_ids: ['obs-2']
                        }]
                    }
                }
            ],
            fusion_report: {
                contract_version: 'vision-fusion/v1',
                requested_view_count: 2,
                valid_view_count: 2,
                available_view_tags: ['full_part_context', 'defect_closeup'],
                missing_required_views: [],
                disagreement_score: 0.12,
                candidate_support: [{
                    defect_type: '백화',
                    fused_confidence: 0.74,
                    supporting_view_ids: ['view-full', 'view-close'],
                    contradicting_view_ids: [],
                    supporting_view_count: 2,
                    supporting_observation_ids: ['full::obs-1'],
                    contradicting_observation_ids: []
                }],
                decision_status: 'needs_review',
                decision_reason: 'insufficient_multiview_consensus'
            },
            classifier_report: {
                contract_version: 'vision-classifier/v1',
                embedding_model_version: 'dinov2:facebook/dinov2-base',
                embedding_provider: 'dinov2',
                embedding_model_name: 'facebook/dinov2-base',
                top_candidates: [{
                    defect_type: '백화',
                    confidence: 0.86,
                    reference_count: 5,
                    distance: 0.2,
                    support_image_ids: ['ref-white-1', 'ref-white-2', 'ref-white-3']
                }],
                minimum_reference_support: 3
            }
        };
    };

    try {
        const result = await CommonAgentGateway.diagnoseImage({
            imageId: 'local-image-1',
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
            strategy: 'common_agent_primary',
            visionQuality: {
                status: 'warn',
                canAnalyze: true,
                score: 88,
                metrics: {
                    width: 640,
                    height: 480,
                    megapixels: 0.31,
                    meanLuminance: 120,
                    contrast: 42,
                    sharpness: 80,
                    darkRatio: 0.02,
                    brightRatio: 0.01
                },
                issues: [{
                    code: 'resolution_low',
                    severity: 'warn',
                    message: '해상도 주의',
                    recommendation: 'ROI 확대'
                }]
            },
            diagnosisContext: {
                question: '현상 설명: 리브 주변 백화',
                metadata: {
                    context_provided: true,
                    phenomenon_description_length: 12,
                    annotation_count: 1,
                    roi_count: 1,
                    ocr_provided: false,
                    capture_session_id: 'capture-camera-session-1',
                    capture_view_tags: ['defect_closeup'],
                    vision_image_kind: 'physical_product',
                    capture_source: 'camera',
                    capture_protocol_ready: true,
                    capture_available_views: ['full_part_context', 'defect_closeup'],
                    capture_missing_views: []
                }
            },
            sessionImages: [
                {
                    imageId: 'local-image-1',
                    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
                    fileName: 'local-image-1.png',
                    captureViewTag: 'defect_closeup',
                    captureImageKind: 'physical_product',
                    captureSource: 'camera',
                    isPrimary: true
                },
                {
                    imageId: 'local-image-full',
                    dataUrl: 'data:image/png;base64,AQID',
                    fileName: 'local-image-full.png',
                    captureViewTag: 'full_part_context',
                    captureImageKind: 'physical_product',
                    captureSource: 'camera',
                    isPrimary: false
                }
            ]
        });

        assert.equal(receivedOptions?.question, '현상 설명: 리브 주변 백화');
        assert.equal(receivedOptions?.metadata?.context_provided, true);
        assert.equal(receivedOptions?.metadata?.roi_count, 1);
        assert.equal(receivedOptions?.persistMode, 'classifiable_only');
        assert.equal(receivedOptions?.metadata?.vision_quality_status, 'warn');
        assert.equal(receivedOptions?.metadata?.vision_quality_score, 88);
        assert.deepEqual(receivedOptions?.metadata?.vision_quality_issue_codes, ['resolution_low']);
        assert.equal(receivedOptions?.sessionId, 'capture-camera-session-1');
        assert.equal(receivedOptions?.sessionViews?.length, 1);
        assert.equal(receivedOptions?.sessionViews?.[0].localImageId, 'local-image-full');
        assert.equal(receivedOptions?.sessionViews?.[0].captureViewTag, 'full_part_context');
        assert.deepEqual(receivedOptions?.metadata?.capture_view_tags, ['defect_closeup']);
        assert.equal(receivedOptions?.metadata?.capture_protocol_ready, true);
        assert.equal(result.analysis.visionSummary?.primaryCandidate?.defectType, '백화');
        assert.equal(result.analysis.visionSummary?.decisionStatus, 'needs_review');
        assert.equal(result.analysis.visionSummary?.fusionSummary?.validViewCount, 2);
        assert.equal(result.analysis.visionSummary?.fusionSummary?.disagreementScore, 0.12);
        assert.equal(result.analysis.visionSummary?.viewEvidence?.length, 2);
        assert.equal(result.analysis.visionSummary?.classifierSummary?.status, 'agreed');
        assert.equal(result.analysis.visionSummary?.classifierSummary?.embeddingModelVersion, 'dinov2:facebook/dinov2-base');
        assert.equal(result.comparison.visionCandidateCount, 1);
        assert.equal(result.comparison.visionViewCount, 2);
        assert.equal(result.comparison.visionDisagreementScore, 0.12);
        assert.equal(result.comparison.visionClassifierStatus, 'agreed');
        assert.equal(result.comparison.visionClassifierAgreementWithVisionTop1, true);
        assert.equal(result.comparison.visionClassifierVisionCandidate, '백화');
        assert.equal(result.comparison.visionClassifierTopCandidate, '백화');
        assert.equal(result.comparison.visionClassifierReferenceCount, 5);
        assert.equal(result.comparison.visionDecisionReason, 'insufficient_multiview_consensus');
        assert.deepEqual(result.comparison.commonAgentVersionSnapshot, {
            modelVersion: 'vision-model-2026.07',
            promptVersion: 'vision-prompt-v6',
            graphVersion: 'approved-graph-43'
        });
        assert.equal(
            result.commonAgentImageIdsByLocalId?.['local-image-full'],
            'server-close'
        );
    } finally {
        CommonAgentApiService.diagnoseImage = originalDiagnose;
    }
});

test('Vision diagnose sends additional session views and an ordered lineage manifest', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    let capturedForm: FormData | undefined;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        capturedForm = init?.body as FormData;
        return new Response(JSON.stringify({
            image_id: 'server-primary',
            file_name: 'primary.png',
            mime_type: 'image/png',
            source_system: 'mold-master-ai',
            observation: {
                contract_version: 'vision-observation/v2',
                image_kind: 'physical_product',
                normality_status: 'uncertain',
                observations: [],
                candidates: []
            },
            evidence: []
        }), { status: 200 });
    }) as typeof fetch;

    const primary = new File([new Uint8Array([1])], 'primary.png', { type: 'image/png' });
    const closeup = new File([new Uint8Array([2])], 'closeup.png', { type: 'image/png' });
    const oblique = new File([new Uint8Array([3])], 'oblique.png', { type: 'image/png' });
    await CommonAgentApiService.diagnoseImage(primary, {
        metadata: {
            local_image_id: 'local-primary',
            capture_view_tags: ['full_part_context']
        },
        sessionViews: [
            {
                file: closeup,
                localImageId: 'local-closeup',
                captureViewTag: 'defect_closeup',
                imageKind: 'physical_product',
                captureSource: 'camera'
            },
            {
                file: oblique,
                localImageId: 'local-oblique',
                captureViewTag: 'oblique_light',
                imageKind: 'physical_product',
                captureSource: 'camera'
            }
        ]
    });

    assert.equal(capturedForm?.getAll('view_files').length, 2);
    const manifest = JSON.parse(String(capturedForm?.get('view_manifest_json')));
    assert.deepEqual(
        manifest.map((item: any) => [item.local_image_id, item.capture_view_tag, item.is_primary]),
        [
            ['local-primary', 'full_part_context', true],
            ['local-closeup', 'defect_closeup', false],
            ['local-oblique', 'oblique_light', false]
        ]
    );
});

test('Vision diagnose sends persistence policy and omits quarantined dataset ids', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({
                agentServerUrl: 'http://agent.test',
                aiOrchestrationMode: 'common_agent_primary'
            })
        }
    };
    (globalThis as any).localStorage = {
        getItem: () => '[]',
        setItem: () => undefined
    };
    const persistModes: string[] = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
        const form = init?.body as FormData;
        persistModes.push(String(form.get('persist_mode')));
        return new Response(JSON.stringify({
            image_id: 'ephemeral-image-1',
            file_name: 'screen.png',
            mime_type: 'image/png',
            source_system: 'mold-master-ai',
            observation: {
                defect_type: '판정 불가',
                severity: '-',
                summary: '제품 이미지가 아님'
            },
            evidence: [],
            review_status: 'rejected',
            metadata: {
                persisted_to_dataset: false,
                quality_quarantined: true
            }
        }), { status: 200 });
    }) as typeof fetch;

    const file = new File([new Uint8Array([1, 2, 3])], 'screen.png', { type: 'image/png' });
    await CommonAgentApiService.diagnoseImage(file);
    await CommonAgentApiService.diagnoseImage(file, { persistMode: 'always' });
    assert.deepEqual(persistModes, ['classifiable_only', 'always']);

    const result = await CommonAgentGateway.diagnoseImage({
        imageId: 'local-screen',
        dataUrl: 'data:image/png;base64,AQID',
        strategy: 'common_agent_primary'
    });
    assert.equal(result.commonAgentImageId, undefined);
});

test('knowledge and graph retrieval use Common Agent contracts', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        if (url.endsWith('/v1/ask')) {
            return new Response(JSON.stringify({
                answer: 'Graph-grounded answer',
                confidence: 0.9,
                evidence: [],
                reasoning_trace: ['retrieve_graph']
            }), { status: 200 });
        }
        if (url.endsWith('/v1/feedback')) {
            return new Response(JSON.stringify({
                status: 'accepted',
                target_id: body.target_id,
                review_status: 'approved'
            }), { status: 200 });
        }
        return new Response(JSON.stringify({
            question: body.question,
            paths: []
        }), { status: 200 });
    }) as typeof fetch;

    await CommonAgentApiService.askKnowledge('whitening near rib', {
        topK: 4,
        category: 'mold',
        includeRag: false,
        evidencePolicy: 'graph_approved_only'
    });
    await CommonAgentApiService.queryGraphPaths('whitening near rib', { topK: 3, maxHops: 2 });
    await CommonAgentApiService.submitFeedback({
        targetType: 'image_dataset',
        targetId: 'image-1',
        decision: 'approve',
        metadata: { local_image_id: 'local-1' }
    });

    assert.deepEqual(calls.map(call => call.url), [
        'http://agent.test/v1/ask',
        'http://agent.test/v1/graph/paths',
        'http://agent.test/v1/feedback'
    ]);
    assert.equal(calls[0].body.top_k, 4);
    assert.equal(calls[0].body.filters.include_knowledge_graph, true);
    assert.equal(calls[0].body.filters.include_rag, false);
    assert.equal(calls[0].body.filters.evidence_policy, 'graph_approved_only');
    assert.equal(calls[1].body.max_hops, 2);
    assert.equal(calls[1].body.filters.review_status, 'approved');
    assert.equal(calls[2].body.target_type, 'image_dataset');
    assert.equal(calls[2].body.metadata.source_app, 'mold-master-ai');
});

test('HITL image review writes corrected fields and promotes approved data to Graph', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    let capturedUrl = '';
    let capturedBody: any;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
            status: 'reviewed',
            next_action: 'completed',
            item: {
                image_id: 'image-1',
                defect_type: capturedBody.defect_type,
                review_status: 'approved'
            }
        }), { status: 200 });
    }) as typeof fetch;

    await CommonAgentApiService.reviewImageDataset('image-1', {
        decision: 'approve',
        defectType: '밀핀 자국',
        observationSummary: '밀핀 위치의 원형 압흔',
        possibleCauses: ['밀핀 돌출'],
        recommendedChecks: ['밀핀 높이 확인'],
        severity: 'Medium',
        labels: ['밀핀 자국'],
        observation: {
            contract_version: 'vision-observation/v2',
            image_kind: 'physical_product',
            normality_status: 'defect_visible',
            summary: '밀핀 위치의 원형 압흔',
            observations: [{
                observation_id: 'obs-ejector-1',
                category: 'geometry',
                description: '밀핀 위치의 원형 압흔',
                confidence: 0.86
            }],
            candidates: [{
                defect_type: '밀핀 자국',
                confidence: 0.84,
                supporting_observation_ids: ['obs-ejector-1']
            }]
        },
        promoteToGraph: true,
        metadata: { content_sha256: 'hash-1' }
    });

    assert.equal(capturedUrl, 'http://agent.test/v1/datasets/images/image-1/review');
    assert.equal(capturedBody.decision, 'approve');
    assert.equal(capturedBody.defect_type, '밀핀 자국');
    assert.deepEqual(capturedBody.possible_causes, ['밀핀 돌출']);
    assert.deepEqual(capturedBody.recommended_checks, ['밀핀 높이 확인']);
    assert.equal(capturedBody.observation.contract_version, 'vision-observation/v2');
    assert.equal(capturedBody.observation.observations[0].observation_id, 'obs-ejector-1');
    assert.equal(capturedBody.promote_to_graph, true);
    assert.equal(capturedBody.metadata.content_sha256, 'hash-1');
});

test('capture protocol metadata uses a non-destructive dataset patch', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: any;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = String(init?.method);
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
            image_id: 'image-1',
            review_status: 'approved',
            metadata: capturedBody.metadata
        }), { status: 200 });
    }) as typeof fetch;

    await CommonAgentApiService.updateImageDatasetMetadata('image-1', {
        vision_image_kind: 'physical_product',
        capture_view_tags: ['full_part_context', 'defect_closeup']
    });

    assert.equal(capturedUrl, 'http://agent.test/v1/datasets/images/image-1');
    assert.equal(capturedMethod, 'PATCH');
    assert.equal(capturedBody.review_status, undefined);
    assert.deepEqual(capturedBody.metadata.capture_view_tags, [
        'full_part_context',
        'defect_closeup'
    ]);
    assert.equal(capturedBody.metadata.source_app, 'mold-master-ai');
});

test('HITL conflict check detects an approved identical image with another label', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async () => new Response(JSON.stringify({
        items: [
            {
                image_id: 'existing-image',
                defect_type: '플래시',
                review_status: 'approved',
                metadata: { content_sha256: 'same-hash' }
            },
            {
                image_id: 'same-label-image',
                defect_type: '백화',
                review_status: 'approved',
                metadata: { content_sha256: 'same-hash' }
            }
        ],
        total: 2
    }), { status: 200 })) as typeof fetch;

    const conflicts = await CommonAgentApiService.findApprovedImageLabelConflicts({
        contentSha256: 'same-hash',
        defectType: '백화',
        excludeImageId: 'same-label-image'
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].imageId, 'existing-image');
    assert.equal(conflicts[0].defectType, '플래시');
});

test('Vision dataset readiness excludes duplicate images with conflicting labels', () => {
    const readiness = calculateVisionDatasetReadiness([
        {
            image_id: 'approved-clean',
            defect_type: '밀핀 자국',
            review_status: 'approved',
            metadata: { content_sha256: 'hash-clean' }
        },
        {
            image_id: 'approved-conflict-a',
            defect_type: '표면 결함',
            review_status: 'approved',
            metadata: { content_sha256: 'hash-conflict' }
        },
        {
            image_id: 'approved-conflict-b',
            defect_type: '플래시',
            review_status: 'approved',
            metadata: { content_sha256: 'hash-conflict' }
        },
        {
            image_id: 'candidate-one',
            defect_type: '백화',
            review_status: 'candidate',
            metadata: { content_sha256: 'hash-candidate' }
        }
    ]);

    assert.equal(readiness.total, 4);
    assert.equal(readiness.approved, 3);
    assert.equal(readiness.cleanApproved, 1);
    assert.equal(readiness.conflictGroups.length, 1);
    assert.equal(readiness.conflictedRecords, 2);
    assert.equal(readiness.candidate, 1);
    assert.equal(readiness.additionalCleanImagesRequired, 19);
    assert.equal(readiness.sampleGateReady, false);
    assert.equal(readiness.observedDefectClasses, 1);
    assert.equal(readiness.coveredDefectClasses, 0);
    assert.equal(readiness.classCoverageReady, false);
    assert.deepEqual(
        readiness.defectClassCoverage.find(item => item.defectClass === 'ejection'),
        {
            defectClass: 'ejection',
            count: 1,
            required: 2,
            missing: 1,
            covered: false
        }
    );
    assert.deepEqual(readiness.defectTypeCounts, [{ defectType: '밀핀 자국', count: 1 }]);
});

test('Vision dataset readiness counts same-hash same-label approvals once', () => {
    const readiness = calculateVisionDatasetReadiness([
        {
            image_id: 'weld-a',
            defect_type: '웰드라인',
            review_status: 'approved',
            metadata: { content_sha256: 'same-weld-hash' }
        },
        {
            image_id: 'weld-b',
            defect_type: '웰드라인',
            review_status: 'approved',
            metadata: { content_sha256: 'same-weld-hash' }
        },
        {
            image_id: 'weld-c',
            defect_type: '웰드라인',
            review_status: 'approved',
            metadata: { content_sha256: 'independent-weld-hash' }
        }
    ]);

    assert.equal(readiness.approved, 3);
    assert.equal(readiness.cleanApproved, 2);
    assert.equal(readiness.duplicateRecords, 1);
    assert.equal(
        readiness.defectClassCoverage.find(item => item.defectClass === 'weld_line')?.count,
        2
    );
});

test('Vision readiness requires balanced coverage instead of 20 repeated labels', () => {
    const repeatedWhitening = Array.from({ length: 20 }, (_, index) => ({
        image_id: `whitening-${index}`,
        defect_type: 'whitening',
        review_status: 'approved',
        metadata: { content_sha256: `whitening-hash-${index}` }
    }));
    const repeatedReadiness = calculateVisionDatasetReadiness(repeatedWhitening);

    assert.equal(repeatedReadiness.sampleGateReady, true);
    assert.equal(repeatedReadiness.classCoverageReady, false);
    assert.equal(repeatedReadiness.retirementDataReady, false);
    assert.equal(repeatedReadiness.coveredDefectClasses, 1);

    const classes = [
        'whitening',
        'short shot',
        'burn mark',
        'flash',
        'sink mark',
        'weld line',
        'ejection'
    ];
    const balanced = classes.flatMap((defectType, classIndex) =>
        Array.from({ length: classIndex < 6 ? 3 : 2 }, (_, index) => ({
            image_id: `${classIndex}-${index}`,
            defect_type: defectType,
            review_status: 'approved',
            metadata: { content_sha256: `${classIndex}-hash-${index}` }
        }))
    );
    const balancedReadiness = calculateVisionDatasetReadiness(balanced);

    assert.equal(balancedReadiness.cleanApproved, 20);
    assert.equal(balancedReadiness.sampleGateReady, true);
    assert.equal(balancedReadiness.classCoverageReady, true);
    assert.equal(balancedReadiness.retirementDataReady, true);
    assert.equal(balancedReadiness.coveredDefectClasses, 7);
});

test('chat gateway returns a cited Common Agent answer with the same session', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({
                agentServerUrl: 'http://agent.test',
                aiOrchestrationMode: 'common_agent_primary'
            })
        }
    };
    const originalAsk = CommonAgentApiService.askKnowledge;
    let receivedSessionId = '';
    CommonAgentApiService.askKnowledge = async (_question, options) => {
        receivedSessionId = options.sessionId || '';
        return {
            answer: 'Increase draft angle and inspect rib polishing.',
            confidence: 0.88,
            evidence: [{
                node_id: 'node-1',
                text: 'approved evidence',
                score: 0.9,
                source_type: 'knowledge_path',
                source_ref: 'graph:path-1'
            }],
            reasoning_trace: ['graph_path_selected']
        };
    };

    try {
        const result = await CommonAgentGateway.askQuestion({
            messages: [{ role: 'user', text: 'How should rib whitening be corrected?' }],
            useKnowledge: true,
            retrievalMode: 'graph_only',
            sessionId: 'session-chat-1'
        });

        assert.equal(result.source, 'common_agent');
        assert.equal(receivedSessionId, 'session-chat-1');
        assert.match(result.text, /COMMON AGENT/);
        assert.match(result.text, /graph:path-1/);
        assert.match(result.text, /graph_path_selected/);
    } finally {
        CommonAgentApiService.askKnowledge = originalAsk;
    }
});

test('graph chat explicitly reports when Common Agent returns no approved evidence', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({
                aiOrchestrationMode: 'common_agent_primary',
                agentServerUrl: 'http://agent.test'
            })
        }
    };
    const originalAsk = CommonAgentApiService.askKnowledge;
    CommonAgentApiService.askKnowledge = async () => ({
        answer: 'General inference only',
        confidence: 0,
        evidence: [],
        reasoning_trace: ['graph_query_completed_without_match']
    });

    try {
        const result = await CommonAgentGateway.askQuestion({
            messages: [{ role: 'user', text: 'Unknown defect' }],
            useKnowledge: true,
            retrievalMode: 'graph_only',
            sessionId: 'session-no-evidence'
        });

        assert.match(result.text, /승인 근거를 반환하지 않았습니다/);
        assert.match(result.text, /일반 추론으로만 참고/);
    } finally {
        CommonAgentApiService.askKnowledge = originalAsk;
    }
});

test('manual documents are ingested and deleted through Common Agent', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    const calls: Array<{ url: string; method: string; body?: FormData }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({
            url,
            method: init?.method || 'GET',
            body: init?.body instanceof FormData ? init.body : undefined
        });
        if (url.includes('/v1/workflows/ingest-file')) {
            return new Response(JSON.stringify({
                document_id: 'document-1',
                review_status: 'candidate',
                persisted_to_sql: true,
                persisted_to_graph: true
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: 'deleted' }), { status: 200 });
    }) as typeof fetch;

    const result = await CommonAgentApiService.ingestDocument(
        'manual.txt',
        new TextEncoder().encode('approved mold knowledge'),
        { mimeType: 'text/plain' }
    );
    await CommonAgentApiService.deleteDocument(result.document_id);

    assert.equal(result.persisted_to_graph, true);
    assert.deepEqual(calls.map(call => [call.method, call.url]), [
        ['POST', 'http://agent.test/v1/workflows/ingest-file'],
        ['DELETE', 'http://agent.test/v1/documents/document-1?confirm=true&delete_graph=true']
    ]);
    assert.equal(calls[0].body?.get('source_system'), 'mold-master-ai');
    assert.equal((calls[0].body?.get('file') as File).name, 'manual.txt');
});

test('local process knowledge is converted into a traceable migration document', () => {
    const markdown = buildProcessKnowledgeMigrationMarkdown([{
        id: 7,
        sourceSheet: 'Injection',
        sourceRow: 12,
        productGroup: 'Grille',
        processGroup: 'Injection molding',
        issueFamily: 'Appearance',
        issueName: 'Rib whitening',
        symptomText: 'Ejection snap sound and whitening around rib',
        causeHypotheses: 'Excessive release resistance',
        countermeasureText: 'Improve draft angle and inspect ejector balance',
        learningSource: 'process_matrix'
    }]);

    assert.match(markdown, /Rib whitening/);
    assert.match(markdown, /Excessive release resistance/);
    assert.match(markdown, /Source record: knowledge_matrix:7/);
    assert.match(markdown, /Source sheet: Injection row 12/);
});

test('central orchestration health does not depend on the legacy RAG server', async () => {
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    })) as typeof fetch;

    try {
        const health = await checkServerHealth();
        assert.equal(health.agent, 'online');
        assert.equal(health.rag, 'online');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

const previewItems = [1, 2, 3, 4].map(index => ({
    id: `item-${index}`,
    images: [],
    analysis: {
        problem: `problem-${index}`,
        cause: `cause-${index}`,
        countermeasures: `countermeasure-${index}`
    }
}));

test('builds a feasibility preview with a cover and one page per review item', () => {
    const pages = buildReportPreviewPages('feasibility_report', previewItems);

    assert.equal(pages.length, 5);
    assert.equal(pages[0].kind, 'cover');
    assert.deepEqual(pages.slice(1).map(page => page.items.length), [1, 1, 1, 1]);
});

test('builds a mold specification preview with one first-page item and paired continuation items', () => {
    const pages = buildReportPreviewPages('mold_spec', previewItems);

    assert.equal(pages.length, 3);
    assert.deepEqual(pages.map(page => page.items.length), [1, 2, 1]);
    assert.deepEqual(pages.map(page => page.pageNumber), [1, 2, 3]);
});

test('builds graph-grounded draft sections from report items', () => {
    const payload = buildDocumentDraftSyncPayload(
        'feasibility_report',
        { caseId: 'case-001', modelName: 'MODEL-A', partName: 'GRILLE' },
        [
            {
                id: 'item-1',
                sectionType: 'problem',
                images: [
                    {
                        id: 'local-image-1',
                        commonAgentImageId: 'agent-image-1',
                        analysis: {
                            retrievalSummary: {
                                citations: ['doc:standard-1'],
                                graphTrace: ['Problem -> Cause -> Action']
                            }
                        }
                    }
                ],
                analysis: {
                    problem: 'Whitening near the rib',
                    cause: 'Local sticking during ejection',
                    countermeasures: 'Increase draft angle and polish the rib area'
                }
            }
        ] as any,
        { now: 1000 }
    );

    assert.equal(payload.caseRequest.case_id, 'case-001');
    assert.equal(payload.draftRequest.draft_type, 'review_report');
    assert.deepEqual(payload.draftRequest.sections[0].source_image_ids, ['agent-image-1']);
    assert.deepEqual(payload.draftRequest.sections[0].evidence_refs, [
        'doc:standard-1',
        'Problem -> Cause -> Action'
    ]);
});

test('verified sync follows create, submit, approve order', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, method: init?.method || 'GET', body });
        if (url.endsWith('/v1/cases')) {
            return new Response(JSON.stringify({ case_id: body.case_id }), { status: 200 });
        }
        if (url.endsWith('/v1/report-drafts')) {
            return new Response(JSON.stringify({ draft_id: 'draft-1', status: 'draft' }), { status: 201 });
        }
        if (url.endsWith('/submit')) {
            return new Response(JSON.stringify({ draft_id: 'draft-1', status: 'review_pending' }), { status: 200 });
        }
        return new Response(JSON.stringify({ draft_id: 'draft-1', status: 'approved' }), { status: 200 });
    }) as typeof fetch;

    const result = await CommonAgentDocumentService.syncDraft(
        {
            caseRequest: { case_id: 'case-001', title: 'Review case' },
            draftRequest: {
                case_id: 'case-001',
                draft_type: 'review_report',
                title: 'Review draft',
                sections: [{ section_id: 'section-1', section_type: 'problem' }]
            }
        } as any,
        { verified: true }
    );

    assert.equal(result.status, 'approved');
    assert.deepEqual(calls.map(call => call.url), [
        'http://agent.test/v1/cases',
        'http://agent.test/v1/report-drafts',
        'http://agent.test/v1/report-drafts/draft-1/submit',
        'http://agent.test/v1/report-drafts/draft-1/review'
    ]);
    assert.equal(calls[3].body.decision, 'approve');
});

test('section assist upserts the case before requesting graph-grounded draft content', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, body });
        if (url.endsWith('/v1/cases')) {
            return new Response(JSON.stringify({ case_id: body.case_id }), { status: 200 });
        }
        return new Response(JSON.stringify({
            draft: {
                draft_id: 'draft-assisted-1',
                status: 'draft',
                sections: [{
                    section_id: 'section-1',
                    problem: 'Whitening near the rib',
                    cause: 'Local sticking',
                    countermeasures: 'Increase draft angle',
                    evidence_refs: ['graph:path-1']
                }]
            },
            graph_grounded: true,
            llm_supplemented: false,
            evidence_count: 1,
            workflow_trace: ['prepare_query', 'retrieve_graph_evidence', 'compose_sections', 'validate_draft'],
            warnings: []
        }), { status: 201 });
    }) as typeof fetch;

    const result = await CommonAgentDocumentService.assistDraft({
        caseRequest: { case_id: 'case-001', title: 'Whitening review' },
        assistRequest: {
            case_id: 'case-001',
            problem_description: 'Whitening near the rib',
            existing_sections: [{ section_id: 'section-1', section_type: 'problem' }]
        }
    });

    assert.deepEqual(calls.map(call => call.url), [
        'http://agent.test/v1/cases',
        'http://agent.test/v1/report-drafts/assist'
    ]);
    assert.equal(calls[1].body.evidence_policy, 'graph_approved_only');
    assert.equal(result.graph_grounded, true);
    assert.deepEqual(result.draft.sections[0].evidence_refs, ['graph:path-1']);
});

test('manual documents are owned by the Common Agent registry', async () => {
    const storage = new Map<string, string>();
    const requests: Array<{ url: string; method: string }> = [];
    (globalThis as any).localStorage = {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
    };
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        requests.push({ url, method: init?.method || 'GET' });
        if (url.endsWith('/v1/workflows/ingest-file')) {
            return new Response(JSON.stringify({
                document_id: 'doc-manual-1',
                version_id: 'ver-manual-1',
                persisted_to_sql: true,
                persisted_to_graph: false,
                review_status: 'candidate'
            }), { status: 201 });
        }
        return new Response(null, { status: 204 });
    }) as typeof fetch;

    const documentId = await syncManualDocument(
        'manual-spec.txt',
        new TextEncoder().encode('approved manual content')
    );

    assert.equal(documentId, 'doc-manual-1');
    assert.deepEqual(listManualDocuments(), [{
        fileName: 'manual-spec.txt',
        documentId: 'doc-manual-1'
    }]);

    await deleteManualDocument('manual-spec.txt');

    assert.deepEqual(listManualDocuments(), []);
    assert.deepEqual(requests, [
        {
            url: 'http://agent.test/v1/workflows/ingest-file',
            method: 'POST'
        },
        {
            url: 'http://agent.test/v1/documents/doc-manual-1?confirm=true&delete_graph=true',
            method: 'DELETE'
        }
    ]);
});

test('learning-ready Vision export is requested from Common Agent with strict gates', async () => {
    let capturedUrl = '';
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify({
            dataset_name: 'field-vision-image-dataset',
            format: 'classification_manifest',
            learning_ready_only: true,
            capture_ready_count: 2,
            excluded_counts: { missing_required_views: 1 },
            items: [{
                image_id: 'image-ready-full',
                file_name: 'full.jpg',
                mime_type: 'image/jpeg',
                file_url: '/v1/datasets/images/image-ready-full/file',
                review_status: 'approved',
                split: 'train',
                split_key: 'capture-session-1',
                class_name: 'whitening',
                labels: ['whitening'],
                defect_type: 'whitening',
                process_area: 'injection',
                capture_session_id: 'capture-session-1',
                capture_view_tag: 'full_part_context',
                capture_protocol_ready: true,
                learning_candidate_eligible: true,
                content_hash: 'hash-full',
                product_family: 'grille',
                mold_id: 'mold-a'
            }],
            warnings: ['learning-ready export is session-grouped']
        }), { status: 200 });
    }) as typeof fetch;

    const exportResult = await CommonAgentApiService.loadLearningReadyVisionExport({
        minConfidence: 0.8,
        minVisionConfidence: 0.8,
        limit: 100
    });

    const url = new URL(capturedUrl);
    assert.equal(url.origin, 'http://agent.test');
    assert.equal(url.pathname, '/v1/datasets/images/export');
    assert.equal(url.searchParams.get('review_status'), 'approved');
    assert.equal(url.searchParams.get('learning_ready_only'), 'true');
    assert.equal(url.searchParams.get('min_confidence'), '0.8');
    assert.equal(url.searchParams.get('min_vision_confidence'), '0.8');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(exportResult.learning_ready_only, true);
    assert.equal(exportResult.items[0].split_key, 'capture-session-1');
    assert.equal(exportResult.items[0].capture_view_tag, 'full_part_context');
    assert.equal(exportResult.excluded_counts.missing_required_views, 1);
});

test('current Vision reference benchmark is requested from Common Agent with release gates', async () => {
    let capturedUrl = '';
    let capturedBody: any;
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
            embedding_model_version: 'dinov2-reference-v1',
            reference_count: 40,
            evaluated_count: 40,
            top1_accuracy: 0.9,
            top3_accuracy: 0.97,
            required_defect_types: ['whitening', 'flash'],
            per_class: [],
            gate_checks: { top1Accuracy: true, top3Accuracy: true },
            failed_gate_checks: [],
            ready_for_graph_retrieval: true,
            warnings: []
        }), { status: 200 });
    }) as typeof fetch;

    const report = await CommonAgentApiService.benchmarkCurrentVisionReferences({
        embedding_model_version: 'dinov2-reference-v1',
        minimum_samples: 20,
        required_defect_types: ['whitening', 'flash'],
        minimum_samples_per_class: 2,
        minimum_top1_accuracy: 0.8,
        minimum_top3_accuracy: 0.9
    });

    assert.equal(capturedUrl, 'http://agent.test/v1/vision/classifier/benchmark-current');
    assert.deepEqual(capturedBody, {
        embedding_model_version: 'dinov2-reference-v1',
        minimum_samples: 20,
        required_defect_types: ['whitening', 'flash'],
        minimum_samples_per_class: 2,
        minimum_top1_accuracy: 0.8,
        minimum_top3_accuracy: 0.9
    });
    assert.equal(report.ready_for_graph_retrieval, true);
});

test('current Vision reference status is requested from Common Agent', async () => {
    let capturedUrl = '';
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify({
            ready: true,
            status: 'ready',
            store_dir: '/app/data/vision-reference-store',
            manifest_id: 'dinov2-base-ready',
            manifest_path: '/app/data/vision-reference-store/manifests/dinov2-base-ready.json',
            embedding_model_version: 'dinov2:facebook/dinov2-base',
            embedding_provider: 'dinov2',
            embedding_model_name: 'facebook/dinov2-base',
            embedding_dimensions: 768,
            embedding_device: 'cpu',
            embedding_runtime: 'transformers',
            embedding_production_ready: true,
            reference_count: 42,
            source_item_count: 44,
            source_learning_ready_only: true,
            generated_at: '2026-07-27T00:00:00Z',
            updated_at: '2026-07-27T00:01:00Z',
            warnings: ['2 images skipped']
        }), { status: 200 });
    }) as typeof fetch;

    const status = await CommonAgentApiService.getCurrentVisionReferenceStatus();

    assert.equal(capturedUrl, 'http://agent.test/v1/vision/classifier/references/current');
    assert.equal(status.ready, true);
    assert.equal(status.embedding_model_version, 'dinov2:facebook/dinov2-base');
    assert.equal(status.embedding_provider, 'dinov2');
    assert.equal(status.reference_count, 42);
    assert.deepEqual(status.warnings, ['2 images skipped']);
});

test('Vision reference refresh is requested from Common Agent', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    (globalThis as any).window = {
        electronAPI: {
            getApiConfig: async () => ({ agentServerUrl: 'http://agent.test' })
        }
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(input);
        capturedMethod = init?.method || 'GET';
        return new Response(JSON.stringify({
            status: 'promoted',
            manifest_id: 'dinov2-base-ready',
            reference_count: 42,
            store_dir: '/app/data/vision-reference-store',
            embedding_model_version: 'dinov2:facebook/dinov2-base',
            warnings: []
        }), { status: 200 });
    }) as typeof fetch;

    const result = await CommonAgentApiService.refreshVisionReferences();

    assert.equal(capturedUrl, 'http://agent.test/v1/vision/classifier/references/refresh');
    assert.equal(capturedMethod, 'POST');
    assert.equal(result.status, 'promoted');
    assert.equal(result.manifest_id, 'dinov2-base-ready');
    assert.equal(result.embedding_model_version, 'dinov2:facebook/dinov2-base');
    assert.equal(result.reference_count, 42);
});

test('enforced Vision reference benchmark gate blocks Common Agent graph path before diagnosis', async () => {
    const originalBenchmark = CommonAgentApiService.benchmarkCurrentVisionReferences;
    let diagnoseCalled = false;
    CommonAgentApiService.benchmarkCurrentVisionReferences = async () => ({
        embedding_model_version: 'dinov2:facebook/dinov2-base',
        embedding_provider: 'dinov2',
        embedding_model_name: 'facebook/dinov2-base',
        embedding_dimensions: 768,
        embedding_device: 'cpu',
        embedding_runtime: 'transformers',
        embedding_production_ready: true,
        reference_count: 6,
        evaluated_count: 6,
        top1_accuracy: 0.33,
        top3_accuracy: 0.66,
        required_defect_types: ['whitening', 'flash'],
        per_class: [],
        gate_checks: { top1Accuracy: false, top3Accuracy: false },
        failed_gate_checks: ['top1Accuracy', 'top3Accuracy'],
        ready_for_graph_retrieval: false,
        warnings: []
    });

    try {
        const execution = await executeDiagnosisStrategy(
            'common_agent_primary',
            async () => {
                await assertVisionReferenceBenchmarkReady({
                    provider: 'openai',
                    aiOrchestrationMode: 'common_agent_primary',
                    visionReferenceBenchmarkGateMode: 'enforce',
                    visionReferenceBenchmarkModelVersion: 'dinov2-reference-v1'
                });
                diagnoseCalled = true;
                return diagnosisCandidate('common_agent', 'whitening');
            },
            async () => diagnosisCandidate('legacy', 'legacy-safe-review')
        );

        assert.equal(diagnoseCalled, false);
        assert.equal(execution.selected.source, 'legacy');
        assert.equal(execution.fallbackUsed, true);
        assert.match(execution.commonAgentError || '', /top1Accuracy/);
    } finally {
        CommonAgentApiService.benchmarkCurrentVisionReferences = originalBenchmark;
    }
});

test('shadow Vision reference benchmark gate records failure without blocking diagnosis', async () => {
    const originalBenchmark = CommonAgentApiService.benchmarkCurrentVisionReferences;
    CommonAgentApiService.benchmarkCurrentVisionReferences = async () => ({
        embedding_model_version: 'dinov2:facebook/dinov2-base',
        embedding_provider: 'dinov2',
        embedding_model_name: 'facebook/dinov2-base',
        embedding_dimensions: 768,
        embedding_device: 'cpu',
        embedding_runtime: 'transformers',
        embedding_production_ready: true,
        reference_count: 6,
        evaluated_count: 6,
        top1_accuracy: 0.33,
        top3_accuracy: 0.66,
        required_defect_types: ['whitening', 'flash'],
        per_class: [],
        gate_checks: { top1Accuracy: false },
        failed_gate_checks: ['top1Accuracy'],
        ready_for_graph_retrieval: false,
        warnings: []
    });

    try {
        const gate = await assertVisionReferenceBenchmarkReady({
            provider: 'openai',
            visionReferenceBenchmarkGateMode: 'shadow',
            visionReferenceBenchmarkModelVersion: 'dinov2:facebook/dinov2-base'
        });

        assert.equal(gate.checked, true);
        assert.equal(gate.ready, false);
        assert.equal(gate.embeddingModelVersion, 'dinov2:facebook/dinov2-base');
        assert.equal(gate.embeddingProvider, 'dinov2');
        assert.equal(gate.embeddingModelName, 'facebook/dinov2-base');
        assert.equal(gate.embeddingDimensions, 768);
        assert.equal(gate.embeddingDevice, 'cpu');
        assert.equal(gate.embeddingRuntime, 'transformers');
        assert.equal(gate.embeddingProductionReady, true);
        assert.deepEqual(gate.failedChecks, ['top1Accuracy']);
    } finally {
        CommonAgentApiService.benchmarkCurrentVisionReferences = originalBenchmark;
    }
});
