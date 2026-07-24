const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const localDate = () => {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
};

(async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mold-master-report-defaults-'));
    const profilePath = path.join(tempRoot, 'profile');
    const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
    let app;
    try {
        const launchOptions = {
            args: executablePath
                ? [`--user-data-dir=${profilePath}`]
                : ['.', `--user-data-dir=${profilePath}`],
            cwd: process.cwd()
        };
        app = await electron.launch(executablePath
            ? { ...launchOptions, executablePath: path.resolve(executablePath) }
            : launchOptions);
        const page = await app.firstWindow();
        const consoleErrors = [];
        page.on('console', message => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });

        await page.locator('input[type="file"]').setInputFiles(
            path.join(process.cwd(), 'assets', 'icon.png')
        );
        await page.getByRole('button', { name: 'PPTX' }).waitFor({ timeout: 15000 });
        await page.getByRole('button', { name: 'PPTX' }).click();
        await page.getByText('리포트 마법사').waitFor({ timeout: 15000 });
        await page.getByText('금형개조용접시방서 (A-TECH) - 가로 A4').click();
        await page.getByRole('button', { name: '다음 단계' }).click();
        await page.getByText('Step 2: 기본 정보 입력').waitFor({ timeout: 15000 });

        const fieldValues = await page.locator(
            'div.grid.grid-cols-2 > div.flex.flex-col'
        ).evaluateAll(nodes => Object.fromEntries(nodes.map(node => {
            const label = node.querySelector('label')?.textContent?.trim() || '';
            const input = node.querySelector('input, textarea');
            return [label, {
                value: input?.value || '',
                type: input?.getAttribute('type') || input?.tagName.toLowerCase() || ''
            }];
        })));
        const expectedDate = localDate();
        const nonDateValues = Object.entries(fieldValues)
            .filter(([, item]) => item.type !== 'date')
            .map(([label, item]) => ({ label, value: item.value }))
            .filter(item => item.value !== '');
        const dateFields = Object.entries(fieldValues)
            .filter(([, item]) => item.type === 'date')
            .map(([label, item]) => ({ label, value: item.value }));
        const screenshot = path.join(
            process.cwd(),
            'artifacts',
            'electron-report-basic-info-empty.png'
        );
        await page.screenshot({ path: screenshot, fullPage: true });
        const result = {
            fieldCount: Object.keys(fieldValues).length,
            nonDateValues,
            dateFields,
            expectedDate,
            consoleErrors,
            screenshot
        };
        console.log(JSON.stringify(result, null, 2));
        if (
            result.fieldCount !== 12
            || result.nonDateValues.length !== 0
            || result.dateFields.length !== 1
            || result.dateFields[0].value !== expectedDate
            || result.consoleErrors.length > 0
        ) {
            process.exitCode = 1;
        }
    } finally {
        if (app) await app.close();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
