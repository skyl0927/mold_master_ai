import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CommonAgentDocumentService,
    buildDocumentDraftSyncPayload
} from '../services/commonAgentDocumentService';
import { buildReportPreviewPages } from '../services/reportPreviewModel';
import { compactSpecificationAnalysis } from '../services/reportContentFormatter';
import {
    calculateDiagnosisObservability,
    calculateTransitionReadiness,
    CommonAgentGateway,
    defectTypesAgree,
    executeDiagnosisStrategy,
    isUsableDefectType
} from '../services/commonAgentGateway';
import { CommonAgentApiService } from '../services/commonAgentApiService';
import { buildMultimodalDiagnosisContext } from '../services/diagnosisContextService';
import { buildProcessKnowledgeMigrationMarkdown } from '../services/processKnowledgeMigrationService';
import { checkServerHealth } from '../services/serverHealthService';
import { calculateVisionDatasetReadiness } from '../services/visionDatasetReadinessService';
import {
    deleteManualDocument,
    listManualDocuments,
    syncManualDocument
} from '../services/manualKnowledgeSyncService';

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
            contextProvided: true,
            roiCount: 1,
            ocrProvided: false
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
            contextProvided: false,
            roiCount: 0,
            ocrProvided: true,
            commonAgentError: 'connect ECONNREFUSED 127.0.0.1:8000'
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
            contextProvided: true,
            roiCount: 2,
            ocrProvided: true,
            legacyError: 'legacy provider timeout'
        }
    ];

    const observability = calculateDiagnosisObservability(records);

    assert.equal(observability.total, 3);
    assert.deepEqual(observability.commonAgentLatencyMs, { sampleCount: 2, p50: 100, p95: 300, average: 200 });
    assert.deepEqual(observability.legacyLatencyMs, { sampleCount: 2, p50: 300, p95: 500, average: 400 });
    assert.equal(observability.graphGroundedRate, 66.7);
    assert.equal(observability.averageEvidenceCount, 2);
    assert.equal(observability.contextProvidedRate, 66.7);
    assert.equal(observability.roiContextRate, 66.7);
    assert.equal(observability.ocrContextRate, 66.7);
    assert.deepEqual(observability.selectedSources, { common_agent: 2, legacy: 1 });
    assert.deepEqual(observability.retrievalModes, { direct: 0, local_rag: 0, remote_rag: 0, hybrid: 2, graph_only: 1 });
    assert.deepEqual(observability.metricSamples, {
        graphGrounded: 3,
        llmSupplemented: 3,
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
    });

    assert.match(context.question, /리브 주변 백화/);
    assert.match(context.question, /백화 집중부/);
    assert.match(context.question, /사출압력 82 MPa/);
    assert.match(context.question, /rect/);
    assert.match(context.question, /밀핀 자국/);
    assert.match(context.question, /판정 불가/);
    assert.match(context.question, /원형 압흔/);
    assert.equal(context.metadata.context_provided, true);
    assert.equal(context.metadata.annotation_count, 1);
    assert.equal(context.metadata.roi_count, 1);
    assert.equal(context.metadata.ocr_provided, true);
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
            observation: {
                defect_type: '백화',
                severity: 'Medium',
                summary: '리브 주변 백화가 관찰됨'
            },
            evidence: []
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
                    ocr_provided: false
                }
            }
        });

        assert.equal(receivedOptions?.question, '현상 설명: 리브 주변 백화');
        assert.equal(receivedOptions?.metadata?.context_provided, true);
        assert.equal(receivedOptions?.metadata?.roi_count, 1);
        assert.equal(receivedOptions?.persistMode, 'classifiable_only');
        assert.equal(receivedOptions?.metadata?.vision_quality_status, 'warn');
        assert.equal(receivedOptions?.metadata?.vision_quality_score, 88);
        assert.deepEqual(receivedOptions?.metadata?.vision_quality_issue_codes, ['resolution_low']);
        assert.equal(result.analysis.visionSummary?.primaryCandidate?.defectType, '백화');
        assert.equal(result.analysis.visionSummary?.decisionStatus, 'needs_review');
        assert.equal(result.comparison.visionCandidateCount, 1);
    } finally {
        CommonAgentApiService.diagnoseImage = originalDiagnose;
    }
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
        promoteToGraph: true,
        metadata: { content_sha256: 'hash-1' }
    });

    assert.equal(capturedUrl, 'http://agent.test/v1/datasets/images/image-1/review');
    assert.equal(capturedBody.decision, 'approve');
    assert.equal(capturedBody.defect_type, '밀핀 자국');
    assert.deepEqual(capturedBody.possible_causes, ['밀핀 돌출']);
    assert.deepEqual(capturedBody.recommended_checks, ['밀핀 높이 확인']);
    assert.equal(capturedBody.promote_to_graph, true);
    assert.equal(capturedBody.metadata.content_sha256, 'hash-1');
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
