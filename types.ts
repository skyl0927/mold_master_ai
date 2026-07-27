

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

export type VisionDecisionStatus = 'probable' | 'needs_review' | 'unclassifiable';

export interface VisionSafetyGateSummary {
  status: 'reliable' | 'needs_review' | 'blocked';
  score: number;
  reasons: string[];
  candidateUsePolicy:
    | 'candidate_primary_graph_cross_check'
    | 'graph_cross_check_only'
    | 'do_not_use_vision_candidate';
  autoGraphCandidateUseAllowed: boolean;
  humanReviewRequired: boolean;
  supportObservationCount: number;
  supportCategoryCount: number;
  topCandidateMargin: number | null;
}
export type VisionObservationCategory =
  | 'color'
  | 'boundary'
  | 'geometry'
  | 'surface'
  | 'location'
  | 'repetition'
  | 'orientation'
  | 'contrast'
  | 'other';

export interface VisionVisualObservation {
  observationId: string;
  category: VisionObservationCategory;
  description: string;
  region: string;
  confidence: number;
  source: 'image';
}

export interface VisionHypothesis {
  defectType: string;
  confidence: number;
  supportingFeatures: string[];
  contradictingFeatures: string[];
  supportingObservationIds: string[];
  contradictingObservationIds: string[];
}

export interface VisionObservationSummary {
  contractVersion: string;
  imageKind: 'physical_product' | 'document_or_diagram' | 'unknown';
  normalityStatus: 'defect_visible' | 'no_defect_visible' | 'uncertain';
  qualityStatus: VisionImageQualityReport['status'];
  visualObservations: VisionVisualObservation[];
  visibleFeatures: string[];
  candidates: VisionHypothesis[];
  primaryCandidate: VisionHypothesis | null;
  requiredAdditionalViews: string[];
  qualityConcerns: string[];
  abstentionReason: string;
  validationIssues: string[];
  groundingStatus: 'grounded' | 'legacy' | 'invalid';
  safetyGate?: VisionSafetyGateSummary;
  decisionStatus: VisionDecisionStatus;
  decisionReason: string;
  fusionSummary?: VisionFusionSummary;
  viewEvidence?: VisionViewEvidence[];
}

export interface VisionFusionCandidateSupport {
  defectType: string;
  fusedConfidence: number;
  supportingViewIds: string[];
  contradictingViewIds: string[];
  supportingViewCount: number;
}

export interface VisionFusionSummary {
  contractVersion: 'vision-fusion/v1';
  requestedViewCount: number;
  validViewCount: number;
  availableViewTags: string[];
  missingRequiredViews: string[];
  disagreementScore: number;
  candidateSupport: VisionFusionCandidateSupport[];
  decisionStatus: VisionDecisionStatus;
  decisionReason: string;
}

export interface VisionViewEvidence {
  viewId: string;
  localImageId?: string;
  serverImageId?: string;
  fileName: string;
  captureViewTag: string;
  isPrimary: boolean;
  observationCount: number;
  topCandidate?: string;
  confidence: number;
  decisionStatus?: VisionDecisionStatus;
}

export interface VisionGraphPathCitation {
  pathId: string;
  documentId: string;
  pathText: string;
  hopCount: number;
  score: number;
  reviewStatus: string;
  evidenceIds: string[];
}

export interface VisionGraphCandidateGrounding {
  defectType: string;
  visionRank: number;
  visionConfidence: number;
  status: 'supported' | 'weak' | 'unverified';
  directMatchScore: number;
  multihopScore: number;
  contextMatchScore: number;
  supportScore: number;
  approvedPathCount: number;
  causes: string[];
  countermeasures: string[];
  citations: VisionGraphPathCitation[];
  rejectedPathReasons: string[];
}

export interface VisionGraphGroundingSummary {
  contractVersion: 'vision-graph-grounding/v1';
  candidateGrounding: VisionGraphCandidateGrounding[];
  graphGrounded: boolean;
  topCandidateSupported: boolean;
  visionGraphConflict: boolean;
  approvedPathCount: number;
  citationCount: number;
  groundedCauses: string[];
  groundedCountermeasures: string[];
  requiresHumanReview: boolean;
  autoFinalizeAllowed: boolean;
  llmSupplementAllowed: boolean;
  llmSupplementTrainingEligible: false;
  decisionStatus: 'grounded' | 'needs_review' | 'unverified';
  decisionReason: string;
}

export interface VisionImageQualityIssue {
  code: string;
  severity: 'warn' | 'reject';
  message: string;
  recommendation: string;
}

export interface VisionImageQualityReport {
  status: 'pass' | 'warn' | 'reject';
  canAnalyze: boolean;
  score: number;
  metrics: {
    width: number;
    height: number;
    megapixels: number;
    meanLuminance: number;
    contrast: number;
    sharpness: number;
    darkRatio: number;
    brightRatio: number;
  };
  issues: VisionImageQualityIssue[];
}

// Industrial Defect Analysis Structure (AI Output)
export interface DefectAnalysis {
  defectType: string;      // e.g., "Flash (Burr)", "Short Shot"
  severity: string;        // e.g., "High", "Medium"
  description: string;     // Visual description of the defect
  possibleCauses: string;  // RAG-based causes
  countermeasures: string; // RAG-based solutions (Mold/Process)
  rawOutput: string;       // Full AI text
  visionSummary?: VisionObservationSummary;
  retrievalSummary?: {
    modeUsed: RetrievalMode;
    citations: string[];
    evidenceCount: number;
    graphTrace?: string[];
    graphGrounded?: boolean;
    llmSupplemented?: boolean;
    graphValidation?: VisionGraphGroundingSummary;
    runtimeVersions?: VisionRuntimeVersionSnapshot;
  };
  orchestrationSummary?: {
    strategy: AiOrchestrationMode;
    selectedSource: 'common_agent' | 'legacy';
    fallbackUsed: boolean;
    selectionReason?: 'strategy_default' | 'richer_vision_contract';
    comparisonId?: string;
    defectTypeAgreement?: boolean;
  };
}

export interface VisionRuntimeVersionSnapshot {
  modelVersion: string;
  promptVersion: string;
  graphVersion: string;
}

export type CaptureViewTag =
  | 'full_part_context'
  | 'defect_closeup'
  | 'oblique_light'
  | 'ejection_location'
  | 'fill_end_context'
  | 'reference_part'
  | 'vent_context'
  | 'parting_line_context'
  | 'edge_profile'
  | 'reverse_geometry'
  | 'flow_convergence_context'
  | 'release_sequence';

export type CaptureImageKind = 'physical_product' | 'document_or_diagram' | 'unknown';
export type CaptureSource = 'camera' | 'screen' | 'file' | 'mobile';

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
  visionQuality?: VisionImageQualityReport;
  commonAgentImageId?: string;
  commonAgentStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  commonAgentLastSyncAt?: number;
  commonAgentAnnotationCount?: number;
  captureSessionId?: string;
  captureViewTag?: CaptureViewTag;
  captureImageKind?: CaptureImageKind;
  captureSource?: CaptureSource;
}

export type ApiProvider = 'gemini' | 'openai';
export type AiOrchestrationMode = 'common_agent_primary' | 'dual_validation' | 'legacy';
export type VisionReferenceBenchmarkGateMode = 'off' | 'shadow' | 'enforce';

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
  visionReferenceBenchmarkGateMode?: VisionReferenceBenchmarkGateMode;
  visionReferenceBenchmarkModelVersion?: string;
  visionReferenceBenchmarkRequiredDefectTypes?: string[];
  visionReferenceBenchmarkMinimumSamples?: number;
  visionReferenceBenchmarkMinimumSamplesPerClass?: number;
  visionReferenceBenchmarkMinimumTop1Accuracy?: number;
  visionReferenceBenchmarkMinimumTop3Accuracy?: number;
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
  schemaVersion?: number;
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
  benchmark?: {
    sampleCount: number;
    passRate: number;
    httpSuccessRate: number;
    classifiableRate: number;
    defectAccuracy: number;
    graphGroundedRate: number;
    captureProtocolReadyRate: number;
  };
  visionReference?: {
    required: boolean;
    status?: string;
    readyForGraphRetrieval: boolean;
    referenceCount: number;
    modelVersion: string;
    provider?: string | null;
    modelName?: string | null;
    dimensions?: number | null;
    device?: string | null;
    runtime?: string | null;
    productionReady?: boolean | null;
    evaluatedCount: number;
    top1Accuracy: number;
    top3Accuracy: number;
    failedGateChecks: string[];
    blockers: Array<{ code: string; detail?: unknown }>;
    recommendedAction?: string;
    artifactGeneratedAt?: string | null;
  };
  visionReferenceBackfill?: {
    required: boolean;
    status: string;
    total: number;
    eligibleReferenceCandidates: number;
    needsHitlBackfill: number;
    blocked: number;
    reasonCounts: Record<string, number>;
    recommendedAction?: string;
    artifactGeneratedAt?: string | null;
  };
  visionReferenceBackfillPostApply?: {
    required: boolean;
    status: string;
    readyForReferenceRefresh: boolean;
    appliedTargets: number;
    verifiedLearningReady: number;
    blockedTargets: number;
    missingFromLearningReadyExport: number;
    blockers: Array<{ code: string; imageId?: string; detail?: unknown }>;
    recommendedAction?: string;
    artifactGeneratedAt?: string | null;
  };
  blockers: Array<{ code: string; count?: number; imageId?: string; detail?: unknown; details?: unknown }>;
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
      top1Accuracy: number;
      top3Accuracy: number;
      selectiveCoverage: number;
      selectiveAccuracy: number;
      abstentionRate: number;
      unsafeAcceptedErrors: number;
      unsafeErrorRate: number;
      reviewCaptureRate: number;
      qualityEligibleRate: number;
      visionContractComplianceRate: number;
      captureProtocolAssessed: number;
      captureProtocolReady: number;
      captureProtocolReadyRate: number;
      minimumCaptureProtocolReadyRate: number;
      captureProtocolStatusCounts: Record<string, number>;
      missingCaptureViews: Array<{
        view: string;
        count: number;
      }>;
      expectedCalibrationError: number;
      brierScore: number;
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
        top3Accurate: number;
        top3Accuracy: number;
        requiredSamples: number;
        covered: boolean;
      }>;
      reliabilityBins: Array<{
        lowerBound: number;
        upperBound: number;
        count: number;
        averageConfidence: number;
        accuracy: number;
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
    licenseVerificationUrl?: string;
    sourceRecordId?: string;
    sourceCitation?: string;
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
