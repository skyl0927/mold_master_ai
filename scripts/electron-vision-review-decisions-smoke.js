const { _electron: electron } = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const sendJson = (response, status, payload) => {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*'
    });
    response.end(JSON.stringify(payload));
};

(async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-review-decisions-'));
    const packetRoot = path.join(tempRoot, 'packet');
    const profilePath = path.join(tempRoot, 'profile');
    fs.mkdirSync(packetRoot, { recursive: true });
    const fileName = 'normal-or-unclear.png';
    const imageBytes = fs.readFileSync(path.join(process.cwd(), 'assets', 'icon.png'));
    const contentSha256 = crypto.createHash('sha256').update(imageBytes).digest('hex');
    fs.writeFileSync(path.join(packetRoot, fileName), imageBytes);
    fs.writeFileSync(path.join(packetRoot, 'vision-candidates.json'), JSON.stringify({
        candidates: [{
            relativePath: fileName,
            defectType: '백화',
            contentSha256,
            reviewPriority: 5,
            reviewBucket: 'unclassifiable',
            reviewReasons: ['Vision could not verify a manufacturing defect.']
        }]
    }));

    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push({ method: request.method, url: request.url });
        if (request.method === 'GET' && request.url === '/healthz') {
            sendJson(response, 200, { status: 'ok' });
            return;
        }
        if (request.method === 'GET' && request.url?.startsWith('/v1/datasets/images')) {
            sendJson(response, 200, { total: 0, items: [] });
            return;
        }
        sendJson(response, 404, { detail: 'Not Found' });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;

    const launchApp = async () => {
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
        const app = await electron.launch(executablePath
            ? { ...launchOptions, executablePath: path.resolve(executablePath) }
            : launchOptions);
        const page = await app.firstWindow();
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
        return { app, page };
    };

    let firstApp;
    let secondApp;
    try {
        const firstRun = await launchApp();
        firstApp = firstRun.app;
        const firstCard = firstRun.page.locator('article').filter({ hasText: fileName });
        await firstCard.waitFor({ timeout: 15000 });
        await firstCard.getByLabel(`${fileName} HITL 판정 사유`).selectOption(
            '정상 형상/결함 미확인'
        );
        await firstCard.getByRole('button', { name: '후보 제외' }).click();
        await firstRun.page.getByText('제외 1').waitFor({ timeout: 15000 });
        await firstRun.page.getByRole('button', { name: '제외 포함 (1)' }).click();
        await firstRun.page.getByText('로컬 제외').waitFor({ timeout: 15000 });
        await firstApp.close();
        firstApp = null;

        const ledgerPath = path.join(profilePath, 'vision-review-decisions.json');
        const persistedAfterFirstRun = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
        const secondRun = await launchApp();
        secondApp = secondRun.app;
        await secondRun.page.getByText('제외 1').waitFor({ timeout: 15000 });
        const hiddenByDefault = await secondRun.page.locator('article')
            .filter({ hasText: fileName })
            .count() === 0;
        await secondRun.page.getByRole('button', { name: '제외 포함 (1)' }).click();
        const restoredCard = secondRun.page.locator('article').filter({ hasText: fileName });
        await restoredCard.getByText('로컬 제외').waitFor({ timeout: 15000 });
        await restoredCard.getByRole('button', { name: '판정 해제' }).click();
        await secondRun.page.getByText('제외 0', { exact: true }).waitFor({ timeout: 15000 });
        const ledgerAfterClear = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

        const writeRequests = requests.filter(item => item.method !== 'GET');
        const result = {
            persistedDecision: persistedAfterFirstRun.decisions?.[0]?.decision,
            persistedReason: persistedAfterFirstRun.decisions?.[0]?.reason,
            hiddenByDefault,
            restoredAfterRestart: await restoredCard.isVisible(),
            decisionsAfterClear: ledgerAfterClear.decisions?.length,
            writeRequests
        };
        console.log(JSON.stringify(result, null, 2));
        if (
            result.persistedDecision !== 'excluded'
            || result.persistedReason !== '정상 형상/결함 미확인'
            || !result.hiddenByDefault
            || !result.restoredAfterRestart
            || result.decisionsAfterClear !== 0
            || result.writeRequests.length > 0
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (firstApp) await firstApp.close();
        if (secondApp) await secondApp.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
