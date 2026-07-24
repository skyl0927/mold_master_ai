

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Main App to Main Process
    startCaptureSession: () => ipcRenderer.invoke('START_CAPTURE_SESSION'),

    // Toolbar to Main Process
    initiateRegionCapture: () => ipcRenderer.invoke('INITIATE_REGION_CAPTURE'),
    cancelCapture: () => ipcRenderer.invoke('CANCEL_CAPTURE'),

    // Overlay to Main Process
    getCaptureData: () => ipcRenderer.invoke('GET_CAPTURE_DATA'),
    regionCaptured: (dataUrl) => ipcRenderer.invoke('REGION_CAPTURED', dataUrl),
    performRegionCapture: (rect) => ipcRenderer.invoke('PERFORM_REGION_CAPTURE', rect),
    debugCapturePointer: (payload) => ipcRenderer.invoke('DEBUG_CAPTURE_POINTER', payload),

    getApiConfig: () => ipcRenderer.invoke('GET_API_CONFIG'),
    setApiConfig: (config) => ipcRenderer.invoke('SET_API_CONFIG', config),
    runVisionBenchmark: () => ipcRenderer.invoke('RUN_VISION_BENCHMARK'),
    suggestVisionLabel: (imageId, context) => ipcRenderer.invoke('SUGGEST_VISION_LABEL', imageId, context),
    scanLocalVisionCandidates: (existingHashes) => ipcRenderer.invoke('SCAN_LOCAL_VISION_CANDIDATES', existingHashes),
    scanPreparedVisionReviewPacket: (existingHashes) => ipcRenderer.invoke('SCAN_PREPARED_VISION_REVIEW_PACKET', existingHashes),
    getLocalVisionCandidateImage: (candidateId) => ipcRenderer.invoke('GET_LOCAL_VISION_CANDIDATE_IMAGE', candidateId),
    suggestLocalVisionLabel: (candidateId, context) => ipcRenderer.invoke('SUGGEST_LOCAL_VISION_LABEL', candidateId, context),
    importLocalVisionCandidate: (candidateId, input) => ipcRenderer.invoke('IMPORT_LOCAL_VISION_CANDIDATE', candidateId, input),
    setLocalVisionReviewDecision: (candidateId, input) => ipcRenderer.invoke('SET_LOCAL_VISION_REVIEW_DECISION', candidateId, input),
    getWebKnowledgeReviewQueue: () => ipcRenderer.invoke('GET_WEB_KNOWLEDGE_REVIEW_QUEUE'),
    getWebKnowledgeCardImage: (caseId) => ipcRenderer.invoke('GET_WEB_KNOWLEDGE_CARD_IMAGE', caseId),
    setWebKnowledgeReview: (caseId, input) => ipcRenderer.invoke('SET_WEB_KNOWLEDGE_REVIEW', caseId, input),
    validateWebKnowledgeCard: (caseId) => ipcRenderer.invoke('VALIDATE_WEB_KNOWLEDGE_CARD', caseId),
    ingestWebKnowledgeCard: (caseId) => ipcRenderer.invoke('INGEST_WEB_KNOWLEDGE_CARD', caseId),
    approveWebKnowledgeCard: (caseId, input) => ipcRenderer.invoke('APPROVE_WEB_KNOWLEDGE_CARD', caseId, input),
    testWebKnowledgeRoundtrip: (caseId) => ipcRenderer.invoke('TEST_WEB_KNOWLEDGE_ROUNDTRIP', caseId),
    readFileContents: () => ipcRenderer.invoke('READ_FILE_CONTENTS'),

    // Vector Store
    getVectorStore: () => ipcRenderer.invoke('GET_VECTOR_STORE'),

    // Database & Training
    getDBStats: () => ipcRenderer.invoke('GET_DB_STATS'),
    saveUserFeedback: (analysis, imageId, status, isVerified, dataUrl, options) => ipcRenderer.invoke('SAVE_USER_FEEDBACK', analysis, imageId, status, isVerified, dataUrl, options),
    getUserFeedback: () => ipcRenderer.invoke('GET_USER_FEEDBACK'),
    deleteUserFeedback: (id) => ipcRenderer.invoke('DELETE_USER_FEEDBACK', id),
    exportVerifiedData: () => ipcRenderer.invoke('EXPORT_VERIFIED_DATA'),
    // SQLite 검색/통계 (새 기능)
    searchDefects: (query) => ipcRenderer.invoke('SEARCH_DEFECTS', query),
    getDefectStats: () => ipcRenderer.invoke('GET_DEFECT_STATS'),
    getDefectsByFilter: (filter) => ipcRenderer.invoke('GET_DEFECTS_BY_FILTER', filter),
    updateDefect: (id, data) => ipcRenderer.invoke('UPDATE_DEFECT', id, data),
    importProcessKnowledge: (records) => ipcRenderer.invoke('IMPORT_PROCESS_KNOWLEDGE', records),
    getProcessKnowledge: (filter) => ipcRenderer.invoke('GET_PROCESS_KNOWLEDGE', filter),


    // Layouts
    getReportLayouts: () => ipcRenderer.invoke('GET_REPORT_LAYOUTS'),
    saveReportLayouts: (layouts) => ipcRenderer.invoke('SAVE_REPORT_LAYOUTS', layouts),

    // Mobile Connectivity
    startMobileServer: (port) => ipcRenderer.invoke('START_MOBILE_SERVER', port),

    generateQrCode: (url) => ipcRenderer.invoke('GENERATE_QR_CODE', url),

    // Events - Returning Cleanup Functions
    onSetScreenshotUrl: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('SET_SCREENSHOT_URL', subscription);
        return () => ipcRenderer.removeListener('SET_SCREENSHOT_URL', subscription);
    },
    onShowAnnotationEditor: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('SHOW_ANNOTATION_EDITOR', subscription);
        return () => ipcRenderer.removeListener('SHOW_ANNOTATION_EDITOR', subscription);
    },
    onCaptureSessionEnded: (callback) => {
        const subscription = (_event, value) => callback();
        ipcRenderer.on('CAPTURE_SESSION_ENDED', subscription);
        return () => ipcRenderer.removeListener('CAPTURE_SESSION_ENDED', subscription);
    },
    onMobileUploadSuccess: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('MOBILE_UPLOAD_SUCCESS', subscription);
        return () => ipcRenderer.removeListener('MOBILE_UPLOAD_SUCCESS', subscription);
    },
    onMobileConnectAttempt: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('MOBILE_CONNECT_ATTEMPT', subscription);
        return () => ipcRenderer.removeListener('MOBILE_CONNECT_ATTEMPT', subscription);
    },
});
