const { _electron: electron } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const sendJson = (response, status, payload) => {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS'
    });
    response.end(JSON.stringify(payload));
};

const fixturePng = fs.readFileSync(path.join(process.cwd(), 'assets', 'icon.png'));

(async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-approval-smoke-'));
    const packetRoot = path.join(tempRoot, 'packet');
    const profilePath = path.join(tempRoot, 'profile');
    fs.mkdirSync(packetRoot, { recursive: true });
    const fileName = 'sample-whitening.png';
    const imagePath = path.join(packetRoot, fileName);
    fs.writeFileSync(imagePath, fixturePng);
    const contentSha256 = crypto.createHash('sha256').update(fixturePng).digest('hex');
    fs.writeFileSync(path.join(packetRoot, 'vision-candidates.json'), JSON.stringify({
        candidates: [{
            relativePath: fileName,
            defectType: '백화',
            contentSha256,
            reviewPriority: 1,
            reviewBucket: 'agreement_high_confidence',
            reviewReasons: ['Source and Vision agree.']
        }]
    }));

    const requests = [];
    let storedItem = null;
    let reviewBody = null;
    const server = http.createServer((request, response) => {
        if (request.method === 'OPTIONS') {
            response.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-headers': 'content-type',
                'access-control-allow-methods': 'GET,POST,OPTIONS'
            });
            response.end();
            return;
        }
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            const rawBody = Buffer.concat(chunks);
            requests.push({ method: request.method, url: request.url });
            if (request.method === 'GET' && request.url === '/healthz') {
                sendJson(response, 200, { status: 'ok' });
                return;
            }
            if (request.method === 'GET' && request.url?.startsWith('/v1/datasets/images?')) {
                sendJson(response, 200, {
                    total: storedItem ? 1 : 0,
                    items: storedItem ? [storedItem] : []
                });
                return;
            }
            if (request.method === 'POST' && request.url === '/v1/vision/diagnose') {
                storedItem = {
                    image_id: 'image-hitl-1',
                    file_name: fileName,
                    mime_type: 'image/png',
                    defect_type: '백화',
                    review_status: 'candidate',
                    question: '리브 주변 백화',
                    observation: {
                        summary: '리브 주변 응력 백화',
                        visible_features: ['흰색 변색'],
                        possible_causes: ['취출 저항'],
                        recommended_checks: ['구배 확인']
                    },
                    labels: ['백화'],
                    process_area: 'injection-molding',
                    metadata: {
                        persisted_to_dataset: true,
                        content_sha256: contentSha256
                    }
                };
                sendJson(response, 200, {
                    image_id: storedItem.image_id,
                    review_status: 'candidate',
                    metadata: { persisted_to_dataset: true }
                });
                return;
            }
            if (
                request.method === 'POST'
                && request.url === '/v1/datasets/images/image-hitl-1/review'
            ) {
                reviewBody = JSON.parse(rawBody.toString('utf8'));
                storedItem = {
                    ...storedItem,
                    defect_type: reviewBody.defect_type,
                    review_status: 'approved',
                    metadata: {
                        ...storedItem.metadata,
                        ...reviewBody.metadata
                    }
                };
                sendJson(response, 200, {
                    status: 'reviewed',
                    next_action: 'promoted_to_graph',
                    item: {
                        image_id: storedItem.image_id,
                        defect_type: storedItem.defect_type,
                        review_status: storedItem.review_status,
                        metadata: storedItem.metadata
                    },
                    promotion: {
                        image_id: storedItem.image_id,
                        document_id: 'vision-image-hitl-1',
                        review_status: 'approved',
                        entities: 2,
                        relations: 1
                    }
                });
                return;
            }
            if (request.method === 'GET' && request.url === '/v1/datasets/images/image-hitl-1/file') {
                response.writeHead(200, {
                    'content-type': 'image/png',
                    'access-control-allow-origin': '*'
                });
                response.end(fixturePng);
                return;
            }
            sendJson(response, 404, { detail: 'Not Found' });
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
    let app;
    try {
        const launchOptions = {
            args: executablePath
                ? [`--user-data-dir=${profilePath}`]
                : ['.', `--user-data-dir=${profilePath}`],
            cwd: process.cwd(),
            env: {
                ...process.env,
                MOLD_MASTER_VISION_REVIEW_PACKET_ROOT: packetRoot
            }
        };
        app = await electron.launch(executablePath
            ? { ...launchOptions, executablePath: path.resolve(executablePath) }
            : launchOptions);
        const page = await app.firstWindow();
        const consoleErrors = [];
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        await page.evaluate(async config => {
            await window.electronAPI.setApiConfig(config);
        }, {
            provider: 'openai',
            aiOrchestrationMode: 'common_agent_primary',
            agentServerUrl: baseUrl,
            visionQaServerUrl: baseUrl,
            shortcut: 'CommandOrControl+Shift+C'
        });

        await page.getByText('DATABASE TREE').click();
        await page.getByRole('button', { name: '준비된 검토 패킷' }).click();
        const card = page.locator('article').filter({ hasText: fileName });
        await card.waitFor({ timeout: 15000 });
        await card.getByRole('checkbox', {
            name: /이미지를 직접 확인했고/
        }).check();
        await card.getByRole('button', {
            name: '등록 + 승인 + Graph'
        }).click();
        await page.getByText(/Graph 승격 완료/).waitFor({ timeout: 30000 });

        const result = {
            diagnoseWrites: requests.filter(item =>
                item.method === 'POST' && item.url === '/v1/vision/diagnose'
            ).length,
            reviewWrites: requests.filter(item =>
                item.method === 'POST' && item.url?.endsWith('/review')
            ).length,
            decision: reviewBody?.decision,
            defectType: reviewBody?.defect_type,
            promoteToGraph: reviewBody?.promote_to_graph,
            humanLabelConfirmed: reviewBody?.metadata?.human_label_confirmed,
            finalReviewStatus: storedItem?.review_status,
            consoleErrors
        };
        console.log(JSON.stringify(result, null, 2));
        if (
            result.diagnoseWrites !== 1
            || result.reviewWrites !== 1
            || result.decision !== 'approve'
            || result.defectType !== '백화'
            || result.promoteToGraph !== true
            || result.humanLabelConfirmed !== true
            || result.finalReviewStatus !== 'approved'
            || result.consoleErrors.length > 0
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (app) await app.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
