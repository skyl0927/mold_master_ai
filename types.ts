

export interface Point {
  x: number;
  y: number;
}

export interface TextAnnotation {
  id: string;
  text: string;
  textPos: Point;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor?: string;  // 주석 배경색 (선택적, 기본값: 검정 반투명)
  // Arrow removed from TextAnnotation as it is now a Shape
  arrow?: {
    start: Point;
    end: Point;
    width: number;
    color: string;
    style: 'solid' | 'dashed' | 'dotted' | 'dash-dot';
    headStyle: 'arrow' | 'circle' | 'none';
  };
}

export type ShapeTool = 'select' | 'pen' | 'rect' | 'ellipse' | 'blur' | 'step' | 'dimension' | 'line' | 'arrow' | 'image' | 'callout';

export interface Shape {
  id: string;
  tool: ShapeTool;
  color: string;
  lineWidth: number;
  fontSize?: number; // Added for dimension and step text sizing
  points: Point[];
  stepNumber?: number; // Only for 'step' tool
  text?: string; // For dimension tool
  textPos?: Point; // For dimension tool text position
  textColor?: string; // 순번 글자색 (선택적, 기본값: 흰색)
  opacity: number;     // 0 to 1
  style: 'outline' | 'fill'; // For rect/ellipse
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'dash-dot'; // Added for line dash styles
  imageUrl?: string; // For 'image' tool — base64 data URL of the inserted image
  rotation?: number; // radians
}

// Industrial Defect Analysis Structure (AI Output)
export interface DefectAnalysis {
  defectType: string;      // e.g., "Flash (Burr)", "Short Shot"
  severity: string;        // e.g., "High", "Medium"
  description: string;     // Visual description of the defect
  possibleCauses: string;  // RAG-based causes
  countermeasures: string; // RAG-based solutions (Mold/Process)
  rawOutput: string;       // Full AI text
  retrievalSummary?: {
    modeUsed: RetrievalMode;
    citations: string[];
    evidenceCount: number;
    graphTrace?: string[];
    graphGrounded?: boolean;
    llmSupplemented?: boolean;
  };
  orchestrationSummary?: {
    strategy: AiOrchestrationMode;
    selectedSource: 'common_agent' | 'legacy';
    fallbackUsed: boolean;
    comparisonId?: string;
    defectTypeAgreement?: boolean;
  };
}

export interface CapturedImage {
  id: string;
  dataUrl: string;
  baseImageUrl: string;
  annotations: TextAnnotation[];
  shapes?: Shape[];
  phenomenonDescription?: string;
  ocrText?: string;
  analysis?: DefectAnalysis;
  analysisError?: string;
  commonAgentImageId?: string;
  commonAgentStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  commonAgentLastSyncAt?: number;
  commonAgentAnnotationCount?: number;
}

export type ApiProvider = 'gemini' | 'openai';
export type AiOrchestrationMode = 'common_agent_primary' | 'dual_validation' | 'legacy';

export interface ApiConfig {
  provider: ApiProvider;
  aiOrchestrationMode?: AiOrchestrationMode;
  geminiApiKey?: string; // Separated Key
  openAiApiKey?: string; // Separated Key
  apiKey?: string; // Legacy support (deprecated)
  adminPassword?: string; // Admin Mode Password
  proxyUrl?: string;
  shortcut?: string;
  agentServerUrl?: string;
  visionQaServerUrl?: string;
}

export interface DocumentChunk {
  text: string;
  embedding: number[];
  sourceFileName: string;
}

export type RetrievalMode = 'direct' | 'local_rag' | 'remote_rag' | 'hybrid' | 'graph_only';

export interface EvidenceItem {
  id: string;
  sourceType: 'vector' | 'remote_rag' | 'remote_source' | 'graph_node' | 'graph_edge' | 'process_knowledge';
  title?: string;
  content: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface RetrievalResult {
  modeRequested: RetrievalMode;
  modeUsed: RetrievalMode;
  evidence: EvidenceItem[];
  citations: string[];
  remoteAnswer?: string;
}

// --- DATABASE STRUCTURE TYPES ---
export interface DBStats {
  imageCount: number;
  annotationCount?: number;
  metadataCount?: number;
  vectorCount: number;
  knowledgeMatrixCount?: number;
  feedbackCount?: number;
  trainingSetCount: number;
  defectCount?: number;
  defectStats?: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    recentTrend: Array<{ date: string; count: number }>;
  };
}

export interface MigrationGateStatus {
  generatedAt: string;
  services: {
    commonAgent: { online: boolean; url: string; error?: string };
    qaAgent: { online: boolean; url: string; error?: string };
  };
  dataset: {
    total: number;
    reviewStatuses: Record<string, number>;
    error?: string;
  };
  approved: {
    registered: number;
    cleanRunnable: number;
    needsReview: number;
    duplicatesExcluded: number;
    conflictGroups: number;
  };
  hitl: {
    totalCandidates: number;
    highConfidenceAgreements: number;
    resolvedHighConfidence: number;
    unresolvedHighConfidence: number;
    classConflicts: number;
    unclassifiable: number;
    autoApprovalAllowed: false;
  };
  gate: {
    minimumSamples: number;
    additionalCleanApprovalsRequired: number;
    failedChecks: string[];
    missingClassCoverage: Array<{
      defectClass: string;
      current: number;
      required: number;
      missing: number;
    }>;
    canDisableLegacyFallback: boolean;
  };
  blockers: Array<{ code: string; count?: number; detail?: unknown }>;
  recommendedAction: string;
  writesPerformed: false;
}

export interface VisionBenchmarkRunResult {
  completed: boolean;
  gatePassed: boolean;
  reportPath: string;
  gateStatusPath: string;
  gateStatus: MigrationGateStatus;
  benchmarkExitCode: number;
  syncOutput: string;
  benchmarkOutput: string;
  report: {
    generatedAt: string;
    summary: {
      total: number;
      passed: number;
      passRate: number;
      httpSuccessRate: number;
      classifiableRate: number;
      graphGroundedRate: number;
      defectAccuracy: number;
      confidentRate: number;
      observedDefectClasses: number;
      coveredDefectClasses: number;
      requiredDefectClasses: string[];
      minimumSamplesPerClass: number;
      minimumObservedClassAccuracy: number;
      perClass: Array<{
        defectClass: string;
        total: number;
        accurate: number;
        accuracy: number;
        requiredSamples: number;
        covered: boolean;
      }>;
      failedGateChecks: string[];
      readyToDisableLegacyFallback: boolean;
    };
    results?: Array<Record<string, any>>;
  };
}

export interface VisionLabelSuggestion {
  imageId: string;
  defectType: string;
  classifiable: boolean;
  confidence: number;
  modelConfidence: number;
  summary: string;
  possibleCauses: string[];
  recommendedChecks: string[];
  nonPersisting: true;
}

export interface LocalVisionCandidate {
  candidateId: string;
  fileName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  modifiedAt: string;
  contentSha256: string;
  previewDataUrl: string;
  likelyNonManufacturing: boolean;
  alreadyRegistered: boolean;
  proposedDefectType?: string;
  labelProvenance?: string;
  fieldContext?: string;
  labelEvidence?: {
    sourceLabel?: string;
    visionSuggestedLabel?: string;
    visionConfidence?: number;
    visionSummary?: string;
    conflict?: boolean;
    auditedAt?: string;
    nonPersisting?: boolean;
  } | null;
  reviewPriority?: number | null;
  reviewBucket?: string;
  reviewReasons?: string[];
  requiresLabelReconciliation?: boolean;
  reviewDecision?: LocalVisionReviewDecision | null;
  sourceLineage?: {
    reviewSessionId?: string;
    sourceDocumentId?: string;
    documentVersionId?: string;
    documentTitle?: string;
    knowledgeId?: string;
    cardVersion?: string;
    slideNumber?: number;
    figureId?: string;
    evidenceId?: string;
    assetUri?: string;
    sourceContentHash?: string;
    sourceReviewStatus?: string;
    webCaseId?: string;
    sourcePublisher?: string;
    sourceTitle?: string;
    sourceUrl?: string;
    downloadUrl?: string;
    license?: string;
    licenseUrl?: string;
    author?: string;
    retrievedAt?: string;
    evidenceContentSha256?: string;
    packetSourceKind?: string;
    packetSourceRelativePath?: string;
  } | null;
}

export interface LocalVisionReviewDecision {
  contentSha256: string;
  candidateId: string;
  fileName: string;
  decision: 'deferred' | 'excluded';
  reason: string;
  decidedAt: string;
}

export interface LocalVisionCandidateScan {
  rootPath: string;
  candidates: LocalVisionCandidate[];
  summary: {
    discoveredImageFiles: number;
    uniqueCandidates: number;
    duplicatesSkipped: number;
    oversizeSkipped: number;
    invalidSkipped: number;
    existingMatches: number;
    likelyNonManufacturing: number;
    manifestMatched: number;
    manifestHashMismatches: number;
    deferredDecisions?: number;
    excludedDecisions?: number;
    truncated: boolean;
  };
}

export interface LocalVisionCandidateImportResult {
  imageId: string;
  reviewStatus: string;
  proposedDefectType: string;
  persistedToDataset: true;
}

export interface UserFeedbackData {
  id: number;
  imageId: string;
  analysis: DefectAnalysis;
  timestamp: string;
  status: 'approved' | 'pending' | 'rejected'; // RBAC Status
}

export type LearningScope = 'diagnostic' | 'review_event';

export interface SaveUserFeedbackOptions {
  knowledgeScope?: LearningScope;
}

export interface ProcessKnowledgeRecord {
  id?: number;
  sourceSheet: string;
  sourceRow?: number;
  productGroup: string;
  processGroup: string;
  issueFamily: string;
  issueName: string;
  symptomText?: string;
  causeHypotheses?: string;
  countermeasureText?: string;
  designChecks?: string;
  machiningChecks?: string;
  assemblyChecks?: string;
  measurementChecks?: string;
  trialChecks?: string;
  commonActions?: string;
  learningSource?: string;
  feedbackRecordId?: number;
  rawJson?: string;
}

export interface MobileConnectionData {
  url: string;
  token: string;
  ip: string;
  port: number;
  availableIps: string[];
  qrCode: string;
}

export interface WebKnowledgeEvidence {
  publisher: string;
  title: string;
  sourceUrl: string;
  localFile?: string;
  license?: string;
  licenseUrl?: string;
  contentSha256: string;
  pageNumber?: number;
}

export interface WebKnowledgeCard {
  caseId: string;
  sourceKind: 'technical_guide' | 'licensed_image';
  defectName: string;
  defectClass: string;
  problem: string;
  phenomenon: string;
  causes: Array<{ text: string; actions: string[] }>;
  checkItems: string[];
  actions: string[];
  evidence: WebKnowledgeEvidence[];
  metadata?: Record<string, unknown>;
}

export interface WebKnowledgeReviewRecord {
  caseId: string;
  sourceContentSha256: string;
  decision: 'approved' | 'needs_changes' | 'rejected';
  reviewer: string;
  reviewerComment: string;
  defectName: string;
  problem: string;
  phenomenon: string;
  causeCandidates: string[];
  causeLabels: string[];
  checkItems: string[];
  actions: string[];
  reviewedAt: string;
  isCurrent: boolean;
}

export interface WebKnowledgeReviewQueueItem {
  card: WebKnowledgeCard;
  sourceContentSha256: string;
  decision: 'pending' | 'approved' | 'needs_changes' | 'rejected';
  isCurrent: boolean;
  review: WebKnowledgeReviewRecord | null;
  suggestedCauseLabels: string[];
  suggestedCheckItems: string[];
  suggestedActions: string[];
  centralIngestion: {
    documentId: string;
    status: string;
    ingestedAt: string;
    centralReviewStatus?: string;
    centralApprovedAt?: string;
  } | null;
}

export interface WebKnowledgeReviewQueue {
  rootPath: string;
  integrity: {
    valid: boolean;
    cardCount: number;
    verifiedImages: number;
  };
  summary: {
    total: number;
    pending: number;
    approved: number;
    needsChanges: number;
    rejected: number;
    stale: number;
  };
  queue: WebKnowledgeReviewQueueItem[];
}

export interface IElectronAPI {
  startCaptureSession: () => Promise<void>;
  initiateRegionCapture: () => void;
  cancelCapture: () => void;
  regionCaptured: (dataUrl: string) => void;
    getCaptureData: () => Promise<{ dataUrl: string; scaleFactor: number; sourceId?: string } | null>;

    // NEW: Main Process-based capture logic
    performRegionCapture: (rect: { x: number, y: number, width: number, height: number }) => Promise<void>;
    debugCapturePointer: (payload: Record<string, unknown>) => Promise<void>;

  // Events - Updated to return cleanup function
  onSetScreenshotUrl: (callback: (payload: { dataUrl: string; scaleFactor: number }) => void) => () => void;
  onShowAnnotationEditor: (callback: (dataUrl: string) => void) => () => void;
  onCaptureSessionEnded: (callback: () => void) => () => void;

  getApiConfig: () => Promise<ApiConfig | null>;
  setApiConfig: (config: ApiConfig) => Promise<void>;
  runVisionBenchmark: () => Promise<VisionBenchmarkRunResult>;
  suggestVisionLabel: (
    imageId: string,
    context?: { currentLabel?: string; question?: string }
  ) => Promise<VisionLabelSuggestion>;
    scanLocalVisionCandidates: (existingHashes: string[]) => Promise<LocalVisionCandidateScan | null>;
    scanPreparedVisionReviewPacket: (existingHashes: string[]) => Promise<LocalVisionCandidateScan>;
    getLocalVisionCandidateImage: (candidateId: string) => Promise<{
      dataUrl: string;
      width: number;
      height: number;
      mimeType: string;
      contentSha256: string;
    }>;
    suggestLocalVisionLabel: (
    candidateId: string,
    context?: { currentLabel?: string; question?: string }
  ) => Promise<VisionLabelSuggestion>;
  importLocalVisionCandidate: (
    candidateId: string,
    input: { defectType: string; question?: string; labelReconciled?: boolean }
  ) => Promise<LocalVisionCandidateImportResult>;
  setLocalVisionReviewDecision: (
    candidateId: string,
    input: {
      decision: 'deferred' | 'excluded' | 'clear';
      reason?: string;
    }
  ) => Promise<LocalVisionReviewDecision | null>;
  getWebKnowledgeReviewQueue: () => Promise<WebKnowledgeReviewQueue>;
  getWebKnowledgeCardImage: (caseId: string) => Promise<{
    dataUrl: string;
    contentSha256: string;
    title: string;
    license: string;
    sourceUrl: string;
  } | null>;
  setWebKnowledgeReview: (
    caseId: string,
    input: {
      decision: 'approved' | 'needs_changes' | 'rejected' | 'clear';
      confirmed?: boolean;
      sourceContentSha256?: string;
      reviewer?: string;
      reviewerComment?: string;
      defectName?: string;
      problem?: string;
      phenomenon?: string;
      causeCandidates?: string[];
      causeLabels?: string[];
      checkItems?: string[];
      actions?: string[];
    }
  ) => Promise<WebKnowledgeReviewRecord | null>;
  validateWebKnowledgeCard: (caseId: string) => Promise<Record<string, any>>;
  ingestWebKnowledgeCard: (caseId: string) => Promise<Record<string, any>>;
  approveWebKnowledgeCard: (
    caseId: string,
    input: {
      confirmed: boolean;
      reviewer: string;
      reviewerComment: string;
    }
  ) => Promise<Record<string, any>>;
  testWebKnowledgeRoundtrip: (caseId: string) => Promise<{
    passed: boolean;
    caseId: string;
    documentId: string;
    answer: string;
    confidence: number;
    evidence: Array<Record<string, any>>;
    reasoningTrace: string[];
    checks: Record<string, boolean>;
  }>;
  readFileContents: () => Promise<Array<{ name: string; content: Uint8Array }> | null>;

  // Vector Store (Legacy/Compat)
  getVectorStore: () => Promise<DocumentChunk[]>;

  // --- NEW DATABASE APIs ---
  getDBStats: () => Promise<DBStats>;
  saveUserFeedback: (analysis: DefectAnalysis, imageId: string, status?: 'approved' | 'pending' | 'rejected', isVerified?: boolean, dataUrl?: string, options?: SaveUserFeedbackOptions) => Promise<{ success: boolean; id?: number; message?: string }>;
  getUserFeedback: () => Promise<UserFeedbackData[]>;
  deleteUserFeedback: (id: number) => Promise<void>;
  exportVerifiedData: () => Promise<{ success: boolean; count: number; path?: string; message?: string }>;
  // --- SQLite 검색/통계 APIs ---
  searchDefects: (query: string) => Promise<any[]>;
  getDefectStats: () => Promise<any>;
  getDefectsByFilter: (filter: any) => Promise<any[]>;
  updateDefect: (id: number, data: any) => Promise<boolean>;
  importProcessKnowledge: (records: ProcessKnowledgeRecord[]) => Promise<{ success: boolean; imported: number }>;
  getProcessKnowledge: (filter?: Partial<ProcessKnowledgeRecord>) => Promise<ProcessKnowledgeRecord[]>;

  // --- Layouts ---
  getReportLayouts: () => Promise<any[]>;
  saveReportLayouts: (layouts: any[]) => Promise<boolean>;

  // --- MOBILE CONNECTIVITY ---
  startMobileServer: (port?: number) => Promise<MobileConnectionData | null>;
  generateQrCode: (url: string) => Promise<string>;

  // Events - Updated to return cleanup function
  onMobileUploadSuccess: (callback: (payload: { filename: string; dataUrl: string }) => void) => () => void;
  onMobileConnectAttempt: (callback: (payload: { ip: string }) => void) => () => void;

}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
