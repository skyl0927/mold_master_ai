const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const artifactRoot = path.join(process.cwd(), 'artifacts');
const packetRoot = fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('vision-human-review-packet-'))
    .map(entry => path.join(artifactRoot, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
    .sort()
    .at(-1);

if (!packetRoot) {
    throw new Error('No generated Vision human-review packet was found.');
}

const manifest = JSON.parse(
    fs.readFileSync(path.join(packetRoot, 'vision-candidates.json'), 'utf8')
);
const webPreviewCandidate = manifest.candidates.find(
    candidate => candidate.sourceLineage?.packetSourceKind === 'web-case'
);
if (!webPreviewCandidate) {
    throw new Error('The review packet does not contain a Web Case candidate.');
}
const webPreviewFileName = path.basename(webPreviewCandidate.relativePath);
const webPreviewLicense = webPreviewCandidate.sourceLineage?.license;
const webPreviewCaseId = webPreviewCandidate.sourceLineage?.webCaseId;
if (!webPreviewLicense || !webPreviewCaseId) {
    throw new Error('Web Case source lineage is missing a license or case ID.');
}

const sendJson = (response, status, payload) => {
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*'
    });
    response.end(JSON.stringify(payload));
};

(async () => {
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
    const profilePath = path.join(artifactRoot, `vision-review-packet-profile-${Date.now()}`);
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
                MOLD_MASTER_TEST_LOCAL_VISION_ROOT: packetRoot,
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

        const scan = await page.evaluate(async () =>
            await window.electronAPI.scanPreparedVisionReviewPacket([])
        );
        await page.getByText('DATABASE TREE').click();
        const preparedButton = page.getByRole('button', { name: '준비된 검토 패킷' });
        await preparedButton.waitFor({ timeout: 15000 });
        await preparedButton.click();
        await page.getByText(
            new RegExp(`로컬 후보 ${manifest.summary.candidates}건`)
        ).waitFor({ timeout: 30000 });
        const priorityFilter = page.getByRole('button', {
            name: `1순위 사람 검토 (${manifest.auditSummary.reviewBucketCounts.agreement_high_confidence})`
        });
        await priorityFilter.waitFor({ timeout: 15000 });
        const priorityBadges = page.getByText(/1순위 · 우선 검토 · 원문\/AI 일치/);
        await priorityBadges.first().waitFor({ timeout: 15000 });
        const priorityBadgeCount = await priorityBadges.count();
        const previewButton = page.getByRole('button', { name: /^확대 보기 / }).first();
        await previewButton.waitFor({ timeout: 15000 });
        await previewButton.click();
        const previewDialog = page.getByRole('dialog', { name: '후보 이미지 확대 검토' });
        await previewDialog.waitFor({ timeout: 15000 });
        const previewImage = previewDialog.locator('img');
        await previewImage.waitFor({ timeout: 15000 });
        const previewImageVisible = await previewImage.isVisible();
        const previewNaturalWidth = await previewImage.evaluate(image => image.naturalWidth);
        const previewComparisonVisible = await previewDialog.getByText('원문/AI 비교').isVisible();
        const previewContextVisible = await previewDialog.getByText('현장·원문 문맥').isVisible();
        const reviewProgress = previewDialog.getByText(
            `검토 후보 1 / ${manifest.auditSummary.reviewBucketCounts.agreement_high_confidence}`
        );
        await reviewProgress.waitFor({ timeout: 15000 });
        const reviewProgressVisible = await reviewProgress.isVisible();
        const previewApproval = previewDialog.getByRole('checkbox', {
            name: /원본을 확인했고 현재 결함 라벨로 승인 및 Graph 승격에 동의/
        });
        await previewApproval.check();
        const previewApprovalChecked = await previewApproval.isChecked();
        await previewDialog.getByRole('button', { name: '다음 검토 후보' }).click();
        const secondReviewProgress = previewDialog.getByText(
            `검토 후보 2 / ${manifest.auditSummary.reviewBucketCounts.agreement_high_confidence}`
        );
        await secondReviewProgress.waitFor({ timeout: 15000 });
        await previewDialog.getByRole('button', { name: '이전 검토 후보' }).click();
        await reviewProgress.waitFor({ timeout: 15000 });
        const previewApprovalPersisted = await previewApproval.isChecked();
        const previewScreenshotPath = path.join(
            artifactRoot,
            'electron-vision-human-review-preview.png'
        );
        await page.screenshot({ path: previewScreenshotPath, fullPage: true });
        await page.keyboard.press('Escape');
        await previewDialog.waitFor({ state: 'hidden', timeout: 15000 });
        const previewClosedByEscape = !(await previewDialog.isVisible());
        const cardApprovalPersisted = await page.getByRole('checkbox', {
            name: /이미지를 직접 확인했고 승인/
        }).first().isChecked();
        await previewButton.click();
        await previewDialog.waitFor({ timeout: 15000 });
        await previewDialog.getByRole('button', { name: '확대 보기 닫기' }).click();
        await previewDialog.waitFor({ state: 'hidden', timeout: 15000 });
        const previewClosedByButton = !(await previewDialog.isVisible());
        const webSourceBadges = page.getByText('Web Case 출처', { exact: true });
        const webSourceBadgeCount = await webSourceBadges.count();
        const webPreviewButton = page.getByRole('button', {
            name: `확대 보기 ${webPreviewFileName}`
        });
        await webPreviewButton.waitFor({ timeout: 15000 });
        await webPreviewButton.click();
        await previewDialog.waitFor({ timeout: 15000 });
        const webSourceSectionVisible = await previewDialog
            .getByText('Web Case 출처·라이선스', { exact: true })
            .isVisible();
        const webLicenseVisible = await previewDialog
            .getByText(webPreviewLicense, { exact: true })
            .isVisible();
        const webSourceLinkVisible = await previewDialog
            .getByRole('link', { name: '원문 출처 열기' })
            .isVisible();
        const webCaseIdVisible = await previewDialog
            .getByText(webPreviewCaseId, { exact: true })
            .isVisible();
        await previewDialog.getByRole('button', { name: '확대 보기 닫기' }).click();
        await previewDialog.waitFor({ state: 'hidden', timeout: 15000 });
        const coverageFilter = page.getByRole('button', {
            name: `미충족 결함군만 (${manifest.summary.candidates})`
        });
        await coverageFilter.waitFor({ timeout: 15000 });
        const coverageNeedBadgeCount = await page.getByText(/추가 \d+건 필요/).count();
        const screenshotPath = path.join(
            artifactRoot,
            'electron-vision-human-review-packet.png'
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const classCounts = scan.candidates.reduce((counts, candidate) => {
            const manifestCandidate = manifest.candidates.find(
                item => item.contentSha256 === candidate.contentSha256
            );
            const defectClass = manifestCandidate?.defectClass || 'missing';
            counts[defectClass] = (counts[defectClass] || 0) + 1;
            return counts;
        }, {});
        const writeRequests = requests.filter(item => item.method !== 'GET');
        const pointerPath = path.join(profilePath, 'vision-review-packet.json');
        const result = {
            packetRoot,
            candidates: scan.summary.uniqueCandidates,
            manifestMatched: scan.summary.manifestMatched,
            hashMismatches: scan.summary.manifestHashMismatches,
            duplicatesSkipped: scan.summary.duplicatesSkipped,
            reconciliationRequired: scan.candidates.filter(
                item => item.requiresLabelReconciliation
            ).length,
            firstReviewBucket: scan.candidates[0]?.reviewBucket,
            priorityOneCount: scan.candidates.filter(item => item.reviewPriority === 1).length,
            preparedButtonVisible: await preparedButton.isVisible(),
            priorityFilterVisible: await priorityFilter.isVisible(),
            priorityFilterPressed: await priorityFilter.getAttribute('aria-pressed'),
            priorityBadgeCount,
            previewButtonVisible: await previewButton.isVisible(),
            previewImageVisible,
            previewNaturalWidth,
            previewComparisonVisible,
            previewContextVisible,
            reviewProgressVisible,
            previewApprovalChecked,
            previewApprovalPersisted,
            cardApprovalPersisted,
            previewClosedByEscape,
            previewClosedByButton,
            webSourceBadgeCount,
            webSourceSectionVisible,
            webLicenseVisible,
            webSourceLinkVisible,
            webCaseIdVisible,
            coverageFilterVisible: await coverageFilter.isVisible(),
            coverageNeedBadgeCount,
            persistedPacketPointer: fs.existsSync(pointerPath),
            classCounts,
            writeRequests,
            consoleErrors,
            screenshot: screenshotPath,
            previewScreenshot: previewScreenshotPath
        };
        console.log(JSON.stringify(result, null, 2));

        const expectedCounts = manifest.summary.classCounts;
        const classCountsMatch = Object.entries(expectedCounts).every(
            ([defectClass, count]) => result.classCounts[defectClass] === count
        ) && Object.keys(result.classCounts).length === Object.keys(expectedCounts).length;
        if (
            result.candidates !== manifest.summary.candidates
            || result.manifestMatched !== manifest.summary.candidates
            || result.hashMismatches !== 0
            || !classCountsMatch
            || result.reconciliationRequired !== manifest.summary.candidates
            || result.firstReviewBucket !== 'agreement_high_confidence'
            || result.priorityOneCount !== manifest.auditSummary.reviewBucketCounts.agreement_high_confidence
            || !result.preparedButtonVisible
            || !result.priorityFilterVisible
            || result.priorityFilterPressed !== 'true'
            || result.priorityBadgeCount !== manifest.auditSummary.reviewBucketCounts.agreement_high_confidence
            || !result.previewButtonVisible
            || !result.previewImageVisible
            || result.previewNaturalWidth <= 320
            || !result.previewComparisonVisible
            || !result.previewContextVisible
            || !result.reviewProgressVisible
            || !result.previewApprovalChecked
            || !result.previewApprovalPersisted
            || !result.cardApprovalPersisted
            || !result.previewClosedByEscape
            || !result.previewClosedByButton
            || result.webSourceBadgeCount !== manifest.summary.sourceCounts['web-case']
            || !result.webSourceSectionVisible
            || !result.webLicenseVisible
            || !result.webSourceLinkVisible
            || !result.webCaseIdVisible
            || !result.coverageFilterVisible
            || result.coverageNeedBadgeCount !== manifest.auditSummary.reviewBucketCounts.agreement_high_confidence
            || !result.persistedPacketPointer
            || writeRequests.length > 0
            || consoleErrors.length > 0
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (app) await app.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
