const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const artifactRoot = path.join(root, 'artifacts');
const approvalFlag = process.env.MOLD_MASTER_CONFIRMED_HITL_APPROVAL;
const agentUrl = String(
    process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');
const qaUrl = String(
    process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103'
).replace(/\/+$/, '');

if (approvalFlag !== 'CONFIRMED_6') {
    throw new Error(
        'Live HITL approval is disabled. Set MOLD_MASTER_CONFIRMED_HITL_APPROVAL=CONFIRMED_6 only after explicit human confirmation.'
    );
}

const latestPacketRoot = () => fs.readdirSync(artifactRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('vision-human-review-packet-'))
    .map(entry => path.join(artifactRoot, entry.name))
    .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
    .sort()
    .at(-1);

const fetchDataset = async () => {
    const response = await fetch(
        `${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`
    );
    if (!response.ok) {
        throw new Error(`Common Agent dataset query failed: ${response.status}`);
    }
    return await response.json();
};

const itemHash = item => String(item?.metadata?.content_sha256 || '')
    .trim()
    .toLowerCase();

const waitForApprovedHash = async (contentSha256, timeoutMs = 120000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const dataset = await fetchDataset();
        const match = (dataset.items || []).find(
            item => itemHash(item) === contentSha256
        );
        if (match?.review_status === 'approved') return match;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`Timed out waiting for approved hash: ${contentSha256}`);
};

const packetRoot = latestPacketRoot();
if (!packetRoot) throw new Error('No prepared Vision human-review packet was found.');

const manifest = JSON.parse(
    fs.readFileSync(path.join(packetRoot, 'vision-candidates.json'), 'utf8')
);
const targets = (manifest.candidates || [])
    .filter(candidate =>
        candidate.reviewPriority === 1
        && candidate.reviewBucket === 'agreement_high_confidence'
    )
    .map(candidate => ({
        fileName: path.basename(candidate.relativePath),
        relativePath: candidate.relativePath,
        defectType: candidate.defectType,
        defectClass: candidate.defectClass,
        contentSha256: String(candidate.contentSha256 || '').toLowerCase()
    }));

if (
    targets.length !== 6
    || targets.some(target => !/^[a-f0-9]{64}$/.test(target.contentSha256))
) {
    throw new Error(`Expected exactly six hash-verified priority-one targets, found ${targets.length}.`);
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const profilePath = path.join(artifactRoot, `live-hitl-approval-profile-${runId}`);
const auditPath = path.join(artifactRoot, `live-hitl-approval-${runId}.json`);
const audit = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    authorization: 'explicit_human_confirmation',
    packetRoot,
    agentUrl,
    qaUrl,
    targets,
    results: [],
    requests: [],
    completed: false
};

const writeAudit = () => {
    fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
};

(async () => {
    writeAudit();
    const beforeDataset = await fetchDataset();
    const existingTargetHashes = new Set(
        (beforeDataset.items || []).map(itemHash).filter(Boolean)
    );
    const unexpectedExisting = targets.filter(target =>
        existingTargetHashes.has(target.contentSha256)
    );
    if (unexpectedExisting.length > 0) {
        throw new Error(
            `Target hashes already exist in Common Agent: ${unexpectedExisting.map(item => item.fileName).join(', ')}`
        );
    }

    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
    const launchOptions = {
        args: executablePath
            ? [`--user-data-dir=${profilePath}`]
            : ['.', `--user-data-dir=${profilePath}`],
        cwd: root,
        env: {
            ...process.env,
            MOLD_MASTER_VISION_REVIEW_PACKET_ROOT: packetRoot
        }
    };
    let app;
    try {
        app = await electron.launch(executablePath
            ? { ...launchOptions, executablePath: path.resolve(executablePath) }
            : launchOptions);
        const page = await app.firstWindow();
        const consoleErrors = [];
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('request', request => {
            const url = request.url();
            if (
                url.startsWith(agentUrl)
                && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
            ) {
                audit.requests.push({ method: request.method(), url });
                writeAudit();
            }
        });

        await page.evaluate(async config => {
            await window.electronAPI.setApiConfig(config);
        }, {
            provider: 'openai',
            aiOrchestrationMode: 'common_agent_primary',
            agentServerUrl: agentUrl,
            visionQaServerUrl: qaUrl,
            shortcut: 'CommandOrControl+Shift+C'
        });

        await page.getByText('DATABASE TREE').click();
        await page.getByRole('button', { name: '준비된 검토 패킷' }).click();
        await page.getByText(/로컬 후보 23건/).waitFor({ timeout: 30000 });

        for (const target of targets) {
            audit.currentTarget = target.fileName;
            writeAudit();
            const card = page.locator('article').filter({ hasText: target.fileName });
            await card.waitFor({ timeout: 30000 });
            const labelInput = card.locator('input[list="required-vision-defect-labels"]');
            await labelInput.waitFor({ timeout: 30000 });
            const uiLabel = String(await labelInput.inputValue()).trim();
            if (uiLabel !== target.defectType) {
                throw new Error(
                    `Label mismatch for ${target.fileName}: UI=${uiLabel}, expected=${target.defectType}`
                );
            }

            const manufacturingConfirmation = card.locator('label').filter({
                hasText: '화면 자료가 아니라 실제 제조 제품·금형 사진임을 확인했습니다.'
            }).getByRole('checkbox');
            if (await manufacturingConfirmation.count()) {
                await manufacturingConfirmation.check();
            }

            const reconciliation = card.locator(
                'input[aria-label$="label reconciliation"]'
            );
            if (await reconciliation.count()) await reconciliation.check();

            await card.getByRole('checkbox', {
                name: /이미지를 직접 확인했고 승인/
            }).check();
            const approveButton = card.getByRole('button', {
                name: /^(등록 \+ 승인 \+ Graph|승인 \+ Graph)$/
            });
            await approveButton.click();
            const approvedItem = await waitForApprovedHash(target.contentSha256);
            audit.results.push({
                ...target,
                imageId: approvedItem.image_id,
                reviewStatus: approvedItem.review_status,
                approvedAt: new Date().toISOString()
            });
            delete audit.currentTarget;
            writeAudit();
        }

        audit.consoleErrors = consoleErrors;
        if (consoleErrors.length > 0) {
            throw new Error(`Renderer console errors: ${consoleErrors.join(' | ')}`);
        }
        audit.completed = true;
        audit.completedAt = new Date().toISOString();
        writeAudit();
        console.log(JSON.stringify({
            auditPath,
            approved: audit.results.length,
            results: audit.results,
            writeRequests: audit.requests.length,
            consoleErrors
        }, null, 2));
    } finally {
        if (app) await app.close();
    }
})().catch(error => {
    audit.error = error instanceof Error ? error.message : String(error);
    audit.failedAt = new Date().toISOString();
    writeAudit();
    console.error(error);
    process.exitCode = 1;
});
