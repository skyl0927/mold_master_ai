const { _electron: electron } = require('playwright');
const crypto = require('node:crypto');

const hashDataUrl = dataUrl =>
    crypto.createHash('sha256').update(String(dataUrl || '')).digest('hex');

const waitForWindow = async (electronApp, fileName, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const page = electronApp.windows().find(candidate =>
            new URL(candidate.url()).pathname.replace(/\\/g, '/').endsWith(`/${fileName}`)
        );
        if (page) return page;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`${fileName} window did not open`);
};

(async () => {
    let electronApp;
    try {
        const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
        const launchOptions = {
            args: executablePath ? [] : ['.'],
            cwd: process.cwd()
        };
        electronApp = await electron.launch(executablePath
            ? { ...launchOptions, executablePath }
            : launchOptions);
        const mainPage = await electronApp.firstWindow();
        await electronApp.evaluate(async ({ BrowserWindow, screen }) => {
            const display = screen.getPrimaryDisplay();
            const width = Math.min(640, Math.max(320, Math.floor(display.workAreaSize.width / 2)));
            const height = Math.min(480, Math.max(240, Math.floor(display.workAreaSize.height / 2)));
            global.__captureFreshFrameMarker = new BrowserWindow({
                width,
                height,
                x: display.workArea.x + 40,
                y: display.workArea.y + 80,
                frame: false,
                alwaysOnTop: true,
                show: true
            });
            await global.__captureFreshFrameMarker.loadURL(
                'data:text/html;charset=utf-8,'
                + encodeURIComponent(
                    '<!doctype html><title>capture-fresh-frame-marker</title>'
                    + '<style>html,body{width:100%;height:100%;margin:0;background:#e11d48}</style>'
                    + '<body></body>'
                )
            );
            global.__captureFreshFrameMarker.show();
            global.__captureFreshFrameMarker.moveTop();
        });

        const setMarkerColor = async color => {
            await electronApp.evaluate(async ({ BrowserWindow }, nextColor) => {
                const marker = BrowserWindow.getAllWindows().find(
                    window => window.getTitle() === 'capture-fresh-frame-marker'
                );
                if (!marker) throw new Error('capture marker window is missing');
                await marker.webContents.executeJavaScript(
                    `document.body.style.background=${JSON.stringify(nextColor)}`
                );
                marker.show();
                marker.moveTop();
            }, color);
            await mainPage.waitForTimeout(250);
        };

        const captureFrozenDesktop = async () => {
            await mainPage.evaluate(async () => {
                await window.electronAPI.startCaptureSession();
            });
            const toolbar = await waitForWindow(electronApp, 'toolbar.html');
            await toolbar.evaluate(async () => {
                await window.electronAPI.initiateRegionCapture();
            });
            const overlay = await waitForWindow(electronApp, 'overlay.html');
            const frame = await overlay.evaluate(async () =>
                await window.electronAPI.getCaptureData()
            );
            await mainPage.evaluate(async () => {
                await window.electronAPI.cancelCapture();
            });
            await mainPage.waitForTimeout(400);
            if (!frame?.dataUrl) throw new Error('capture overlay returned no desktop frame');
            return {
                hash: hashDataUrl(frame.dataUrl),
                sourceId: frame.sourceId,
                bytes: frame.dataUrl.length
            };
        };

        await setMarkerColor('#e11d48');
        const first = await captureFrozenDesktop();
        await setMarkerColor('#2563eb');
        const second = await captureFrozenDesktop();

        const result = {
            first,
            second,
            frameChanged: first.hash !== second.hash,
            sameDisplaySource: first.sourceId === second.sourceId
        };
        console.log(JSON.stringify(result, null, 2));
        if (!result.frameChanged || first.bytes <= 1000 || second.bytes <= 1000) {
            process.exitCode = 1;
        }
    } finally {
        if (electronApp) await electronApp.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
