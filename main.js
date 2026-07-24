
const { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog, globalShortcut, safeStorage, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { Menu } = require('electron');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { mapSelectionToImage } = require('./captureGeometry');
const { createCaptureFrameCache } = require('./captureFrameCache');
const db = require('./database.js');
const layoutManager = require('./layouts.js');
const JSZip = require('jszip');
const { spawn } = require('child_process');
const { isClassifiableDefectLabel } = require('./shared/defect-taxonomy');
const { scanLocalVisionCandidates } = require('./localVisionCandidate');
const { buildMigrationGateStatus } = require('./migrationGateStatus');
const { retryAsync } = require('./retryAsync');
const {
    createVisionReviewDecisionLedger
} = require('./visionReviewDecisionLedger');
const {
    createWebKnowledgeCardReviewLedger
} = require('./webKnowledgeCardReviewLedger');
const {
    findLatestWebKnowledgeCollection,
    loadWebKnowledgeCollection,
    resolveCollectionFile
} = require('./webKnowledgeReviewStore');

let mainWindow;
let toolbarWindow;
let overlayWindows = [];
const captureFrameCache = createCaptureFrameCache();
let captureProcessGeneration = 0;
let apiConfig = null;
const apiConfigPath = path.join(app.getPath('userData'), 'apiConfig.json');
const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+C';
const CAPTURE_DEBUG_LOG = path.join(app.getPath('temp'), 'mold-master-capture-debug.jsonl');
const VISION_BENCHMARK_ROOT = path.join(app.getPath('userData'), 'vision-benchmark');
const VISION_REVIEW_PACKET_POINTER = path.join(
    app.getPath('userData'),
    'vision-review-packet.json'
);
const VISION_REVIEW_DECISIONS_PATH = path.join(
    app.getPath('userData'),
    'vision-review-decisions.json'
);
const visionReviewDecisionLedger = createVisionReviewDecisionLedger({
    filePath: VISION_REVIEW_DECISIONS_PATH
});
const WEB_KNOWLEDGE_REVIEW_DECISIONS_PATH = path.join(
    app.getPath('userData'),
    'web-knowledge-review-decisions.json'
);
const WEB_KNOWLEDGE_INGESTIONS_PATH = path.join(
    app.getPath('userData'),
    'web-knowledge-central-ingestions.json'
);
const webKnowledgeReviewLedger = createWebKnowledgeCardReviewLedger({
    filePath: WEB_KNOWLEDGE_REVIEW_DECISIONS_PATH
});
const MAX_VISION_SUGGESTION_IMAGE_BYTES = 20 * 1024 * 1024;
let localVisionCandidateFiles = new Map();

const atomicWriteJson = (filePath, value) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
};

const readJsonOr = (filePath, fallback) => {
    try {
        return fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
            : fallback;
    } catch {
        return fallback;
    }
};

const loadCurrentWebKnowledgeCollection = () => {
    const rootPath = findLatestWebKnowledgeCollection({
        configuredRoot: process.env.MOLD_MASTER_WEB_CASE_ROOT,
        artifactsRoot: path.join(__dirname, 'artifacts')
    });
    return loadWebKnowledgeCollection(rootPath);
};

const webKnowledgeIngestionKey = (caseId, sourceContentSha256) =>
    `${String(caseId || '').trim()}:${String(sourceContentSha256 || '').trim().toLowerCase()}`;

const readWebKnowledgeIngestions = () => {
    const payload = readJsonOr(WEB_KNOWLEDGE_INGESTIONS_PATH, { version: 1, ingestions: [] });
    return Array.isArray(payload?.ingestions) ? payload.ingestions : [];
};

const writeWebKnowledgeIngestions = ingestions => atomicWriteJson(
    WEB_KNOWLEDGE_INGESTIONS_PATH,
    {
        version: 1,
        updatedAt: new Date().toISOString(),
        ingestions
    }
);

const configuredCommonAgentEndpoints = () => {
    const agentUrl = String(
        apiConfig?.agentServerUrl || process.env.COMMON_AGENT_URL || 'http://127.0.0.1:8000'
    ).replace(/\/+$/, '');
    let qaUrl = String(
        apiConfig?.visionQaServerUrl || process.env.COMMON_AGENT_QA_URL || ''
    ).replace(/\/+$/, '');
    if (!qaUrl) {
        const parsed = new URL(agentUrl);
        if (['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.port === '8000') {
            parsed.port = '8103';
            qaUrl = parsed.toString().replace(/\/+$/, '');
        } else {
            qaUrl = agentUrl;
        }
    }
    return { agentUrl, qaUrl };
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 45000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const runBundledNodeScript = (scriptName, args, envOverrides = {}) => new Promise((resolve, reject) => {
    const scriptsRoot = app.isPackaged
        ? path.join(process.resourcesPath, 'scripts')
        : path.join(__dirname, 'scripts');
    const scriptPath = path.join(scriptsRoot, scriptName);
    const child = spawn(process.execPath, [scriptPath, ...args], {
        cwd: app.isPackaged ? process.resourcesPath : __dirname,
        windowsHide: true,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            ...envOverrides
        }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
});

// --- MOBILE SERVER STATE ---
let mobileServer = null;
let currentMobileToken = null;

// --- DATABASE PATHS ---
const DB_ROOT = path.join(app.getPath('userData'), 'MoldMasterDB');
const DB_PATHS = {
    root: DB_ROOT,
    images: path.join(DB_ROOT, 'images'),
    trainingSet: path.join(DB_ROOT, 'training_set'),
    annotations: path.join(DB_ROOT, 'annotations.json'),
    metadata: path.join(DB_ROOT, 'metadata.json'),
    vectors: path.join(DB_ROOT, 'vectors.json'),
    feedback: path.join(DB_ROOT, 'feedback.json'),
};

function seedGeneratedProcessKnowledge() {
    try {
        const seedPath = path.join(__dirname, 'data', 'generated', 'process-matrix-knowledge.json');
        if (!fs.existsSync(seedPath)) return;
        if (db.knowledgeMatrix.count() > 0) return;

        const raw = fs.readFileSync(seedPath, 'utf-8').replace(/^\uFEFF/, '');
        const records = JSON.parse(raw);
        if (Array.isArray(records) && records.length > 0) {
            const imported = db.knowledgeMatrix.replaceAll(records);
            console.log(`Seeded process knowledge into SQLite: ${imported} records`);
        }
    } catch (error) {
        console.error('Failed to seed generated process knowledge:', error);
    }
}

// --- DATABASE INITIALIZATION ---
function initDatabase() {
    // 디렉토리 생성 (이미지 저장용)
    if (!fs.existsSync(DB_PATHS.root)) fs.mkdirSync(DB_PATHS.root);
    if (!fs.existsSync(DB_PATHS.images)) fs.mkdirSync(DB_PATHS.images);
    if (!fs.existsSync(DB_PATHS.trainingSet)) fs.mkdirSync(DB_PATHS.trainingSet);

    // SQLite 데이터베이스 초기화
    db.initDatabase(app.getPath('userData'));

    // 레이아웃 관리자 초기화
    layoutManager.initLayouts(app.getPath('userData'));

    // 기존 JSON 데이터 마이그레이션 (에러 가능성 낮추기 위한 조건부)
    db.initDatabase(app.getPath('userData'));
    layoutManager.initLayouts(app.getPath('userData'));

    if (fs.existsSync(DB_PATHS.feedback)) {
        const result = db.migrateFromJson(DB_PATHS.feedback);
        if (result.migrated > 0) {
            console.log(`Migrated ${result.migrated} feedback records from JSON to SQLite`);
        }
    }

    seedGeneratedProcessKnowledge();
    db.knowledgeMatrix.syncApprovedFeedback();

    console.log("Database Initialized at:", DB_PATHS.root);
}

// --- DATABASE HELPERS ---
function readJsonDB(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) { return []; }
}

function writeJsonDB(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Persistence & Proxy ---
function applyProxySettings(config) {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const session = mainWindow.webContents.session;
    const proxyUrl = config?.proxyUrl;

    if (proxyUrl && proxyUrl.trim() !== '') {
        session.setProxy({ proxyRules: proxyUrl.trim() })
            .catch(err => console.error('Failed to apply proxy settings:', err));
    } else {
        session.setProxy({ mode: 'system' })
            .catch(err => console.error('Failed to set system proxy:', err));
    }
}

function updateGlobalShortcut(shortcut) {
    globalShortcut.unregisterAll();
    const targetShortcut = shortcut && shortcut.trim() !== '' ? shortcut : DEFAULT_SHORTCUT;
    try {
        const ret = globalShortcut.register(targetShortcut, startCaptureProcess);
        if (!ret && targetShortcut !== DEFAULT_SHORTCUT) {
            globalShortcut.register(DEFAULT_SHORTCUT, startCaptureProcess);
        }
    } catch (e) {
        try { globalShortcut.register(DEFAULT_SHORTCUT, startCaptureProcess); } catch (err) { }
    }
}

function loadApiConfig() {
    try {
        if (fs.existsSync(apiConfigPath)) {
            const rawData = fs.readFileSync(apiConfigPath, 'utf-8');
            const config = JSON.parse(rawData);

            // Helper to decrypt
            const decrypt = (encrypted) => {
                try {
                    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
                } catch (e) { return ''; }
            };

            if (safeStorage && safeStorage.isEncryptionAvailable()) {
                // Decrypt Gemini Key
                if (config.encryptedGeminiKey) {
                    config.geminiApiKey = decrypt(config.encryptedGeminiKey);
                }
                // Decrypt OpenAI Key
                if (config.encryptedOpenAiKey) {
                    config.openAiApiKey = decrypt(config.encryptedOpenAiKey);
                }
                // Decrypt Admin Password
                if (config.encryptedAdminPassword) {
                    config.adminPassword = decrypt(config.encryptedAdminPassword);
                }

                // Legacy: If no specific keys, check old encryptedKey
                if (!config.geminiApiKey && !config.openAiApiKey && config.encryptedKey) {
                    const legacyKey = decrypt(config.encryptedKey);
                    // Assign legacy key to currently selected provider or both
                    config.apiKey = legacyKey; // Keep for fallback logic in renderer
                }
            }
            apiConfig = config;
        }
    } catch (error) {
        console.error('Failed to load API config:', error);
        apiConfig = null;
    }
}

function saveApiConfig(config) {
    try {
        const configToSave = { ...config };

        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            // Encrypt Gemini Key
            if (configToSave.geminiApiKey) {
                configToSave.encryptedGeminiKey = safeStorage.encryptString(configToSave.geminiApiKey).toString('base64');
            }
            // Encrypt OpenAI Key
            if (configToSave.openAiApiKey) {
                configToSave.encryptedOpenAiKey = safeStorage.encryptString(configToSave.openAiApiKey).toString('base64');
            }
            // Encrypt Admin Password
            if (configToSave.adminPassword) {
                configToSave.encryptedAdminPassword = safeStorage.encryptString(configToSave.adminPassword).toString('base64');
            }

            // Remove plain text keys and passwords
            delete configToSave.geminiApiKey;
            delete configToSave.openAiApiKey;
            delete configToSave.apiKey;
            delete configToSave.adminPassword;
            delete configToSave.encryptedKey; // Clean up legacy
        }

        fs.writeFileSync(apiConfigPath, JSON.stringify(configToSave), 'utf-8');
    } catch (error) {
        console.error('Failed to save API config:', error);
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    Menu.setApplicationMenu(null);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // 개발자 도구 자동 열기 (개발용)
}

function createToolbarWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width } = primaryDisplay.size;

    toolbarWindow = new BrowserWindow({
        width: 250,
        height: 50,
        x: Math.round((width - 250) / 2),
        y: 20,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        movable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });
    toolbarWindow.loadFile(path.join(__dirname, 'toolbar.html'));
    toolbarWindow.on('closed', () => {
        toolbarWindow = null;
        captureFrameCache.clear();
        if (overlayWindows.length === 0 && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.restore();
            mainWindow.focus();
            mainWindow.webContents.send('CAPTURE_SESSION_ENDED');
        }
    });
}

function closeAllOverlays() {
    overlayWindows.forEach(win => {
        if (!win.isDestroyed()) win.close();
    });
    overlayWindows = [];
}

async function captureDisplaySource(display) {
    const scaleFactor = display.scaleFactor || 1;
    const captureWidth = Math.max(1, Math.round(display.size.width * scaleFactor));
    const captureHeight = Math.max(1, Math.round(display.size.height * scaleFactor));

    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
            width: captureWidth,
            height: captureHeight
        }
    });

    const source = sources.find(item => String(item.display_id) === String(display.id));
    if (!source) return null;

    return {
        id: source.id,
        display,
        thumbnail: source.thumbnail,
        imageSize: source.thumbnail.getSize()
    };
}

const waitForCaptureUiToHide = () => new Promise(resolve => setTimeout(resolve, 300));

async function refreshDesktopFrames() {
    const displays = screen.getAllDisplays();
    return await captureFrameCache.refresh(async () =>
        (await Promise.all(displays.map(display => captureDisplaySource(display))))
            .filter(Boolean)
    );
}

async function prepareFreshCaptureSurface() {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.hide();
    closeAllOverlays();
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        mainWindow.minimize();
    }
    await waitForCaptureUiToHide();
    return await refreshDesktopFrames();
}

async function startCaptureProcess() {
    const processGeneration = ++captureProcessGeneration;
    await prepareFreshCaptureSurface();
    if (processGeneration !== captureProcessGeneration) return;

    if (!toolbarWindow) createToolbarWindow();
    else toolbarWindow.show();
}

// --- UTILS: Get All Local IPs for Dropdown ---
function getAllIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    // Always include loopback for testing
    addresses.push('127.0.0.1');

    // Sort to put Private IPs first (192.168 > 10. > 172. > others)
    addresses.sort((a, b) => {
        const score = (ip) => {
            if (ip.startsWith('192.168.')) return 4;
            if (ip.startsWith('10.')) return 3;
            if (ip.startsWith('172.')) return 2;
            if (ip === '127.0.0.1') return 0;
            return 1; // Public or others
        };
        return score(b) - score(a);
    });

    return addresses;
}

// --- UTILS: Get Default Best IP ---
function getDefaultIp(allIps) {
    if (!allIps || allIps.length === 0) return '127.0.0.1';
    // getAllIpAddresses returns sorted array, so first one is best guess
    return allIps[0];
}

app.whenReady().then(() => {
    initDatabase(); // Init DB on start
    loadApiConfig();
    createMainWindow();
    mainWindow.webContents.on('did-finish-load', () => {
        applyProxySettings(apiConfig);
    });
    updateGlobalShortcut(apiConfig?.shortcut);
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (mobileServer) mobileServer.close();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

//--- IPC Handlers ---//

ipcMain.handle('START_CAPTURE_SESSION', startCaptureProcess);

ipcMain.handle('INITIATE_REGION_CAPTURE', async () => {
    const processGeneration = ++captureProcessGeneration;
    const freshSources = await prepareFreshCaptureSurface();
    if (processGeneration !== captureProcessGeneration) return;

    freshSources.forEach(source => {
        const display = source.display;
        if (!display) return;
        const overlay = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.size.width,
            height: display.size.height,
            show: false,
            useContentSize: true,
            frame: false,
            transparent: false,
            backgroundColor: '#111827',
            alwaysOnTop: true,
            fullscreen: false,
            resizable: false,
            enableLargerThanScreen: true,
            focusable: true,
            fullscreenable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            skipTaskbar: true,
            hasShadow: false,
            thickFrame: false,
            roundedCorners: false,
            webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
        });
        overlay.once('ready-to-show', () => {
            overlay.setAlwaysOnTop(true, 'screen-saver');
            overlay.show();
            overlay.focus();
            overlay.moveTop();
        });
        overlay.loadFile(path.join(__dirname, 'overlay.html'));
        overlayWindows.push(overlay);
    });
});

ipcMain.handle('GET_CAPTURE_DATA', async (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin) return null;
    const winBounds = senderWin.getBounds();
    const display = screen.getDisplayMatching(winBounds);

    const cachedSource = captureFrameCache.getForDisplay(display.id);
    if (cachedSource?.thumbnail) {
        return {
            dataUrl: cachedSource.thumbnail.toDataURL(),
            scaleFactor: display.scaleFactor || 1,
            sourceId: cachedSource.id
        };
    }
    // Never capture here: the overlay is already visible and would be captured recursively.
    console.error(`Prepared capture frame missing for display ${display.id}`);
    return null;
});

// --- NEW: Hide-Capture-Show Handler with SHD Optimization ---
ipcMain.handle('PERFORM_REGION_CAPTURE', async (event, rect) => {
    const overlayWin = BrowserWindow.fromWebContents(event.sender);
    if (!overlayWin) return;

    try {
        const winBounds = overlayWin.getBounds();
        const display = screen.getDisplayMatching(winBounds);
        const source = captureFrameCache.getForDisplay(display.id);

        if (!source) throw new Error("Display source not found");

        const fullImage = source.thumbnail;
        const imageSize = source.imageSize || fullImage.getSize();
        const contentBounds = overlayWin.getContentBounds();
        const cropRect = mapSelectionToImage(
            rect,
            { width: contentBounds.width, height: contentBounds.height },
            imageSize
        );
        fs.appendFileSync(CAPTURE_DEBUG_LOG, `${JSON.stringify({
            timestamp: new Date().toISOString(),
            phase: 'crop',
            displayId: String(display.id),
            displayBounds: display.bounds,
            displayScaleFactor: display.scaleFactor || 1,
            selectionRect: rect,
            overlayContentSize: {
                width: contentBounds.width,
                height: contentBounds.height
            },
            imageSize,
            cropRect
        })}\n`, 'utf-8');

        // Safety check
        if (cropRect.width <= 0 || cropRect.height <= 0) throw new Error("Invalid crop dimensions");

        // Crop first
        let croppedImage = fullImage.crop(cropRect);

        // Keep small captures at native resolution like Windows Snipping Tool.
        // Only downscale oversized captures for editor/report performance.
        const croppedSize = croppedImage.getSize();
        const maxPreviewHeight = 720;
        if (croppedSize.height > maxPreviewHeight) {
            croppedImage = croppedImage.resize({
                height: maxPreviewHeight,
                quality: 'best',
            });
        }

        const dataUrl = croppedImage.toDataURL();

        // 7. Finish
        captureFrameCache.clear();
        closeAllOverlays();
        if (mainWindow) {
            mainWindow.restore();
            mainWindow.focus();
            mainWindow.webContents.send('SHOW_ANNOTATION_EDITOR', dataUrl);
        }
        if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.show();

    } catch (error) {
        console.error("Region Capture Failed:", error);
        // Restore opacity just in case
        if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setOpacity(1);
    }
});

ipcMain.handle('REGION_CAPTURED', (event, capturedDataUrl) => {
    captureFrameCache.clear();
    closeAllOverlays();
    if (mainWindow) {
        mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('SHOW_ANNOTATION_EDITOR', capturedDataUrl);
    }
    if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.show();
});

ipcMain.handle('CANCEL_CAPTURE', () => {
    captureProcessGeneration += 1;
    captureFrameCache.clear();
    closeAllOverlays();
    if (toolbarWindow) toolbarWindow.close();
    if (mainWindow) {
        mainWindow.restore();
        mainWindow.focus();
        mainWindow.webContents.send('CAPTURE_SESSION_ENDED');
    }
});

ipcMain.handle('DEBUG_CAPTURE_POINTER', (event, payload) => {
    try {
        const overlayWin = BrowserWindow.fromWebContents(event.sender);
        const cursorScreenPoint = screen.getCursorScreenPoint();
        const cursorDipPoint = overlayWin ? screen.screenToDipPoint(cursorScreenPoint) : null;
        const logEntry = {
            timestamp: new Date().toISOString(),
            payload,
            cursorScreenPoint,
            cursorDipPoint,
            windowBounds: overlayWin ? overlayWin.getBounds() : null,
            contentBounds: overlayWin ? overlayWin.getContentBounds() : null,
        };
        fs.appendFileSync(CAPTURE_DEBUG_LOG, `${JSON.stringify(logEntry)}\n`, 'utf-8');
    } catch (error) {
        console.error('DEBUG_CAPTURE_POINTER failed:', error);
    }
});

ipcMain.handle('GET_API_CONFIG', () => apiConfig);
ipcMain.handle('SET_API_CONFIG', (event, config) => {
    apiConfig = config;
    saveApiConfig(config);
    applyProxySettings(apiConfig);
    updateGlobalShortcut(apiConfig?.shortcut);
});

const currentApprovedWebKnowledgeTemplate = caseId => {
    const collection = loadCurrentWebKnowledgeCollection();
    const card = collection.cards.find(item => item.caseId === String(caseId || '').trim());
    if (!card) throw new Error(`웹 지식 카드를 찾을 수 없습니다: ${caseId}`);
    const template = webKnowledgeReviewLedger.buildApprovedTemplates([card])[0];
    if (!template) {
        throw new Error('현재 원문 해시에 유효한 사람 승인이 있어야 Common Agent로 전송할 수 있습니다.');
    }
    return { collection, card, template };
};

const postCommonAgentTemplate = async (endpoint, template, timeoutMs) => {
    const { agentUrl } = configuredCommonAgentEndpoints();
    const response = await fetchWithTimeout(`${agentUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
    }, timeoutMs);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Common Agent ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
};

const getCommonAgentJson = async (endpoint, timeoutMs = 45000) => {
    const { agentUrl } = configuredCommonAgentEndpoints();
    const response = await fetchWithTimeout(`${agentUrl}${endpoint}`, {}, timeoutMs);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`Common Agent ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload;
};

const verifyApprovedCommonAgentDocument = async documentId => {
    const detail = await getCommonAgentJson(
        `/v1/documents/${encodeURIComponent(documentId)}`,
        45000
    );
    if (detail.review_status !== 'approved') {
        throw new Error(
            `Common Agent 문서가 승인 상태가 아닙니다: ${detail.review_status || 'unknown'}`
        );
    }
    return detail;
};

ipcMain.handle('GET_WEB_KNOWLEDGE_REVIEW_QUEUE', () => {
    const collection = loadCurrentWebKnowledgeCollection();
    const ingestions = readWebKnowledgeIngestions();
    const ingestionByKey = new Map(ingestions.map(item => [
        webKnowledgeIngestionKey(item.caseId, item.sourceContentSha256),
        item
    ]));
    const queue = webKnowledgeReviewLedger.queue(collection.cards).map(item => ({
        ...item,
        centralIngestion: ingestionByKey.get(
            webKnowledgeIngestionKey(item.card.caseId, item.sourceContentSha256)
        ) || null
    }));
    return {
        rootPath: collection.rootPath,
        integrity: collection.integrity,
        collectionReport: collection.report,
        summary: webKnowledgeReviewLedger.summary(collection.cards),
        queue
    };
});

ipcMain.handle('GET_WEB_KNOWLEDGE_CARD_IMAGE', (_event, caseId) => {
    const collection = loadCurrentWebKnowledgeCollection();
    const card = collection.cards.find(item => item.caseId === String(caseId || '').trim());
    if (!card) throw new Error(`웹 지식 카드를 찾을 수 없습니다: ${caseId}`);
    const evidence = card.evidence.find(item => item.localFile);
    if (!evidence) return null;
    const filePath = resolveCollectionFile(collection.rootPath, evidence.localFile);
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === '.png'
        ? 'image/png'
        : extension === '.webp'
            ? 'image/webp'
            : 'image/jpeg';
    return {
        dataUrl: `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`,
        contentSha256: evidence.contentSha256,
        title: evidence.title,
        license: evidence.license,
        sourceUrl: evidence.sourceUrl
    };
});

ipcMain.handle('SET_WEB_KNOWLEDGE_REVIEW', (_event, caseId, input) => {
    const collection = loadCurrentWebKnowledgeCollection();
    const card = collection.cards.find(item => item.caseId === String(caseId || '').trim());
    if (!card) throw new Error(`웹 지식 카드를 찾을 수 없습니다: ${caseId}`);
    if (input?.decision === 'clear') {
        webKnowledgeReviewLedger.clear(card);
        return null;
    }
    return webKnowledgeReviewLedger.set(card, input);
});

ipcMain.handle('VALIDATE_WEB_KNOWLEDGE_CARD', async (_event, caseId) => {
    const { template } = currentApprovedWebKnowledgeTemplate(caseId);
    return await postCommonAgentTemplate(
        '/v1/ingestions/template/validate',
        template,
        45000
    );
});

ipcMain.handle('INGEST_WEB_KNOWLEDGE_CARD', async (_event, caseId) => {
    const { card, template } = currentApprovedWebKnowledgeTemplate(caseId);
    const sourceContentSha256 = template.metadata.source_content_sha256;
    const key = webKnowledgeIngestionKey(card.caseId, sourceContentSha256);
    const ingestions = readWebKnowledgeIngestions();
    const previous = ingestions.find(item =>
        webKnowledgeIngestionKey(item.caseId, item.sourceContentSha256) === key
        && item.status === 'succeeded'
    );
    if (previous) {
        return {
            alreadyIngested: true,
            ingestion: previous
        };
    }

    const validation = await postCommonAgentTemplate(
        '/v1/ingestions/template/validate',
        template,
        45000
    );
    if (validation.error_count > 0 || validation.ready_to_ingest !== true) {
        throw new Error(
            `Common Agent 품질 게이트 미통과: score=${validation.quality_score}, `
            + `errors=${validation.error_count}, warnings=${validation.warning_count}`
        );
    }

    const response = await postCommonAgentTemplate(
        '/v1/workflows/ingest-template',
        template,
        180000
    );
    const responseSha256 = crypto
        .createHash('sha256')
        .update(JSON.stringify(response))
        .digest('hex');
    const record = {
        caseId: card.caseId,
        sourceContentSha256,
        documentId: response.document_id
            || response.document?.document_id
            || template.document_id,
        status: 'succeeded',
        ingestedAt: new Date().toISOString(),
        responseSha256
    };
    const next = ingestions.filter(item =>
        webKnowledgeIngestionKey(item.caseId, item.sourceContentSha256) !== key
    );
    next.push(record);
    writeWebKnowledgeIngestions(next);
    return {
        alreadyIngested: false,
        validation,
        ingestion: record,
        response
    };
});

ipcMain.handle('APPROVE_WEB_KNOWLEDGE_CARD', async (_event, caseId, input) => {
    const { card, template } = currentApprovedWebKnowledgeTemplate(caseId);
    if (input?.confirmed !== true) {
        throw new Error('Common Agent 중앙 승인에는 두 번째 사람 확인이 필요합니다.');
    }
    const reviewerComment = String(input?.reviewerComment || '').trim();
    if (!reviewerComment) throw new Error('중앙 승인 검토 의견이 필요합니다.');
    const sourceContentSha256 = template.metadata.source_content_sha256;
    const key = webKnowledgeIngestionKey(card.caseId, sourceContentSha256);
    const ingestions = readWebKnowledgeIngestions();
    const index = ingestions.findIndex(item =>
        webKnowledgeIngestionKey(item.caseId, item.sourceContentSha256) === key
        && item.status === 'succeeded'
    );
    if (index < 0) {
        throw new Error('먼저 현재 승인 해시를 Common Agent 검토 후보로 적재해야 합니다.');
    }
    if (ingestions[index].centralReviewStatus === 'approved') {
        await verifyApprovedCommonAgentDocument(ingestions[index].documentId);
        return { alreadyApproved: true, approval: ingestions[index] };
    }

    const approval = await postCommonAgentTemplate('/v1/feedback', {
        target_type: 'document',
        target_id: ingestions[index].documentId,
        decision: 'approve',
        comment: reviewerComment,
        metadata: {
            source_app: 'mold-master-ai',
            case_id: card.caseId,
            source_content_sha256: sourceContentSha256,
            local_hitl_reviewer: String(input?.reviewer || '').trim()
        }
    }, 60000);
    if (approval.review_status !== 'approved') {
        throw new Error(`Common Agent 중앙 승인 상태 불일치: ${approval.review_status || 'unknown'}`);
    }
    await verifyApprovedCommonAgentDocument(ingestions[index].documentId);
    const updated = {
        ...ingestions[index],
        centralReviewStatus: 'approved',
        centralApprovedAt: new Date().toISOString(),
        centralApprovalComment: reviewerComment
    };
    ingestions[index] = updated;
    writeWebKnowledgeIngestions(ingestions);
    return { alreadyApproved: false, approval: updated, response: approval };
});

ipcMain.handle('TEST_WEB_KNOWLEDGE_ROUNDTRIP', async (_event, caseId) => {
    const { card, template } = currentApprovedWebKnowledgeTemplate(caseId);
    const sourceContentSha256 = template.metadata.source_content_sha256;
    const ingestion = readWebKnowledgeIngestions().find(item =>
        webKnowledgeIngestionKey(item.caseId, item.sourceContentSha256)
            === webKnowledgeIngestionKey(card.caseId, sourceContentSha256)
        && item.centralReviewStatus === 'approved'
    );
    if (!ingestion) {
        throw new Error('Common Agent 중앙 승인까지 완료된 현재 해시만 왕복 검증할 수 있습니다.');
    }
    await verifyApprovedCommonAgentDocument(ingestion.documentId);
    const response = await postCommonAgentTemplate('/v1/ask', {
        question: `${card.defectName} 결함의 현상, 원인, 확인 항목과 대책을 승인된 Graph 근거로 간결하게 답변하세요.`,
        top_k: 8,
        session_id: `mold-master-web-card-${card.caseId}-${Date.now()}`,
        filters: {
            include_rag: false,
            include_reasoning_paths: true,
            include_knowledge_graph: true,
            include_knowledge_relations: true,
            evidence_policy: 'graph_approved_only',
            source_app: 'mold-master-ai'
        }
    }, 120000);
    const evidence = Array.isArray(response.evidence) ? response.evidence : [];
    const approvedOnly = evidence.length > 0
        && evidence.every(item => item.review_status === 'approved');
    const documentMatched = evidence.some(item =>
        item.source_ref === ingestion.documentId
        || item.metadata?.document_id === ingestion.documentId
        || item.metadata?.source_document_id === ingestion.documentId
    );
    const normalizedEvidence = evidence
        .map(item => String(item.text || ''))
        .join(' ')
        .toLocaleLowerCase();
    const defectMatched = normalizedEvidence.includes(
        String(card.defectName || '').toLocaleLowerCase()
    );
    return {
        passed: approvedOnly && (documentMatched || defectMatched),
        caseId: card.caseId,
        documentId: ingestion.documentId,
        answer: response.answer,
        confidence: response.confidence,
        evidence,
        reasoningTrace: response.reasoning_trace || [],
        checks: {
            evidencePresent: evidence.length > 0,
            approvedOnly,
            documentMatched,
            defectMatched
        }
    };
});

ipcMain.handle('RUN_VISION_BENCHMARK', async () => {
    fs.mkdirSync(VISION_BENCHMARK_ROOT, { recursive: true });
    const fixturesDir = path.join(VISION_BENCHMARK_ROOT, 'approved-fixtures');
    const manifestPath = path.join(fixturesDir, 'manifest.json');
    const reportPath = path.join(VISION_BENCHMARK_ROOT, 'latest-report.json');
    const gateStatusPath = path.join(VISION_BENCHMARK_ROOT, 'latest-gate-status.json');
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
    if (fs.existsSync(gateStatusPath)) fs.unlinkSync(gateStatusPath);

    const { agentUrl, qaUrl } = configuredCommonAgentEndpoints();
    const benchmarkEnv = {
        COMMON_AGENT_URL: agentUrl,
        COMMON_AGENT_QA_URL: qaUrl
    };

    const sync = await runBundledNodeScript(
        'sync-approved-vision-fixtures.js',
        [fixturesDir],
        benchmarkEnv
    );
    if (sync.code !== 0 || !fs.existsSync(manifestPath)) {
        throw new Error(`승인 이미지 동기화 실패: ${sync.stderr || sync.stdout || `exit ${sync.code}`}`);
    }

    const benchmark = await runBundledNodeScript(
        'run-multimodal-vision-benchmark.js',
        ['--manifest', manifestPath, '--output', reportPath],
        benchmarkEnv
    );
    if (!fs.existsSync(reportPath)) {
        throw new Error(`Vision 벤치마크 실행 실패: ${benchmark.stderr || benchmark.stdout || `exit ${benchmark.code}`}`);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const probeJson = async (url, timeoutMs = 15000) => {
        const response = await fetchWithTimeout(url, {}, timeoutMs);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(`${response.status} ${JSON.stringify(payload)}`);
        }
        return payload;
    };
    const probeHealth = async baseUrl => {
        try {
            return {
                online: true,
                url: baseUrl,
                detail: await retryAsync(
                    () => probeJson(`${baseUrl}/healthz`, 15000),
                    { attempts: 3, delayMs: 1000 }
                )
            };
        } catch (error) {
            return {
                online: false,
                url: baseUrl,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    };
    const [agentHealth, qaHealth] = await Promise.all([
        probeHealth(agentUrl),
        probeHealth(qaUrl)
    ]);
    const dataset = await retryAsync(
        () => probeJson(
            `${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`,
            30000
        ),
        { attempts: 2, delayMs: 1000 }
    ).catch(error => ({
        total: 0,
        items: [],
        error: error instanceof Error ? error.message : String(error)
    }));
    const approvedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let reviewManifest = {};
    let reviewPacketPath = null;
    try {
        const reviewPacketRoot = findPreparedVisionReviewPacket();
        reviewPacketPath = reviewPacketRoot
            ? path.join(reviewPacketRoot, 'vision-candidates.json')
            : null;
        if (reviewPacketPath && fs.existsSync(reviewPacketPath)) {
            reviewManifest = JSON.parse(fs.readFileSync(reviewPacketPath, 'utf8'));
        }
    } catch {
        // The benchmark remains valid when no optional local HITL packet is available.
    }
    const gateStatus = {
        ...buildMigrationGateStatus({
            generatedAt: new Date().toISOString(),
            agentHealth,
            qaHealth,
            dataset,
            approvedManifest,
            reviewManifest,
            benchmarkReport: report
        }),
        sources: {
            approvedManifest: manifestPath,
            reviewPacket: reviewPacketPath,
            benchmarkReport: reportPath
        }
    };
    fs.writeFileSync(
        gateStatusPath,
        `${JSON.stringify(gateStatus, null, 2)}\n`,
        'utf8'
    );
    return {
        completed: true,
        gatePassed: gateStatus.gate.canDisableLegacyFallback,
        report,
        reportPath,
        gateStatus,
        gateStatusPath,
        syncOutput: sync.stdout.trim(),
        benchmarkOutput: benchmark.stdout.trim(),
        benchmarkExitCode: benchmark.code
    };
});

const describeVisionLabelSuggestion = async ({
    imageId,
    imageBytes,
    mimeType,
    context = {},
    sourceSystem
}) => {
    const { qaUrl } = configuredCommonAgentEndpoints();
    const currentLabel = String(context?.currentLabel || '').trim().slice(0, 200);
    const fieldContext = String(context?.question || '').trim().slice(0, 2000);
    const question = [
        '사출 성형 이미지의 HITL 사전 검토를 수행하세요.',
        '이미지에서 직접 관찰되는 형상과 금형 기능부를 먼저 구분한 뒤 지배적인 결함명을 제안하세요.',
        '이 결과는 자동 승인되지 않으며 사람 검토를 위한 라벨 제안입니다.',
        currentLabel ? `현재 검토 라벨: ${currentLabel}` : '',
        fieldContext ? `현장 설명: ${fieldContext}` : ''
    ].filter(Boolean).join('\n');
    const qaResponse = await fetchWithTimeout(`${qaUrl}/internal/vision/describe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            image_base64: imageBytes.toString('base64'),
            mime_type: mimeType || 'image/png',
            question,
            context: {
                source_system: sourceSystem,
                source_image_id: imageId,
                non_persisting: true
            }
        })
    });
    const observation = await qaResponse.json().catch(() => ({}));
    if (!qaResponse.ok) {
        throw new Error(
            `Common Agent Vision 라벨 제안 실패: ${qaResponse.status} ${JSON.stringify(observation)}`
        );
    }
    const defectType = String(observation.defect_type || '').trim();
    if (!defectType) {
        throw new Error('Common Agent Vision이 판정 가능한 결함명을 반환하지 않았습니다.');
    }
    const classifiable = isClassifiableDefectLabel(defectType);
    const modelConfidence = Math.max(0, Math.min(1, Number(observation.confidence) || 0));
    return {
        imageId,
        defectType,
        classifiable,
        confidence: classifiable ? modelConfidence : 0,
        modelConfidence,
        summary: String(observation.summary || '').trim(),
        possibleCauses: Array.isArray(observation.possible_causes)
            ? observation.possible_causes.map(value => String(value)).filter(Boolean)
            : [],
        recommendedChecks: Array.isArray(observation.recommended_checks)
            ? observation.recommended_checks.map(value => String(value)).filter(Boolean)
            : [],
        nonPersisting: true
    };
};

const readCurrentLocalCandidateBytes = candidate => {
    const imageBytes = fs.readFileSync(candidate.filePath);
    if (imageBytes.length === 0 || imageBytes.length > MAX_VISION_SUGGESTION_IMAGE_BYTES) {
        throw new Error('후보 이미지가 비어 있거나 20MB 제한을 초과했습니다.');
    }
    const currentSha256 = crypto.createHash('sha256').update(imageBytes).digest('hex');
    if (currentSha256 !== candidate.contentSha256) {
        throw new Error('폴더 검사 후 원본 이미지가 변경되었습니다. 폴더를 다시 검사하세요.');
    }
    return imageBytes;
};

ipcMain.handle('SUGGEST_VISION_LABEL', async (_event, imageId, context = {}) => {
    const normalizedImageId = String(imageId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(normalizedImageId)) {
        throw new Error('유효하지 않은 Vision 이미지 ID입니다.');
    }
    const { agentUrl } = configuredCommonAgentEndpoints();
    const imageResponse = await fetchWithTimeout(
        `${agentUrl}/v1/datasets/images/${encodeURIComponent(normalizedImageId)}/file`,
        {},
        30000
    );
    if (!imageResponse.ok) {
        throw new Error(`원본 이미지 조회 실패: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    const contentLength = Number(imageResponse.headers.get('content-length') || 0);
    if (contentLength > MAX_VISION_SUGGESTION_IMAGE_BYTES) {
        throw new Error('AI 라벨 제안 이미지가 20MB 제한을 초과했습니다.');
    }
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    if (imageBytes.length === 0 || imageBytes.length > MAX_VISION_SUGGESTION_IMAGE_BYTES) {
        throw new Error('AI 라벨 제안 이미지가 비어 있거나 20MB 제한을 초과했습니다.');
    }
    return await describeVisionLabelSuggestion({
        imageId: normalizedImageId,
        imageBytes,
        mimeType: imageResponse.headers.get('content-type') || 'image/png',
        context,
        sourceSystem: 'mold-master-ai-hitl-suggestion'
    });
});

const scanVisionCandidateRoot = (rootPath, existingHashes = []) => {
    const safeExistingHashes = Array.isArray(existingHashes)
        ? existingHashes
            .map(value => String(value || '').trim().toLowerCase())
            .filter(value => /^[a-f0-9]{64}$/.test(value))
            .slice(0, 1000)
        : [];
    const scan = scanLocalVisionCandidates({
        rootPath,
        existingHashes: safeExistingHashes,
        inspectImage: filePath => {
            const image = nativeImage.createFromPath(filePath);
            if (image.isEmpty()) return null;
            const size = image.getSize();
            const scale = Math.min(1, 320 / size.width, 220 / size.height);
            const preview = scale < 1
                ? image.resize({
                    width: Math.max(1, Math.round(size.width * scale)),
                    height: Math.max(1, Math.round(size.height * scale)),
                    quality: 'good'
                })
                : image;
            return {
                width: size.width,
                height: size.height,
                previewDataUrl: preview.toDataURL()
            };
        }
    });

    const candidatesWithDecisions = scan.candidates.map(candidate => ({
        ...candidate,
        reviewDecision: visionReviewDecisionLedger.get(candidate.contentSha256)
    }));
    localVisionCandidateFiles = new Map(candidatesWithDecisions.map(candidate => [
        candidate.candidateId,
        candidate
    ]));
    return {
        ...scan,
        candidates: candidatesWithDecisions.map(({ filePath, ...candidate }) => ({
            ...candidate,
            relativePath: path.relative(scan.rootPath, filePath)
        })),
        summary: {
            ...scan.summary,
            deferredDecisions: candidatesWithDecisions.filter(
                candidate => candidate.reviewDecision?.decision === 'deferred'
            ).length,
            excludedDecisions: candidatesWithDecisions.filter(
                candidate => candidate.reviewDecision?.decision === 'excluded'
            ).length
        }
    };
};

const findPreparedVisionReviewPacket = () => {
    const configuredRoot = String(
        process.env.MOLD_MASTER_VISION_REVIEW_PACKET_ROOT || ''
    ).trim();
    if (configuredRoot) {
        const resolved = path.resolve(configuredRoot);
        if (
            fs.existsSync(resolved)
            && fs.statSync(resolved).isDirectory()
            && fs.existsSync(path.join(resolved, 'vision-candidates.json'))
        ) {
            return resolved;
        }
        throw new Error(`준비된 Vision 검토 패킷을 찾을 수 없습니다: ${resolved}`);
    }

    if (fs.existsSync(VISION_REVIEW_PACKET_POINTER)) {
        try {
            const pointer = JSON.parse(
                fs.readFileSync(VISION_REVIEW_PACKET_POINTER, 'utf8')
            );
            const resolved = path.resolve(String(pointer.rootPath || ''));
            if (
                fs.existsSync(resolved)
                && fs.statSync(resolved).isDirectory()
                && fs.existsSync(path.join(resolved, 'vision-candidates.json'))
            ) {
                return resolved;
            }
        } catch {
            // Ignore a stale pointer and continue with development artifact discovery.
        }
    }

    const artifactRoots = [...new Set([
        path.join(process.cwd(), 'artifacts'),
        path.join(__dirname, 'artifacts')
    ])];
    const candidates = artifactRoots.flatMap(artifactRoot => {
        if (!fs.existsSync(artifactRoot)) return [];
        return fs.readdirSync(artifactRoot, { withFileTypes: true })
            .filter(entry =>
                entry.isDirectory()
                && entry.name.startsWith('vision-human-review-packet-')
            )
            .map(entry => path.join(artifactRoot, entry.name))
            .filter(directory => fs.existsSync(path.join(directory, 'vision-candidates.json')));
    });
    return candidates.sort().at(-1) || null;
};

const rememberVisionReviewPacket = rootPath => {
    const resolved = path.resolve(rootPath);
    if (!fs.existsSync(path.join(resolved, 'vision-candidates.json'))) return;
    fs.writeFileSync(
        VISION_REVIEW_PACKET_POINTER,
        JSON.stringify({ rootPath: resolved, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
    );
};

ipcMain.handle('SCAN_LOCAL_VISION_CANDIDATES', async (_event, existingHashes = []) => {
    const testRoot = String(process.env.MOLD_MASTER_TEST_LOCAL_VISION_ROOT || '').trim();
    let rootPath = testRoot;
    if (!rootPath) {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: '제조 결함 이미지 후보 폴더 선택',
            properties: ['openDirectory']
        });
        if (result.canceled || !result.filePaths[0]) {
            return null;
        }
        rootPath = result.filePaths[0];
    }
    const scan = scanVisionCandidateRoot(rootPath, existingHashes);
    rememberVisionReviewPacket(rootPath);
    return scan;
});

ipcMain.handle('SCAN_PREPARED_VISION_REVIEW_PACKET', async (_event, existingHashes = []) => {
    const rootPath = findPreparedVisionReviewPacket();
    if (!rootPath) {
        throw new Error(
            '준비된 Vision 검토 패킷이 없습니다. 먼저 npm run vision:review-packet을 실행하세요.'
        );
    }
    const scan = scanVisionCandidateRoot(rootPath, existingHashes);
    rememberVisionReviewPacket(rootPath);
    return scan;
});

ipcMain.handle('SET_LOCAL_VISION_REVIEW_DECISION', async (_event, candidateId, input = {}) => {
    const candidate = localVisionCandidateFiles.get(String(candidateId || ''));
    if (!candidate) {
        throw new Error('후보 폴더를 다시 검사한 뒤 HITL 판정을 저장하세요.');
    }
    const decision = String(input?.decision || '').trim();
    if (decision === 'clear') {
        visionReviewDecisionLedger.clear(candidate.contentSha256);
        candidate.reviewDecision = null;
        return null;
    }
    readCurrentLocalCandidateBytes(candidate);
    const record = visionReviewDecisionLedger.set({
        contentSha256: candidate.contentSha256,
        candidateId: candidate.candidateId,
        fileName: candidate.fileName,
        decision,
        reason: input?.reason
    });
    candidate.reviewDecision = record;
    return record;
});

ipcMain.handle('GET_LOCAL_VISION_CANDIDATE_IMAGE', async (_event, candidateId) => {
    const candidate = localVisionCandidateFiles.get(String(candidateId || ''));
    if (!candidate) {
        throw new Error('후보 폴더를 다시 검사한 뒤 원본 이미지를 확인하세요.');
    }
    const imageBytes = readCurrentLocalCandidateBytes(candidate);
    return {
        dataUrl: `data:${candidate.mimeType};base64,${imageBytes.toString('base64')}`,
        width: candidate.width,
        height: candidate.height,
        mimeType: candidate.mimeType,
        contentSha256: candidate.contentSha256
    };
});

ipcMain.handle('SUGGEST_LOCAL_VISION_LABEL', async (_event, candidateId, context = {}) => {
    const candidate = localVisionCandidateFiles.get(String(candidateId || ''));
    if (!candidate) {
        throw new Error('후보 폴더를 다시 검사한 뒤 AI 라벨 제안을 실행하세요.');
    }
    const imageBytes = readCurrentLocalCandidateBytes(candidate);
    return await describeVisionLabelSuggestion({
        imageId: candidate.candidateId,
        imageBytes,
        mimeType: candidate.mimeType,
        context,
        sourceSystem: 'mold-master-ai-local-candidate-suggestion'
    });
});

ipcMain.handle('IMPORT_LOCAL_VISION_CANDIDATE', async (_event, candidateId, input = {}) => {
    const candidate = localVisionCandidateFiles.get(String(candidateId || ''));
    if (!candidate) {
        throw new Error('후보 폴더를 다시 검사한 뒤 등록하세요.');
    }
    if (candidate.alreadyRegistered) {
        throw new Error('동일한 이미지가 Common Agent 데이터셋에 이미 등록되어 있습니다.');
    }
    if (candidate.reviewDecision) {
        throw new Error('보류 또는 제외 판정을 해제한 뒤 Common Agent 후보로 등록하세요.');
    }
    const proposedDefectType = String(input?.defectType || '').trim().slice(0, 200);
    if (!isClassifiableDefectLabel(proposedDefectType)) {
        throw new Error('사람이 확인한 판정 가능한 결함명을 입력해야 후보를 등록할 수 있습니다.');
    }
    const fieldContext = String(input?.question || '').trim().slice(0, 2000);
    const labelReconciled = input?.labelReconciled === true;
    if (candidate.requiresLabelReconciliation && !labelReconciled) {
        throw new Error('원문 라벨과 Vision 제안의 차이를 검토하고 최종 라벨을 확인해야 합니다.');
    }
    const { agentUrl } = configuredCommonAgentEndpoints();
    const latestDatasetResponse = await fetchWithTimeout(
        `${agentUrl}/v1/datasets/images?include_hidden=true&limit=500`,
        {},
        30000
    );
    if (!latestDatasetResponse.ok) {
        throw new Error(`Common Agent 중복 확인 실패: ${latestDatasetResponse.status}`);
    }
    const latestDataset = await latestDatasetResponse.json().catch(() => ({ items: [] }));
    const duplicate = Array.isArray(latestDataset.items)
        && latestDataset.items.some(item =>
            String(item?.metadata?.content_sha256 || '').trim().toLowerCase() === candidate.contentSha256
        );
    if (duplicate) {
        candidate.alreadyRegistered = true;
        throw new Error('동일한 이미지가 Common Agent 데이터셋에 이미 등록되어 있습니다.');
    }

    const imageBytes = readCurrentLocalCandidateBytes(candidate);
    const formData = new FormData();
    formData.append('file', new Blob([imageBytes], { type: candidate.mimeType }), candidate.fileName);
    formData.append(
        'question',
        [
            `사람이 사전 확인한 결함명: ${proposedDefectType}`,
            fieldContext ? `현장 설명: ${fieldContext}` : '',
            '이미지 관찰과 Graph 근거를 결합해 원인, 확인 항목, 조치 방향을 분석하세요.'
        ].filter(Boolean).join('\n')
    );
    formData.append('source_system', 'mold-master-ai-local-candidate');
    formData.append('process_area', 'injection-molding');
    formData.append('persist_mode', 'always');
    formData.append('metadata_json', JSON.stringify({
        source_app: 'mold-master-ai',
        intake_mode: 'local_candidate_hitl',
        proposed_defect_type: proposedDefectType,
        content_sha256: candidate.contentSha256,
        original_file_name: candidate.fileName,
        label_reconciliation_required: Boolean(candidate.requiresLabelReconciliation),
        label_reconciled: labelReconciled,
        ...(candidate.labelEvidence ? {
            source_proposed_defect_type: candidate.labelEvidence.sourceLabel,
            vision_suggested_defect_type: candidate.labelEvidence.visionSuggestedLabel,
            vision_suggestion_confidence: candidate.labelEvidence.visionConfidence,
            vision_suggestion_summary: candidate.labelEvidence.visionSummary,
            vision_suggestion_non_persisting: candidate.labelEvidence.nonPersisting !== false,
            vision_suggestion_audited_at: candidate.labelEvidence.auditedAt
        } : {}),
        ...(candidate.sourceLineage ? {
            source_review_session_id: candidate.sourceLineage.reviewSessionId,
            source_document_id: candidate.sourceLineage.sourceDocumentId,
            source_document_version_id: candidate.sourceLineage.documentVersionId,
            source_document_title: candidate.sourceLineage.documentTitle,
            source_knowledge_id: candidate.sourceLineage.knowledgeId,
            source_card_version: candidate.sourceLineage.cardVersion,
            source_slide_number: candidate.sourceLineage.slideNumber,
            source_figure_id: candidate.sourceLineage.figureId,
            source_evidence_id: candidate.sourceLineage.evidenceId,
            source_asset_uri: candidate.sourceLineage.assetUri,
            source_content_hash: candidate.sourceLineage.sourceContentHash,
            source_review_status: candidate.sourceLineage.sourceReviewStatus,
            source_web_case_id: candidate.sourceLineage.webCaseId,
            source_publisher: candidate.sourceLineage.sourcePublisher,
            source_title: candidate.sourceLineage.sourceTitle,
            source_url: candidate.sourceLineage.sourceUrl,
            source_download_url: candidate.sourceLineage.downloadUrl,
            source_license: candidate.sourceLineage.license,
            source_license_url: candidate.sourceLineage.licenseUrl,
            source_license_verification_url: candidate.sourceLineage.licenseVerificationUrl,
            source_record_id: candidate.sourceLineage.sourceRecordId,
            source_citation: candidate.sourceLineage.sourceCitation,
            source_author: candidate.sourceLineage.author,
            source_retrieved_at: candidate.sourceLineage.retrievedAt,
            source_evidence_sha256: candidate.sourceLineage.evidenceContentSha256,
            source_packet_kind: candidate.sourceLineage.packetSourceKind,
            source_packet_relative_path: candidate.sourceLineage.packetSourceRelativePath
        } : {})
    }));

    const response = await fetchWithTimeout(`${agentUrl}/v1/vision/diagnose`, {
        method: 'POST',
        body: formData
    }, 240000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(
            `Common Agent 후보 등록 실패: ${response.status} ${JSON.stringify(payload)}`
        );
    }
    if (!payload.image_id || payload.metadata?.persisted_to_dataset === false) {
        throw new Error('Common Agent가 후보 이미지 저장을 확인하지 못했습니다.');
    }

    candidate.alreadyRegistered = true;
    return {
        imageId: String(payload.image_id),
        reviewStatus: String(payload.review_status || 'candidate'),
        proposedDefectType,
        persistedToDataset: true
    };
});

ipcMain.handle('READ_FILE_CONTENTS', async () => {
    if (!mainWindow) return null;
    const testPaths = String(process.env.MOLD_MASTER_TEST_MANUAL_DOCUMENT_PATHS || '')
        .split(path.delimiter)
        .map(value => value.trim())
        .filter(Boolean);
    let filePaths = testPaths;
    if (filePaths.length === 0) {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Documents', extensions: ['txt', 'pdf', 'docx', 'pptx', 'xlsx', 'csv'] }],
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        filePaths = result.filePaths;
    }
    const fileData = [];
    for (const filePath of filePaths) {
        try {
            const content = fs.readFileSync(filePath);
            fileData.push({ name: path.basename(filePath), content });
        } catch (error) { console.error(`Failed to read file ${filePath}:`, error); }
    }
    return fileData.length > 0 ? fileData : null;
});

ipcMain.handle('GENERATE_QR_CODE', async (event, url) => {
    try {
        return await QRCode.toDataURL(url);
    } catch (err) {
        console.error("QR Gen Error:", err);
        return "";
    }
});

// --- MOBILE SERVER HANDLER ---
ipcMain.handle('START_MOBILE_SERVER', async (event, customPort) => {
    if (mobileServer) {
        mobileServer.close();
        mobileServer = null;
    }

    const availableIps = getAllIpAddresses();
    const ip = getDefaultIp(availableIps);

    currentMobileToken = crypto.randomUUID();
    const portToUse = customPort ? parseInt(customPort) : 0;

    return new Promise((resolve) => {
        mobileServer = http.createServer(async (req, res) => {
            const remoteIp = req.socket.remoteAddress;
            console.log(`📱 [Mobile Server] Request: ${req.method} ${req.url} from ${remoteIp}`);

            if (mainWindow) {
                mainWindow.webContents.send('MOBILE_CONNECT_ATTEMPT', { ip: remoteIp });
            }

            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const token = urlObj.searchParams.get('token');

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            if (!token || token !== currentMobileToken) {
                res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('인증 토큰이 유효하지 않습니다.');
                return;
            }

            // 1. SERVE MOBILE APP UI
            if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                // Return Mobile UI HTML
                const html = `
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <title>Mold Master Mobile</title>
                    <style>
                        body { margin: 0; padding: 0; background-color: #111827; color: white; font-family: system-ui; display: flex; flex-direction: column; height: 100vh; }
                        .container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; gap: 20px; }
                        .btn { width: 100%; max-width: 300px; padding: 20px; border-radius: 16px; border: none; font-size: 1.2rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; color: white; text-decoration: none; }
                        .btn-camera { background: linear-gradient(135deg, #4f46e5, #4338ca); }
                        .btn-gallery { background-color: #374151; }
                        input { display: none; }
                        #overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: none; align-items: center; justify-content: center; z-index: 50; flex-direction: column;}
                        .spinner { width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #fff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;}
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>📷 사진 전송</h1>
                        <label class="btn btn-camera">
                            카메라 촬영 <input type="file" id="cameraInput" accept="image/*" capture="environment">
                        </label>
                        <label class="btn btn-gallery">
                            갤러리 선택 <input type="file" id="galleryInput" accept="image/*">
                        </label>
                    </div>
                    <div id="overlay">
                        <div class="spinner"></div>
                        <h2 id="status">전송 중...</h2>
                    </div>
                    <script>
                        const token = "${currentMobileToken}";
                        const overlay = document.getElementById('overlay');
                        const status = document.getElementById('status');
                        let isUploading = false;

                        function handleUpload(e) {
                            if (isUploading || !e.target.files[0]) return;
                            isUploading = true;
                            overlay.style.display = 'flex';
                            status.innerText = "전송 중...";

                            const file = e.target.files[0];
                            fetch('/upload?token=' + token + '&filename=' + encodeURIComponent(file.name), {
                                method: 'POST', body: file
                            }).then(res => {
                                if(res.ok) {
                                    status.innerText = "✅ 전송 완료!";
                                    setTimeout(() => {
                                        overlay.style.display = 'none';
                                        isUploading = false;
                                        e.target.value = ''; // Reset
                                    }, 1500);
                                } else {
                                    alert("전송 실패");
                                    overlay.style.display = 'none';
                                    isUploading = false;
                                    e.target.value = '';
                                }
                            }).catch(() => {
                                alert("네트워크 오류");
                                overlay.style.display = 'none';
                                isUploading = false;
                                e.target.value = '';
                            });
                        }

                        document.getElementById('cameraInput').addEventListener('change', handleUpload);
                        document.getElementById('galleryInput').addEventListener('change', handleUpload);
                    </script>
                </body>
                </html>`;
                res.end(html);
            }
            // 2. HANDLE UPLOAD (POST)
            else if (req.method === 'POST' && urlObj.pathname === '/upload') {
                const filename = urlObj.searchParams.get('filename') || `upload_${Date.now()}.png`;
                const savePath = path.join(DB_PATHS.images, filename);
                const fileStream = fs.createWriteStream(savePath);

                req.pipe(fileStream);

                fileStream.on('finish', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));

                    try {
                        const fileBuffer = fs.readFileSync(savePath);
                        // Determine mime type from extension or default to png
                        const ext = path.extname(filename).toLowerCase();
                        let mimeType = 'image/png';
                        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';

                        const base64 = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

                        if (mainWindow) {
                            mainWindow.webContents.send('MOBILE_UPLOAD_SUCCESS', {
                                filename,
                                dataUrl: base64
                            });
                        }
                    } catch (e) {
                        console.error("Failed to read back uploaded file", e);
                    }
                });

                fileStream.on('error', (err) => {
                    res.writeHead(500);
                    res.end('Server Error');
                });
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        mobileServer.listen(portToUse, '0.0.0.0', async () => {
            const address = mobileServer.address();
            const port = typeof address === 'string' ? portToUse : address.port;
            const url = `http://${ip}:${port}?token=${currentMobileToken}`;

            let qrCodeDataUrl = '';
            try {
                qrCodeDataUrl = await QRCode.toDataURL(url);
            } catch (err) {
                console.error("QR Code Generation Error:", err);
            }

            resolve({
                url,
                token: currentMobileToken,
                ip,
                port,
                availableIps,
                qrCode: qrCodeDataUrl
            });
        });
    });
});

// =============================================================
// SQLite 데이터베이스 IPC 핸들러들
// =============================================================

// 벡터 저장소
ipcMain.handle('GET_VECTOR_STORE', () => {
    return db.vectors.getAll();
});

// DB 통계 (SQLite 기반)
ipcMain.handle('GET_DB_STATS', () => {
    const imageCount = fs.existsSync(DB_PATHS.images) ? fs.readdirSync(DB_PATHS.images).length : 0;
    const trainingSetCount = db.trainingSet.count();
    const defectStats = db.defects.getStats();
    const vectorCount = db.vectors.count();
    const knowledgeMatrixCount = db.knowledgeMatrix.count();

    return {
        imageCount,
        trainingSetCount,
        defectCount: defectStats.total,
        vectorCount,
        knowledgeMatrixCount,
        // 상세 통계 (SQLite)
        defectStats: defectStats
    };
});

// 사용자 피드백 (결함 분석 결과) - SQLite 사용
ipcMain.handle('SAVE_USER_FEEDBACK', (event, analysis, imageId, status = 'pending', isVerified = false, dataUrl = null, options = {}) => {
    // 1. 이미지가 디스크에 없으면 저장
    if (dataUrl) {
        try {
            // 이미지 경로 확인
            const potentialPath1 = path.join(DB_PATHS.images, `${imageId}.png`);
            if (!fs.existsSync(potentialPath1)) {
                // 파일이 없으면 저장
                const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
                fs.writeFileSync(potentialPath1, base64Data, 'base64');
                console.log(`[Main] Saved missing image file: ${potentialPath1}`);
            }
        } catch (err) {
            console.error(`[Main] Failed to save image file: ${err}`);
        }
    }

    const id = db.defects.create({
        imageId: imageId,
        defectType: analysis?.defectType,
        severity: analysis?.severity,
        description: analysis?.description,
        possibleCauses: analysis?.possibleCauses,
        countermeasures: analysis?.countermeasures,
        rawOutput: analysis?.rawOutput,
        status: status,
        isVerified: isVerified,
        knowledgeScope: options?.knowledgeScope || 'diagnostic'
    });

    if (status === 'approved' || isVerified) {
        const record = db.defects.findById(id);
        if (record) {
            db.knowledgeMatrix.upsertFeedbackLearning(record);
        }
    }

    return { success: true, id: id };
});

ipcMain.handle('GET_USER_FEEDBACK', () => {
    const records = db.defects.findAll();
    return records.map(r => ({
        id: r.id,
        imageId: r.image_id,
        analysis: {
            defectType: r.defect_type,
            severity: r.severity,
            description: r.description,
            possibleCauses: r.possible_causes,
            countermeasures: r.countermeasures,
            rawOutput: r.raw_output
        },
        timestamp: r.created_at,
        status: r.status
    }));
    // 기존 형식과 호환되도록 변환
    return records.map(r => ({
        id: r.id,
        imageId: r.image_id,
        analysis: {
            defectType: r.defect_type,
            severity: r.severity,
            description: r.description,
            possibleCauses: r.possible_causes,
            countermeasures: r.countermeasures,
            rawOutput: r.raw_output
        },
        timestamp: r.created_at,
        status: r.status
    }));
});

ipcMain.handle('DELETE_USER_FEEDBACK', (event, id) => {
    return db.defects.delete(id);
});

// === 새 IPC 핸들러: 검색 및 상세 통계 ===

// 결함 기록 검색
ipcMain.handle('SEARCH_DEFECTS', (event, query) => {
    return db.defects.search(query);
});

// 결함 상세 통계
ipcMain.handle('GET_DEFECT_STATS', () => {
    return db.defects.getStats();
});

// 필터 기반 결함 조회
ipcMain.handle('GET_DEFECTS_BY_FILTER', (event, filter) => {
    return db.defects.findAll(filter);
});

// 결함 기록 수정
ipcMain.handle('UPDATE_DEFECT', (event, id, data) => {
    const updated = db.defects.update(id, data);
    if (updated) {
        if (data?.status === 'approved' || data?.isVerified === true) {
            const record = db.defects.findById(id);
            if (record) {
                db.knowledgeMatrix.upsertFeedbackLearning(record);
            }
        } else if (data?.status === 'rejected' || data?.isVerified === false) {
            db.knowledgeMatrix.deleteFeedbackLearning(id);
        }
    }
    return updated;
});

ipcMain.handle('IMPORT_PROCESS_KNOWLEDGE', (event, records) => {
    try {
        const imported = db.knowledgeMatrix.replaceAll(Array.isArray(records) ? records : []);
        return { success: true, imported };
    } catch (error) {
        console.error('IMPORT_PROCESS_KNOWLEDGE failed:', error);
        return { success: false, imported: 0 };
    }
});

ipcMain.handle('GET_PROCESS_KNOWLEDGE', (event, filter = {}) => {
    return db.knowledgeMatrix.getAll(filter || {});
});

// === 레이아웃 관리 IPC ===
ipcMain.handle('GET_REPORT_LAYOUTS', () => {
    return layoutManager.getLayouts();
});

ipcMain.handle('SAVE_REPORT_LAYOUTS', (event, layouts) => {
    return layoutManager.saveLayouts(layouts);
});

// === [New] 검증된 데이터 내보내기 (ZIP) ===
ipcMain.handle('EXPORT_VERIFIED_DATA', async () => {
    try {
        // 1. 검증된 데이터 조회
        const records = db.defects.findAll({ isVerified: true });
        if (!records || records.length === 0) {
            return { success: false, message: '검증된 데이터가 없습니다.' };
        }

        // 2. 저장 경로 선택
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: '검증된 데이터 내보내기',
            defaultPath: `verified_dataset_${Date.now()}.zip`,
            filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
        });

        if (!filePath) return { success: false, message: '저장이 취소되었습니다.' };

        // 3. ZIP 생성
        const zip = new JSZip();
        const imgFolder = zip.folder("images");
        const metadata = [];

        let successCount = 0;
        let failCount = 0;

        for (const record of records) {
            // 이미지 파일 찾기
            // record.image_path가 있으면 그것을 사용, 없으면 DB_PATHS.images에서 id 기반 검색
            let imagePath = record.image_path;
            const imageId = record.image_id;

            // 이미지가 없거나 경로가 잘못된 경우 시도
            if (!imagePath || !fs.existsSync(imagePath)) {
                // 2. Try DB_PATHS.images + image_id
                const potentialPath = path.join(DB_PATHS.images, `${imageId}.png`);
                if (fs.existsSync(potentialPath)) imagePath = potentialPath;
            }

            if (imagePath && fs.existsSync(imagePath)) {
                try {
                    const fileName = path.basename(imagePath);
                    const fileContent = fs.readFileSync(imagePath);
                    imgFolder.file(fileName, fileContent);
                    metadata.push({
                        ...record,
                        image_filename: fileName
                    });
                    successCount++;
                } catch (e) {
                    console.error(`Failed to add file to zip: ${imagePath}`, e);
                }
            } else {
                console.warn(`Image not found for record ${record.id}: ${imagePath}`);
            }
        }

        if (successCount === 0) {
            return { success: false, message: '유효한 이미지 파일이 없습니다.' };
        }

        zip.file("dataset.json", JSON.stringify(metadata, null, 2));
        const content = await zip.generateAsync({ type: "nodebuffer" });
        fs.writeFileSync(filePath, content);

        return {
            success: true,
            count: successCount,
            path: filePath,
            message: `${successCount}개의 데이터가 성공적으로 내보내졌습니다.`
        };

    } catch (e) {
        console.error('Export failed:', e);
        return { success: false, message: `내보내기 실패: ${e.message}` };
    }
});
