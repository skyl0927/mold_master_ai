const baseUrl = (process.env.COMMON_AGENT_URL || process.env.AGENT_SERVER_URL || 'http://127.0.0.1:8000')
    .replace(/\/+$/, '');

const requiredPaths = [
    '/v1/cases',
    '/v1/report-drafts',
    '/v1/report-drafts/assist',
    '/v1/report-drafts/{draft_id}/submit',
    '/v1/report-drafts/{draft_id}/review'
];

const postJson = async (path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`${path} failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
};

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const run = async () => {
    const openApiResponse = await fetch(`${baseUrl}/openapi.json`);
    assert(openApiResponse.ok, `OpenAPI check failed: ${openApiResponse.status}`);
    const openApi = await openApiResponse.json();
    const missingPaths = requiredPaths.filter(path => !openApi.paths?.[path]);
    assert(
        missingPaths.length === 0,
        `Common Agent document API migration is missing: ${missingPaths.join(', ')}`
    );

    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const caseId = `case-mold-master-smoke-${stamp}`;
    const workspace = {
        workspace_id: 'workspace-default',
        project_id: 'project-default',
        user_id: 'mold-master-live-smoke',
        role: 'admin',
        source_app: 'mold-master-ai'
    };

    await postJson('/v1/cases', {
        case_id: caseId,
        title: 'Rib whitening document-assist smoke',
        process_area: 'injection-molding',
        product_group: 'grille-mold',
        source_system: 'mold-master-ai',
        workspace,
        metadata: { verification_run: true }
    });

    const assisted = await postJson('/v1/report-drafts/assist', {
        case_id: caseId,
        draft_type: 'review_report',
        title: 'Rib whitening root-cause review',
        problem_description:
            '그릴 금형의 리브 주변에 백화가 발생했고 사출 조건은 정상 범위이며 ' +
            '취출 시 딱 소리와 함께 제품이 튕겨 나왔다.',
        top_k: 8,
        evidence_policy: 'graph_approved_only',
        allow_llm_supplement: true,
        workspace,
        metadata: { verification_run: true }
    });

    const expectedTrace = [
        'prepare_query',
        'retrieve_graph_evidence',
        'compose_sections',
        'validate_draft'
    ];
    assert(
        JSON.stringify(assisted.workflow_trace) === JSON.stringify(expectedTrace),
        `Unexpected LangGraph trace: ${JSON.stringify(assisted.workflow_trace)}`
    );
    assert(assisted.draft?.draft_id, 'Document assist did not create a draft.');
    assert(assisted.draft?.sections?.length > 0, 'Document assist returned no sections.');
    assert(
        assisted.retrieval_trace?.some(item =>
            item.startsWith('graph_query_terms=') && item.includes('리브') && item.includes('백화')
        ),
        'Graph query terms did not prioritize the manufacturing problem.'
    );

    const draftId = assisted.draft.draft_id;
    const submitted = await postJson(`/v1/report-drafts/${encodeURIComponent(draftId)}/submit`, {
        comment: 'Mold Master live integration smoke',
        workspace,
        metadata: { verification_run: true }
    });
    assert(submitted.status === 'review_pending', `Unexpected submit status: ${submitted.status}`);

    const reviewed = await postJson(`/v1/report-drafts/${encodeURIComponent(draftId)}/review`, {
        decision: 'needs_changes',
        comment: 'Verification-only draft; do not promote it to the production Graph.',
        workspace,
        metadata: { verification_run: true }
    });
    assert(reviewed.status === 'draft', `Unexpected review status: ${reviewed.status}`);

    console.log(JSON.stringify({
        baseUrl,
        caseId,
        draftId,
        graphGrounded: assisted.graph_grounded,
        llmSupplemented: assisted.llm_supplemented,
        evidenceCount: assisted.evidence_count,
        workflowTrace: assisted.workflow_trace,
        finalStatus: reviewed.status,
        graphPromotion: false
    }, null, 2));
};

run().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
