const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
    const root = process.cwd();
    const artifactRoot = path.join(root, 'artifacts');
    const packetRoot = fs.readdirSync(artifactRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('vision-human-review-packet-'))
        .map(entry => path.join(artifactRoot, entry.name))
        .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')))
        .sort()
        .at(-1);
    if (!packetRoot) throw new Error('No generated Vision human-review packet was found.');
    const manifest = JSON.parse(
        fs.readFileSync(path.join(packetRoot, 'vision-candidates.json'), 'utf8')
    );
    const priorityOneTotal = manifest.candidates.filter(
        candidate => candidate.reviewPriority === 1
    ).length;
    const newWebPriority = manifest.candidates.filter(candidate =>
        candidate.reviewPriority === 1
        && candidate.sourceLineage?.packetSourceKind === 'web-case'
    ).length;
    const expectedResolved = priorityOneTotal - newWebPriority;
    const profilePath = path.join(
        root,
        'artifacts',
        `vision-resolved-review-profile-${Date.now()}`
    );
    const agentUrl = process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000';
    const qaUrl = process.env.COMMON_AGENT_QA_URL || 'http://127.0.0.1:8103';
    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
    const launchOptions = {
        args: executablePath
            ? [`--user-data-dir=${profilePath}`]
            : ['.', `--user-data-dir=${profilePath}`],
        cwd: root
    };
    let app;
    try {
        app = await electron.launch(executablePath
            ? { ...launchOptions, executablePath: path.resolve(executablePath) }
            : launchOptions);
        const page = await app.firstWindow();
        const consoleErrors = [];
        const writeRequests = [];
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('request', request => {
            if (
                request.url().startsWith(agentUrl)
                && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
            ) {
                writeRequests.push({
                    method: request.method(),
                    url: request.url()
                });
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
        const packetButton = page.getByRole('button', { name: '준비된 검토 패킷' });
        await packetButton.waitFor({ timeout: 120000 });
        await packetButton.click();
        const resolvedBadge = page.getByText(`1순위 해소 완료 ${expectedResolved}`);
        await resolvedBadge.waitFor({ timeout: 120000 });
        const unresolvedPriorityFilter = page.getByRole('button', {
            name: `1순위 사람 검토 (${newWebPriority})`
        });
        await unresolvedPriorityFilter.waitFor({ timeout: 30000 });
        const screenshot = path.join(
            root,
            'artifacts',
            'electron-vision-priority-resolved.png'
        );
        await page.screenshot({ path: screenshot, fullPage: true });
        const result = {
            resolvedBadgeVisible: await resolvedBadge.isVisible(),
            expectedResolved,
            expectedUnresolved: newWebPriority,
            unresolvedPriorityFilterVisible: await unresolvedPriorityFilter.isVisible(),
            unresolvedPriorityFilterPressed:
                await unresolvedPriorityFilter.getAttribute('aria-pressed'),
            webSourceBadgeCount:
                await page.getByText('Web Case 출처', { exact: true }).count(),
            writeRequests,
            consoleErrors,
            screenshot
        };
        console.log(JSON.stringify(result, null, 2));
        if (
            !result.resolvedBadgeVisible
            || !result.unresolvedPriorityFilterVisible
            || result.unresolvedPriorityFilterPressed !== 'true'
            || result.webSourceBadgeCount !== newWebPriority
            || result.writeRequests.length > 0
            || result.consoleErrors.length > 0
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (app) await app.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
