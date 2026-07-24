const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const sendJson = (response, payload) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
};

test('knowledge-card figures sync to a non-persisting, source-linked candidate manifest', async t => {
    const imageBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
    );
    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        if (request.url === '/v1/knowledge-cards/review-sessions/session-test') {
            sendJson(response, {
                status: 'active',
                cards: [
                    {
                        card_version: 'v001',
                        identity: { knowledge_id: 'STD-SHORT', title: '#4 미성형 (Short Shot)' },
                        source_standard: {
                            source_document_id: 'doc-short',
                            document_version_id: 'v1',
                            document_title: 'short-shot-standard.pptx'
                        },
                        knowledge_intent: { problem_to_prevent: ['충전 말단 미충전'] },
                        figure_blocks: [{
                            figure_id: 'FIG-S005-001',
                            evidence_id: 'ev-short',
                            asset_uri: '/v1/assets/embedded-images/doc-short/short/file',
                            content_hash: 'source-short',
                            slide_number: 5,
                            caption: '미성형 대표 사진'
                        }],
                        validation: { status: 'review_needed' },
                        metadata: { slide_number: 5 }
                    },
                    {
                        card_version: 'v001',
                        identity: { knowledge_id: 'STD-FLASH', title: '#6 Boss Burr 발생' },
                        source_standard: {
                            source_document_id: 'doc-flash',
                            document_version_id: 'v1',
                            document_title: 'flash-standard.pptx'
                        },
                        knowledge_intent: { problem_to_prevent: ['보스 가장자리 버 발생'] },
                        figure_blocks: [{
                            figure_id: 'FIG-S007-001',
                            evidence_id: 'ev-flash',
                            asset_uri: '/v1/assets/embedded-images/doc-flash/flash/file',
                            content_hash: 'source-flash',
                            slide_number: 7,
                            caption: 'Boss Burr 대표 사진'
                        }],
                        validation: { status: 'review_needed' },
                        metadata: { slide_number: 7 }
                    },
                    {
                        identity: { knowledge_id: 'STD-OTHER', title: '온도 불균일' },
                        figure_blocks: [{
                            asset_uri: '/v1/assets/embedded-images/doc-other/other/file'
                        }]
                    }
                ]
            });
            return;
        }
        if (request.url === '/v1/assets/embedded-images/doc-short/short/file') {
            response.writeHead(200, { 'content-type': 'image/png' });
            response.end(imageBytes);
            return;
        }
        if (request.url === '/v1/assets/embedded-images/doc-flash/flash/file') {
            response.writeHead(200, { 'content-type': 'image/png' });
            response.end(Buffer.concat([imageBytes, Buffer.from('flash')]));
            return;
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    t.after(() => new Promise(resolve => server.close(resolve)));

    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-card-sync-'));
    t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }));
    const agentUrl = `http://127.0.0.1:${server.address().port}`;
    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sync-knowledge-card-vision-candidates.js');
    const childResult = await new Promise(resolve => {
        const child = spawn(process.execPath, [
            scriptPath,
            '--agent-url', agentUrl,
            '--session', 'session-test',
            '--output', outputRoot
        ], { windowsHide: true });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('close', code => resolve({ code, stdout, stderr }));
    });

    assert.equal(childResult.code, 0, childResult.stderr);
    const manifest = JSON.parse(
        fs.readFileSync(path.join(outputRoot, 'vision-candidates.json'), 'utf8')
    );
    assert.equal(manifest.policy.persistence, 'none');
    assert.equal(manifest.policy.autoApproval, false);
    assert.equal(manifest.policy.graphPromotion, false);
    assert.equal(manifest.summary.candidates, 2);
    assert.deepEqual(manifest.summary.classes.sort(), ['flash', 'short_shot']);
    assert.equal(manifest.candidates[0].sourceLineage.reviewSessionId, 'session-test');
    assert.ok(manifest.candidates.every(item =>
        fs.existsSync(path.join(outputRoot, item.relativePath))
    ));
    assert.equal(requests.filter(value => value.startsWith('POST ')).length, 0);
});
