

import React, { useState, useEffect } from 'react';
import {
  AiOrchestrationMode,
  ApiProvider,
  ApiConfig,
  VisionReferenceBenchmarkGateMode
} from '../types';
import { CloseIcon, SaveIcon, InfoIcon, LockIcon } from './Icons';
import { DEFAULT_AGENT_SERVER_URL } from '../services/runtimeConfig';
import {
  calculateDiagnosisObservability,
  calculateTransitionReadiness,
  buildDiagnosisVisionReviewPacket,
  clearDiagnosisComparisons,
  readDiagnosisComparisons
} from '../services/commonAgentGateway';
import { migrateLocalProcessKnowledge } from '../services/processKnowledgeMigrationService';
import { CommonAgentApiService } from '../services/commonAgentApiService';
import {
  calculateVisionDatasetReadiness,
  VisionDatasetReadiness
} from '../services/visionDatasetReadinessService';
import { DEFECT_CLASS_LABELS } from '../shared/defect-taxonomy';
import {
  auditVisionOperationalEvidenceAlignment,
  attachVisionOperationalOperatorDecision,
  parseVisionOperationalReleaseReport,
  readVisionOperationalReleaseHistory,
  readVisionOperationalReleaseReport,
  saveVisionOperationalReleaseReport,
  summarizeVisionOperationalReleaseHistory,
  summarizeVisionOperationalReleaseTrend,
  VisionOperationalDecisionAction,
  VisionOperationalReleaseHistoryStatus,
  VisionOperationalReleaseReport
} from '../services/visionOperationalReleaseGate';
import { buildVisionOperationalBlockerWorklist } from '../visionOperationalBlockerWorklist';
import {
  summarizeVisionOperationalHitlWorkflowDisplay,
  summarizeVisionOperationalLabelConflictWorkflowDisplay,
  summarizeOperationalHitlActionPackDisplay,
  summarizeOperationalHitlPipelineStatusDisplay,
  summarizeOperationalHitlWorktableSuggestionDisplay,
  summarizeOperationalHitlReviewSessionPlanDisplay,
  summarizeOperationalHitlReviewSessionPacketDisplay,
  summarizeOperationalHitlHumanDecisionBriefDisplay,
  summarizeMoldMasterDevelopmentProgressDisplay,
  summarizeOperationalStatusBundleDisplay
} from '../visionOperationalHitlWorkflowDisplay';
import {
  extractRestorableStatusBundleArtifacts
} from '../operationalStatusBundle';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (config: ApiConfig) => void;
  initialConfig: ApiConfig | null;
}

const releaseDecisionLabel = (
  report: VisionOperationalReleaseReport | null
): string => {
  if (!report) return 'Shadow 평가 보고서 필요';
  return report.decisionCard.title;
};

const releaseActionLabel = (
  action: VisionOperationalDecisionAction
): string => {
  if (action === 'activate_candidate') return '후보 버전 활성화';
  if (action === 'restore_baseline_snapshot') return '기준 버전 복원';
  return 'Shadow 유지 및 데이터 보강';
};

const releaseHistoryStatusLabel = (
  status: VisionOperationalReleaseHistoryStatus
): string => {
  if (status === 'blocked_missing_evidence') return '운영 근거 보강 필요';
  if (status === 'awaiting_operator_decision') return '작업자 승인 대기';
  if (status === 'confirmed') return '운영 조치 확인 완료';
  return '이력 없음';
};

const releaseEvidenceKindLabel = (kind: string): string => {
  if (kind === 'baseline_benchmark') return 'Baseline benchmark';
  if (kind === 'candidate_benchmark') return 'Candidate benchmark';
  if (kind === 'release_config') return 'Release config';
  if (kind === 'release_report') return 'Release report';
  if (kind === 'common_agent_dataset_export') return 'Common Agent export';
  if (kind === 'common_agent_review_packet') return 'Common Agent review';
  if (kind === 'graph_snapshot') return 'Graph snapshot';
  if (kind === 'graph_release_evidence') return 'Graph evidence';
  return kind;
};

const VISION_OPERATIONAL_READINESS_AUDIT_STORAGE_KEY =
  'mold-master-ai:vision-operational-readiness-audit:v1';
const OPERATIONAL_HITL_ACTION_PACK_STORAGE_KEY =
  'mold-master-ai:operational-hitl-action-pack:v1';
const OPERATIONAL_HITL_PIPELINE_STATUS_STORAGE_KEY =
  'mold-master-ai:operational-hitl-pipeline-status:v1';
const OPERATIONAL_HITL_WORKTABLE_SUGGESTION_STORAGE_KEY =
  'mold-master-ai:operational-hitl-worktable-suggestion:v1';
const OPERATIONAL_HITL_REVIEW_SESSION_PLAN_STORAGE_KEY =
  'mold-master-ai:operational-hitl-review-session-plan:v1';
const OPERATIONAL_HITL_REVIEW_SESSION_PACKET_STORAGE_KEY =
  'mold-master-ai:operational-hitl-review-session-packet:v1';
const OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_STORAGE_KEY =
  'mold-master-ai:operational-hitl-human-decision-brief:v1';
const OPERATIONAL_LABEL_CONFLICT_REVIEW_GUIDE_STORAGE_KEY =
  'mold-master-ai:vision-approved-label-conflict-review-guide:v1';
const OPERATIONAL_WEB_KNOWLEDGE_COMMON_AGENT_PACKAGE_STORAGE_KEY =
  'mold-master-ai:web-knowledge-common-agent-learning-package:v1';
const MOLD_MASTER_DEVELOPMENT_PROGRESS_STORAGE_KEY =
  'mold-master-ai:development-progress:v1';
const OPERATIONAL_STATUS_BUNDLE_STORAGE_KEY =
  'mold-master-ai:operational-status-bundle:v1';

const readOperationalReadinessAudit = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(VISION_OPERATIONAL_READINESS_AUDIT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'vision-operational-readiness-audit/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalReadinessAudit = (audit: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(VISION_OPERATIONAL_READINESS_AUDIT_STORAGE_KEY, JSON.stringify(audit));
};

const readOperationalHitlActionPack = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_ACTION_PACK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-action-pack/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlActionPack = (actionPack: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_ACTION_PACK_STORAGE_KEY, JSON.stringify(actionPack));
};

const readOperationalHitlPipelineStatus = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_PIPELINE_STATUS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-pipeline-status/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlPipelineStatus = (pipelineStatus: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_PIPELINE_STATUS_STORAGE_KEY, JSON.stringify(pipelineStatus));
};

const readOperationalHitlWorktableSuggestion = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_WORKTABLE_SUGGESTION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-decision-worktable-suggestion/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlWorktableSuggestion = (suggestion: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_WORKTABLE_SUGGESTION_STORAGE_KEY, JSON.stringify(suggestion));
};

const readOperationalHitlReviewSessionPlan = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_REVIEW_SESSION_PLAN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-review-session-plan/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlReviewSessionPlan = (sessionPlan: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_REVIEW_SESSION_PLAN_STORAGE_KEY, JSON.stringify(sessionPlan));
};

const readOperationalHitlReviewSessionPacket = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_REVIEW_SESSION_PACKET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-review-session-packet/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlReviewSessionPacket = (sessionPacket: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_REVIEW_SESSION_PACKET_STORAGE_KEY, JSON.stringify(sessionPacket));
};

const readOperationalHitlHumanDecisionBrief = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-hitl-human-decision-brief/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalHitlHumanDecisionBrief = (brief: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_HITL_HUMAN_DECISION_BRIEF_STORAGE_KEY, JSON.stringify(brief));
};

const saveOperationalLabelConflictReviewGuide = (guide: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_LABEL_CONFLICT_REVIEW_GUIDE_STORAGE_KEY, JSON.stringify(guide));
};

const readOperationalWebKnowledgeCommonAgentPackage = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_WEB_KNOWLEDGE_COMMON_AGENT_PACKAGE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'web-knowledge-common-agent-learning-package/v1'
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const saveOperationalWebKnowledgeCommonAgentPackage = (learningPackage: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    OPERATIONAL_WEB_KNOWLEDGE_COMMON_AGENT_PACKAGE_STORAGE_KEY,
    JSON.stringify(learningPackage)
  );
};

const readMoldMasterDevelopmentProgress = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(MOLD_MASTER_DEVELOPMENT_PROGRESS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'mold-master-development-progress-report/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveMoldMasterDevelopmentProgress = (report: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(MOLD_MASTER_DEVELOPMENT_PROGRESS_STORAGE_KEY, JSON.stringify(report));
};

const readOperationalStatusBundle = (): any | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OPERATIONAL_STATUS_BUNDLE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contractVersion === 'operational-status-bundle/v1' ? parsed : null;
  } catch {
    return null;
  }
};

const saveOperationalStatusBundle = (bundle: any): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OPERATIONAL_STATUS_BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
};

const operationalWorklistStatusLabel = (status: string): string => {
  if (status === 'ready') return '수동 활성화 준비 완료';
  if (status === 'waiting_for_operator') return '운영 담당자 승인 대기';
  if (status === 'action_required') return '차단 작업 필요';
  if (status === 'missing_audit') return '최종 감사 보고서 필요';
  return status;
};

const optionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const optionalCsv = (value: string): string[] | undefined => {
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
};

const visionDecisionStatusLabel = (status: string): string => {
  if (status === 'probable') return '확정 후보';
  if (status === 'needs_review') return '보류';
  if (status === 'unclassifiable') return '판정불가';
  return status;
};

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, initialConfig }) => {
  const [provider, setProvider] = useState<ApiProvider>(initialConfig?.provider || 'gemini');
  const [aiOrchestrationMode, setAiOrchestrationMode] = useState<AiOrchestrationMode>(
    initialConfig?.aiOrchestrationMode || 'dual_validation'
  );
  // Manage separate states for each provider
  const [geminiKey, setGeminiKey] = useState(initialConfig?.geminiApiKey || initialConfig?.apiKey || '');
  const [openAiKey, setOpenAiKey] = useState(initialConfig?.openAiApiKey || '');

  const [proxyUrl, setProxyUrl] = useState(initialConfig?.proxyUrl || '');
  const [shortcut, setShortcut] = useState(initialConfig?.shortcut || 'CommandOrControl+Shift+C');
  const [agentServerUrl, setAgentServerUrl] = useState(initialConfig?.agentServerUrl || '');
  const [visionQaServerUrl, setVisionQaServerUrl] = useState(initialConfig?.visionQaServerUrl || '');
  const [visionReferenceBenchmarkGateMode, setVisionReferenceBenchmarkGateMode] =
    useState<VisionReferenceBenchmarkGateMode>(
      initialConfig?.visionReferenceBenchmarkGateMode || 'off'
    );
  const [visionReferenceBenchmarkModelVersion, setVisionReferenceBenchmarkModelVersion] =
    useState(initialConfig?.visionReferenceBenchmarkModelVersion || '');
  const [visionReferenceBenchmarkRequiredDefectTypes, setVisionReferenceBenchmarkRequiredDefectTypes] =
    useState(initialConfig?.visionReferenceBenchmarkRequiredDefectTypes?.join(', ') || '');
  const [visionReferenceBenchmarkMinimumSamples, setVisionReferenceBenchmarkMinimumSamples] =
    useState(
      initialConfig?.visionReferenceBenchmarkMinimumSamples === undefined
        ? ''
        : String(initialConfig.visionReferenceBenchmarkMinimumSamples)
    );
  const [visionReferenceBenchmarkMinimumSamplesPerClass, setVisionReferenceBenchmarkMinimumSamplesPerClass] =
    useState(
      initialConfig?.visionReferenceBenchmarkMinimumSamplesPerClass === undefined
        ? ''
        : String(initialConfig.visionReferenceBenchmarkMinimumSamplesPerClass)
    );
  const [visionReferenceBenchmarkMinimumTop1Accuracy, setVisionReferenceBenchmarkMinimumTop1Accuracy] =
    useState(
      initialConfig?.visionReferenceBenchmarkMinimumTop1Accuracy === undefined
        ? ''
        : String(initialConfig.visionReferenceBenchmarkMinimumTop1Accuracy)
    );
  const [visionReferenceBenchmarkMinimumTop3Accuracy, setVisionReferenceBenchmarkMinimumTop3Accuracy] =
    useState(
      initialConfig?.visionReferenceBenchmarkMinimumTop3Accuracy === undefined
        ? ''
        : String(initialConfig.visionReferenceBenchmarkMinimumTop3Accuracy)
    );
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [transitionReadiness, setTransitionReadiness] = useState(() =>
    calculateTransitionReadiness(readDiagnosisComparisons())
  );
  const [diagnosisObservability, setDiagnosisObservability] = useState(() =>
    calculateDiagnosisObservability(readDiagnosisComparisons())
  );
  const [operationalRelease, setOperationalRelease] = useState(
    () => readVisionOperationalReleaseReport()
  );
  const [operationalReleaseHistory, setOperationalReleaseHistory] = useState(
    () => readVisionOperationalReleaseHistory()
  );
  const operationalReleaseHistorySummary =
    summarizeVisionOperationalReleaseHistory(operationalReleaseHistory);
  const operationalReleaseTrend =
    summarizeVisionOperationalReleaseTrend(operationalReleaseHistory);
  const operationalEvidenceAlignment = operationalRelease
    ? auditVisionOperationalEvidenceAlignment(operationalRelease)
    : null;
  const [operationalReadinessAudit, setOperationalReadinessAudit] = useState(
    () => readOperationalReadinessAudit()
  );
  const [operationalHitlActionPack, setOperationalHitlActionPack] = useState(
    () => readOperationalHitlActionPack()
  );
  const [operationalHitlPipelineStatus, setOperationalHitlPipelineStatus] = useState(
    () => readOperationalHitlPipelineStatus()
  );
  const [operationalHitlWorktableSuggestion, setOperationalHitlWorktableSuggestion] = useState(
    () => readOperationalHitlWorktableSuggestion()
  );
  const [operationalHitlReviewSessionPlan, setOperationalHitlReviewSessionPlan] = useState(
    () => readOperationalHitlReviewSessionPlan()
  );
  const [operationalHitlReviewSessionPacket, setOperationalHitlReviewSessionPacket] = useState(
    () => readOperationalHitlReviewSessionPacket()
  );
  const [operationalHitlHumanDecisionBrief, setOperationalHitlHumanDecisionBrief] = useState(
    () => readOperationalHitlHumanDecisionBrief()
  );
  const [operationalWebKnowledgeCommonAgentPackage, setOperationalWebKnowledgeCommonAgentPackage] = useState(
    () => readOperationalWebKnowledgeCommonAgentPackage()
  );
  const [moldMasterDevelopmentProgress, setMoldMasterDevelopmentProgress] = useState(
    () => readMoldMasterDevelopmentProgress()
  );
  const [operationalStatusBundle, setOperationalStatusBundle] = useState(
    () => readOperationalStatusBundle()
  );
  const operationalBlockerWorklist = buildVisionOperationalBlockerWorklist({
    readinessAudit: operationalReadinessAudit
  });
  const operationalHitlWorkflowDisplay =
    summarizeVisionOperationalHitlWorkflowDisplay(operationalBlockerWorklist);
  const operationalLabelConflictWorkflowDisplay =
    summarizeVisionOperationalLabelConflictWorkflowDisplay(operationalBlockerWorklist);
  const operationalHitlActionPackDisplay =
    summarizeOperationalHitlActionPackDisplay(operationalHitlActionPack);
  const operationalHitlPipelineStatusDisplay =
    summarizeOperationalHitlPipelineStatusDisplay(operationalHitlPipelineStatus);
  const operationalHitlWorktableSuggestionDisplay =
    summarizeOperationalHitlWorktableSuggestionDisplay(operationalHitlWorktableSuggestion);
  const operationalHitlReviewSessionPlanDisplay =
    summarizeOperationalHitlReviewSessionPlanDisplay(operationalHitlReviewSessionPlan);
  const operationalHitlReviewSessionPacketDisplay =
    summarizeOperationalHitlReviewSessionPacketDisplay(operationalHitlReviewSessionPacket);
  const operationalHitlHumanDecisionBriefDisplay =
    summarizeOperationalHitlHumanDecisionBriefDisplay(operationalHitlHumanDecisionBrief);
  const moldMasterDevelopmentProgressDisplay =
    summarizeMoldMasterDevelopmentProgressDisplay(moldMasterDevelopmentProgress);
  const operationalStatusBundleDisplay =
    summarizeOperationalStatusBundleDisplay(operationalStatusBundle);
  const operationalWebKnowledgeCommonAgentPackageSummary =
    operationalWebKnowledgeCommonAgentPackage?.summary || {};
  const [releaseImportStatus, setReleaseImportStatus] = useState('');
  const [operationalAuditImportStatus, setOperationalAuditImportStatus] = useState('');
  const [operationalHitlActionPackImportStatus, setOperationalHitlActionPackImportStatus] = useState('');
  const [operationalHitlPipelineStatusImportStatus, setOperationalHitlPipelineStatusImportStatus] = useState('');
  const [operationalHitlWorktableSuggestionImportStatus, setOperationalHitlWorktableSuggestionImportStatus] = useState('');
  const [operationalHitlReviewSessionPlanImportStatus, setOperationalHitlReviewSessionPlanImportStatus] = useState('');
  const [operationalHitlReviewSessionPacketImportStatus, setOperationalHitlReviewSessionPacketImportStatus] = useState('');
  const [operationalHitlHumanDecisionBriefImportStatus, setOperationalHitlHumanDecisionBriefImportStatus] = useState('');
  const [operationalWebKnowledgeCommonAgentPackageImportStatus, setOperationalWebKnowledgeCommonAgentPackageImportStatus] = useState('');
  const [moldMasterDevelopmentProgressImportStatus, setMoldMasterDevelopmentProgressImportStatus] = useState('');
  const [operationalStatusBundleImportStatus, setOperationalStatusBundleImportStatus] = useState('');
  const [releaseOperator, setReleaseOperator] = useState('');
  const [releaseOperatorComment, setReleaseOperatorComment] = useState('');
  const [isMigratingKnowledge, setIsMigratingKnowledge] = useState(false);
  const [knowledgeMigrationStatus, setKnowledgeMigrationStatus] = useState('');
  const [visionReadiness, setVisionReadiness] = useState<VisionDatasetReadiness | null>(null);
  const [isLoadingVisionReadiness, setIsLoadingVisionReadiness] = useState(false);
  const [visionReadinessError, setVisionReadinessError] = useState('');

  // Admin Password
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');

  // Fallback: If OpenAI key is missing but legacy apiKey exists and provider was OpenAI, use legacy
  useEffect(() => {
    if (initialConfig?.apiKey && !initialConfig.openAiApiKey && initialConfig.provider === 'openai') {
        setOpenAiKey(initialConfig.apiKey);
    }
  }, [initialConfig]);

  const refreshVisionReadiness = async () => {
    setIsLoadingVisionReadiness(true);
    setVisionReadinessError('');
    try {
      const items = await CommonAgentApiService.loadImageDatasetsWithContentHashes();
      setVisionReadiness(calculateVisionDatasetReadiness(items));
    } catch (error) {
      setVisionReadinessError(
        error instanceof Error ? error.message : 'Vision 데이터셋 조회 실패'
      );
    } finally {
      setIsLoadingVisionReadiness(false);
    }
  };

  useEffect(() => {
    if (aiOrchestrationMode !== 'legacy') void refreshVisionReadiness();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toUpperCase();
    if (['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key)) return;

    const modifiers = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');

    if (modifiers.length === 0 && !key.startsWith('F')) return;

    const finalShortcut = [...modifiers, key].join('+');
    setShortcut(finalShortcut);
    setIsRecording(false);
  };

  const handleSave = () => {
    // Validate current provider's key
    const currentKey = provider === 'gemini' ? geminiKey : openAiKey;
    if (aiOrchestrationMode === 'legacy' && !currentKey) {
        setStatus(`${provider === 'gemini' ? 'Gemini' : 'OpenAI'} API Key를 입력해주세요.`);
        return;
    }

    if (newAdminPassword && newAdminPassword !== confirmAdminPassword) {
        setStatus('새 관리자 비밀번호가 일치하지 않습니다.');
        return;
    }

    const newConfig: ApiConfig = {
        provider,
        aiOrchestrationMode,
        geminiApiKey: geminiKey,
        openAiApiKey: openAiKey,
        proxyUrl,
        shortcut,
        agentServerUrl,
        visionQaServerUrl,
        visionReferenceBenchmarkGateMode,
        visionReferenceBenchmarkModelVersion: visionReferenceBenchmarkModelVersion.trim() || undefined,
        visionReferenceBenchmarkRequiredDefectTypes: optionalCsv(visionReferenceBenchmarkRequiredDefectTypes),
        visionReferenceBenchmarkMinimumSamples: optionalNumber(visionReferenceBenchmarkMinimumSamples),
        visionReferenceBenchmarkMinimumSamplesPerClass: optionalNumber(visionReferenceBenchmarkMinimumSamplesPerClass),
        visionReferenceBenchmarkMinimumTop1Accuracy: optionalNumber(visionReferenceBenchmarkMinimumTop1Accuracy),
        visionReferenceBenchmarkMinimumTop3Accuracy: optionalNumber(visionReferenceBenchmarkMinimumTop3Accuracy),
        adminPassword: newAdminPassword || initialConfig?.adminPassword // Update only if new one provided
    };

    window.electronAPI.setApiConfig(newConfig);
    onSave(newConfig);
    setStatus('설정이 저장되었습니다!');
    setTimeout(() => {
        setStatus('');
        onClose();
    }, 1500);
  };

  const handleKnowledgeMigration = async () => {
    setIsMigratingKnowledge(true);
    setKnowledgeMigrationStatus('로컬 공정 지식을 Common Agent로 이전 중...');
    try {
      const result = await migrateLocalProcessKnowledge();
      setKnowledgeMigrationStatus(
        `${result.recordCount}건 이전 완료 · SQL ${result.persistedToSql ? '완료' : '확인 필요'} · Graph ${result.persistedToGraph ? '완료' : '확인 필요'} · ${result.approved ? '승인 게시' : '검토 필요'}`
      );
    } catch (error) {
      setKnowledgeMigrationStatus(
        error instanceof Error ? `이전 실패: ${error.message}` : '이전 실패'
      );
    } finally {
      setIsMigratingKnowledge(false);
    }
  };

  const handleExportComparisonReport = () => {
    const records = readDiagnosisComparisons();
    const generatedAt = new Date().toISOString();
    const observability = calculateDiagnosisObservability(records);
    const report = {
      generatedAt,
      readiness: calculateTransitionReadiness(records),
      observability,
      diagnosisVisionReviewPacket: buildDiagnosisVisionReviewPacket(
        records,
        observability,
        generatedAt
      ),
      operationalRelease,
      operationalEvidenceAlignment,
      operationalReleaseHistory,
      operationalReleaseHistorySummary,
      operationalReleaseTrend,
      operationalReadinessAudit,
      operationalBlockerWorklist,
      operationalHitlActionPack,
      operationalHitlPipelineStatus,
      operationalHitlWorktableSuggestion,
      operationalHitlReviewSessionPlan,
      operationalHitlReviewSessionPacket,
      operationalHitlHumanDecisionBrief,
      moldMasterDevelopmentProgress,
      operationalStatusBundle,
      records
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mold-master-dual-validation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOperationalReleaseImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const report = parseVisionOperationalReleaseReport(await file.text());
      saveVisionOperationalReleaseReport(report);
      setOperationalRelease(report);
      setOperationalReleaseHistory(readVisionOperationalReleaseHistory());
      setReleaseOperator('');
      setReleaseOperatorComment('');
      setReleaseImportStatus('운영 평가 보고서를 검증하고 등록했습니다.');
    } catch (error) {
      setReleaseImportStatus(
        error instanceof Error ? `보고서 등록 실패: ${error.message}` : '보고서 등록 실패'
      );
    }
  };

  const handleOperationalReadinessAuditImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const audit = JSON.parse(await file.text());
      if (audit?.contractVersion !== 'vision-operational-readiness-audit/v1') {
        throw new Error('invalid vision operational readiness audit');
      }
      saveOperationalReadinessAudit(audit);
      setOperationalReadinessAudit(audit);
      setOperationalAuditImportStatus('운영 readiness audit을 등록했습니다.');
    } catch (error) {
      setOperationalAuditImportStatus(
        error instanceof Error ? `감사 보고서 등록 실패: ${error.message}` : '감사 보고서 등록 실패'
      );
    }
  };

  const handleOperationalHitlActionPackImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const actionPack = JSON.parse(await file.text());
      if (actionPack?.contractVersion !== 'operational-hitl-action-pack/v1') {
        throw new Error('invalid operational HITL action pack');
      }
      saveOperationalHitlActionPack(actionPack);
      setOperationalHitlActionPack(actionPack);
      setOperationalHitlActionPackImportStatus('HITL action pack을 등록했습니다.');
    } catch (error) {
      setOperationalHitlActionPackImportStatus(
        error instanceof Error ? `Action pack 등록 실패: ${error.message}` : 'Action pack 등록 실패'
      );
    }
  };

  const handleOperationalHitlPipelineStatusImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const pipelineStatus = JSON.parse(await file.text());
      if (pipelineStatus?.contractVersion !== 'operational-hitl-pipeline-status/v1') {
        throw new Error('invalid operational HITL pipeline status');
      }
      saveOperationalHitlPipelineStatus(pipelineStatus);
      setOperationalHitlPipelineStatus(pipelineStatus);
      setOperationalHitlPipelineStatusImportStatus('HITL pipeline status를 등록했습니다.');
    } catch (error) {
      setOperationalHitlPipelineStatusImportStatus(
        error instanceof Error ? `Pipeline status 등록 실패: ${error.message}` : 'Pipeline status 등록 실패'
      );
    }
  };

  const handleOperationalHitlWorktableSuggestionImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const suggestion = JSON.parse(await file.text());
      if (suggestion?.contractVersion !== 'operational-hitl-decision-worktable-suggestion/v1') {
        throw new Error('invalid operational HITL worktable suggestion');
      }
      saveOperationalHitlWorktableSuggestion(suggestion);
      setOperationalHitlWorktableSuggestion(suggestion);
      setOperationalHitlWorktableSuggestionImportStatus('HITL worktable suggestion을 등록했습니다.');
    } catch (error) {
      setOperationalHitlWorktableSuggestionImportStatus(
        error instanceof Error ? `Suggestion 등록 실패: ${error.message}` : 'Suggestion 등록 실패'
      );
    }
  };

  const handleOperationalHitlReviewSessionPlanImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const sessionPlan = JSON.parse(await file.text());
      if (sessionPlan?.contractVersion !== 'operational-hitl-review-session-plan/v1') {
        throw new Error('invalid operational HITL review session plan');
      }
      saveOperationalHitlReviewSessionPlan(sessionPlan);
      setOperationalHitlReviewSessionPlan(sessionPlan);
      setOperationalHitlReviewSessionPlanImportStatus('HITL review session plan을 등록했습니다.');
    } catch (error) {
      setOperationalHitlReviewSessionPlanImportStatus(
        error instanceof Error ? `Session plan 등록 실패: ${error.message}` : 'Session plan 등록 실패'
      );
    }
  };

  const handleOperationalHitlReviewSessionPacketImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const sessionPacket = JSON.parse(await file.text());
      if (sessionPacket?.contractVersion !== 'operational-hitl-review-session-packet/v1') {
        throw new Error('invalid operational HITL review session packet');
      }
      saveOperationalHitlReviewSessionPacket(sessionPacket);
      setOperationalHitlReviewSessionPacket(sessionPacket);
      setOperationalHitlReviewSessionPacketImportStatus('HITL review session packet을 등록했습니다.');
    } catch (error) {
      setOperationalHitlReviewSessionPacketImportStatus(
        error instanceof Error ? `Session packet 등록 실패: ${error.message}` : 'Session packet 등록 실패'
      );
    }
  };

  const handleOperationalHitlHumanDecisionBriefImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const brief = JSON.parse(await file.text());
      if (brief?.contractVersion !== 'operational-hitl-human-decision-brief/v1') {
        throw new Error('invalid operational HITL human decision brief');
      }
      saveOperationalHitlHumanDecisionBrief(brief);
      setOperationalHitlHumanDecisionBrief(brief);
      setOperationalHitlHumanDecisionBriefImportStatus('HITL human decision brief를 등록했습니다.');
    } catch (error) {
      setOperationalHitlHumanDecisionBriefImportStatus(
        error instanceof Error ? `Human brief 등록 실패: ${error.message}` : 'Human brief 등록 실패'
      );
    }
  };

  const handleOperationalWebKnowledgeCommonAgentPackageImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const learningPackage = JSON.parse(await file.text());
      if (learningPackage?.contractVersion !== 'web-knowledge-common-agent-learning-package/v1') {
        throw new Error('invalid web knowledge common agent learning package');
      }
      saveOperationalWebKnowledgeCommonAgentPackage(learningPackage);
      setOperationalWebKnowledgeCommonAgentPackage(learningPackage);
      setOperationalWebKnowledgeCommonAgentPackageImportStatus('Web Knowledge package registered.');
    } catch (error) {
      setOperationalWebKnowledgeCommonAgentPackageImportStatus(
        error instanceof Error ? `Web Knowledge package import failed: ${error.message}` : 'Web Knowledge package import failed'
      );
    }
  };

  const handleMoldMasterDevelopmentProgressImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const report = JSON.parse(await file.text());
      if (report?.contractVersion !== 'mold-master-development-progress-report/v1') {
        throw new Error('invalid Mold Master development progress report');
      }
      saveMoldMasterDevelopmentProgress(report);
      setMoldMasterDevelopmentProgress(report);
      setMoldMasterDevelopmentProgressImportStatus('개발 진행률 리포트를 등록했습니다.');
    } catch (error) {
      setMoldMasterDevelopmentProgressImportStatus(
        error instanceof Error ? `진행률 리포트 등록 실패: ${error.message}` : '진행률 리포트 등록 실패'
      );
    }
  };

  const handleOperationalStatusBundleImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      if (bundle?.contractVersion !== 'operational-status-bundle/v1') {
        throw new Error('invalid operational status bundle');
      }
      const restored = extractRestorableStatusBundleArtifacts(bundle);
      if (restored.artifacts.developmentProgress) {
        saveMoldMasterDevelopmentProgress(restored.artifacts.developmentProgress);
        setMoldMasterDevelopmentProgress(restored.artifacts.developmentProgress);
      }
      if (restored.artifacts.pipelineStatus) {
        saveOperationalHitlPipelineStatus(restored.artifacts.pipelineStatus);
        setOperationalHitlPipelineStatus(restored.artifacts.pipelineStatus);
      }
      if (restored.artifacts.humanDecisionBrief) {
        saveOperationalHitlHumanDecisionBrief(restored.artifacts.humanDecisionBrief);
        setOperationalHitlHumanDecisionBrief(restored.artifacts.humanDecisionBrief);
      }
      if (restored.artifacts.reviewSessionPacket) {
        saveOperationalHitlReviewSessionPacket(restored.artifacts.reviewSessionPacket);
        setOperationalHitlReviewSessionPacket(restored.artifacts.reviewSessionPacket);
      }
      if (restored.artifacts.worktableSuggestion) {
        saveOperationalHitlWorktableSuggestion(restored.artifacts.worktableSuggestion);
        setOperationalHitlWorktableSuggestion(restored.artifacts.worktableSuggestion);
      }
      if (restored.artifacts.labelConflictReviewGuide) {
        saveOperationalLabelConflictReviewGuide(restored.artifacts.labelConflictReviewGuide);
      }
      if (restored.artifacts.webKnowledgeCommonAgentPackage) {
        saveOperationalWebKnowledgeCommonAgentPackage(restored.artifacts.webKnowledgeCommonAgentPackage);
        setOperationalWebKnowledgeCommonAgentPackage(restored.artifacts.webKnowledgeCommonAgentPackage);
      }
      saveOperationalStatusBundle(bundle);
      setOperationalStatusBundle(bundle);
      setOperationalStatusBundleImportStatus(
        `Operational status bundle registered. Restored ${restored.restoredKeys.length} embedded artifacts.`
      );
    } catch (error) {
      setOperationalStatusBundleImportStatus(
        error instanceof Error ? `Status bundle import failed: ${error.message}` : 'Status bundle import failed'
      );
    }
  };

  const handleConfirmOperationalDecision = () => {
    if (!operationalRelease) return;
    try {
      const report = attachVisionOperationalOperatorDecision(operationalRelease, {
        action: operationalRelease.decisionCard.primaryAction,
        targetVersion: operationalRelease.decisionCard.targetVersion,
        operator: releaseOperator,
        comment: releaseOperatorComment,
        confirmed: true
      });
      saveVisionOperationalReleaseReport(report);
      setOperationalRelease(report);
      setOperationalReleaseHistory(readVisionOperationalReleaseHistory());
      setReleaseImportStatus('운영 조치 확인 기록을 저장했습니다.');
    } catch (error) {
      setReleaseImportStatus(
        error instanceof Error ? `운영 조치 기록 실패: ${error.message}` : '운영 조치 기록 실패'
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col gap-4 relative" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 flex justify-between items-center border-b border-gray-700">
          <h2 className="text-xl font-bold text-gray-100">앱 설정</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close">
            <CloseIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-6 flex flex-col gap-6 max-h-[60vh] overflow-y-auto">
          <div>
            <label htmlFor="ai-orchestration-mode" className="block text-sm font-medium text-gray-300 mb-2">
                AI 실행 경로
            </label>
            <select
              id="ai-orchestration-mode"
              value={aiOrchestrationMode}
              onChange={(event) => setAiOrchestrationMode(event.target.value as AiOrchestrationMode)}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="common_agent_primary">Common Agent 우선 (실패 시 기존 AI 대체)</option>
              <option value="dual_validation">이중 검증 (Common Agent + 기존 AI)</option>
              <option value="legacy">기존 AI만 사용</option>
            </select>
            <p className="text-xs text-cyan-300/70 mt-1">
              권장: 전환 기간에는 이중 검증을 사용하고, 검증 완료 후 Common Agent 우선으로 변경합니다.
            </p>
            <div className="mt-3 rounded-lg border border-cyan-900/70 bg-cyan-950/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-cyan-100">Common Agent 전환 준비도</p>
                  <p className={`mt-1 text-xs font-semibold ${transitionReadiness.readyForCommonAgentPrimary ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {transitionReadiness.readyForCommonAgentPrimary
                      ? 'Common Agent 우선 모드 전환 기준 충족'
                      : `이중 검증 유지 권장 (${transitionReadiness.total}/20건)`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={handleExportComparisonReport}
                    disabled={transitionReadiness.total === 0}
                    className="rounded bg-cyan-800 px-2 py-1 text-[10px] text-cyan-100 hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    JSON 내보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearDiagnosisComparisons();
                      setTransitionReadiness(calculateTransitionReadiness([]));
                      setDiagnosisObservability(calculateDiagnosisObservability([]));
                    }}
                    className="rounded bg-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-600"
                  >
                    비교 기록 초기화
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-300">
                <span>Agent 성공률 <strong className="text-white">{transitionReadiness.commonAgentSuccessRate}%</strong></span>
                <span>Fallback <strong className="text-white">{transitionReadiness.fallbackRate}%</strong></span>
                <span>판정 가능 <strong className="text-white">{transitionReadiness.classifiableCount}건 ({transitionReadiness.classifiableRate}%)</strong></span>
                <span>비교 가능 <strong className="text-white">{transitionReadiness.comparableCount}건</strong></span>
                <span>불량명 일치 <strong className="text-white">{transitionReadiness.agreementRate}%</strong></span>
              </div>
              <div
                aria-label="진단 운영 관측성"
                className="mt-3 rounded border border-cyan-900/50 bg-gray-950/30 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-cyan-100">진단 운영 관측성</span>
                  <span className="text-[9px] text-gray-500">최근 {diagnosisObservability.total}건</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-gray-300">
                  <span>
                    Agent P50/P95{' '}
                    <strong className="text-white">
                      {diagnosisObservability.commonAgentLatencyMs.sampleCount > 0
                        ? `${diagnosisObservability.commonAgentLatencyMs.p50}/${diagnosisObservability.commonAgentLatencyMs.p95}ms`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    기존 AI P50/P95{' '}
                    <strong className="text-white">
                      {diagnosisObservability.legacyLatencyMs.sampleCount > 0
                        ? `${diagnosisObservability.legacyLatencyMs.p50}/${diagnosisObservability.legacyLatencyMs.p95}ms`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Graph 근거{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.graphGrounded > 0
                        ? `${diagnosisObservability.graphGroundedRate}% (${diagnosisObservability.metricSamples.graphGrounded})`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    평균 근거{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.evidence > 0
                        ? `${diagnosisObservability.averageEvidenceCount}건 (${diagnosisObservability.metricSamples.evidence})`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Classifier 합의{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.visionClassifier > 0
                        ? `${diagnosisObservability.visionClassifierAgreementRate}% (${diagnosisObservability.metricSamples.visionClassifier})`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Classifier 불일치{' '}
                    <strong className={diagnosisObservability.visionClassifierDisagreementRate > 0 ? 'text-amber-300' : 'text-white'}>
                      {diagnosisObservability.metricSamples.visionClassifier > 0
                        ? `${diagnosisObservability.visionClassifierDisagreementRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    참조 부족{' '}
                    <strong className={diagnosisObservability.visionClassifierInsufficientReferenceRate > 0 ? 'text-amber-300' : 'text-white'}>
                      {diagnosisObservability.metricSamples.visionClassifier > 0
                        ? `${diagnosisObservability.visionClassifierInsufficientReferenceRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    평균 참조{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.visionClassifier > 0
                        ? `${diagnosisObservability.averageClassifierReferenceCount}장`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Vision 확정{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.visionDecision > 0
                        ? `${diagnosisObservability.visionProbableRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Vision 보류{' '}
                    <strong className={diagnosisObservability.visionNeedsReviewRate > 0 ? 'text-amber-300' : 'text-white'}>
                      {diagnosisObservability.metricSamples.visionDecision > 0
                        ? `${diagnosisObservability.visionNeedsReviewRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    Vision 판정불가{' '}
                    <strong className={diagnosisObservability.visionUnclassifiableRate > 0 ? 'text-red-300' : 'text-white'}>
                      {diagnosisObservability.metricSamples.visionDecision > 0
                        ? `${diagnosisObservability.visionUnclassifiableRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    현장 컨텍스트{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.contextProvided > 0
                        ? `${diagnosisObservability.contextProvidedRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>
                    ROI/OCR{' '}
                    <strong className="text-white">
                      {diagnosisObservability.metricSamples.roiContext > 0
                        ? `${diagnosisObservability.roiContextRate}%`
                        : '-'}{' / '}
                      {diagnosisObservability.metricSamples.ocrContext > 0
                        ? `${diagnosisObservability.ocrContextRate}%`
                        : '-'}
                    </strong>
                  </span>
                  <span>선택 Agent <strong className="text-white">{diagnosisObservability.selectedSources.common_agent}건</strong></span>
                  <span>선택 기존 AI <strong className="text-white">{diagnosisObservability.selectedSources.legacy}건</strong></span>
                  <span>
                    Agent 오류{' '}
                    <strong className={diagnosisObservability.commonAgentFailures > 0 ? 'text-red-300' : 'text-white'}>
                      {diagnosisObservability.commonAgentFailures}건
                    </strong>
                  </span>
                  <span>
                    기존 AI 오류{' '}
                    <strong className={diagnosisObservability.legacyFailures > 0 ? 'text-red-300' : 'text-white'}>
                      {diagnosisObservability.legacyFailures}건
                    </strong>
                  </span>
                </div>
                {Object.entries(diagnosisObservability.retrievalModes).some(([, count]) => count > 0) && (
                  <p className="mt-2 text-[9px] text-cyan-200/70">
                    검색 모드: {Object.entries(diagnosisObservability.retrievalModes)
                      .filter(([, count]) => count > 0)
                      .map(([mode, count]) => `${mode} ${count}`)
                      .join(' · ')}
                  </p>
                )}
                {diagnosisObservability.visionDecisionReasonTargets.length > 0 && (
                  <div className="mt-2 rounded border border-sky-900/50 bg-sky-950/20 p-2 text-[9px] text-sky-100">
                    <p className="font-bold text-sky-200">Vision 판정 사유</p>
                    {diagnosisObservability.visionDecisionReasonTargets.slice(0, 3).map(target => (
                      <p key={`${target.status}:${target.reason}`} className="mt-1 break-words">
                        {visionDecisionStatusLabel(target.status)} {target.count}건: {target.reason}
                      </p>
                    ))}
                  </div>
                )}
                {diagnosisObservability.visionDecisionRecommendedActions.length > 0 && (
                  <div className="mt-2 rounded border border-sky-800/60 bg-sky-950/30 p-2 text-[9px] text-sky-100">
                    <p className="font-bold text-sky-200">Vision 권장 조치</p>
                    {diagnosisObservability.visionDecisionRecommendedActions.slice(0, 2).map(action => (
                      <p key={action.code} className="mt-1 break-words">
                        {action.message}
                      </p>
                    ))}
                  </div>
                )}
                {diagnosisObservability.visionDecisionReviewQueue.length > 0 && (
                  <div className="mt-2 rounded border border-cyan-900/50 bg-cyan-950/20 p-2 text-[9px] text-cyan-100">
                    <p className="font-bold text-cyan-200">Vision 우선 검토</p>
                    {diagnosisObservability.visionDecisionReviewQueue.slice(0, 3).map(item => (
                      <p key={`${item.priority}:${item.reason}`} className="mt-1 break-words">
                        P{item.priority} {visionDecisionStatusLabel(item.status)} {item.count}건: {item.reason} · 샘플 {item.sampleImageIds.join(', ')}
                      </p>
                    ))}
                  </div>
                )}
                {diagnosisObservability.visionClassifierRecommendedActions.length > 0 && (
                  <div className="mt-2 rounded border border-amber-900/50 bg-amber-950/20 p-2 text-[9px] text-amber-100">
                    <p className="font-bold text-amber-200">Classifier 권장 조치</p>
                    {diagnosisObservability.visionClassifierRecommendedActions.slice(0, 2).map(action => (
                      <p key={action.code} className="mt-1 break-words">
                        {action.message}
                      </p>
                    ))}
                  </div>
                )}
                {diagnosisObservability.failureReasons.length > 0 && (
                  <div className="mt-2 rounded border border-red-900/50 bg-red-950/20 p-2 text-[9px] text-red-200">
                    {diagnosisObservability.failureReasons.slice(0, 2).map(reason => (
                      <p key={`${reason.source}:${reason.message}`} className="break-words">
                        {reason.source === 'common_agent' ? 'Agent' : '기존 AI'} {reason.count}회: {reason.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div
              aria-label="비전 릴리스 게이트"
              className="mt-3 rounded-lg border border-sky-900/70 bg-sky-950/25 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-sky-100">비전 릴리스 게이트</p>
                  <p className={`mt-1 text-xs font-semibold ${
                    operationalRelease?.decision === 'promote_candidate'
                      ? 'text-emerald-300'
                      : operationalRelease?.decision === 'rollback_required'
                        ? 'text-red-300'
                        : 'text-amber-300'
                  }`}>
                    {releaseDecisionLabel(operationalRelease)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <label className="cursor-pointer rounded bg-sky-800 px-2 py-1 text-[9px] text-sky-100 hover:bg-sky-700">
                    평가 보고서 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalReleaseImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-amber-800 px-2 py-1 text-[9px] text-amber-100 hover:bg-amber-700">
                    감사 보고서 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalReadinessAuditImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-violet-800 px-2 py-1 text-[9px] text-violet-100 hover:bg-violet-700">
                    Progress 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleMoldMasterDevelopmentProgressImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-blue-800 px-2 py-1 text-[9px] text-blue-100 hover:bg-blue-700">
                    Status Bundle 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalStatusBundleImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-emerald-800 px-2 py-1 text-[9px] text-emerald-100 hover:bg-emerald-700">
                    Web Package import
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalWebKnowledgeCommonAgentPackageImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-cyan-800 px-2 py-1 text-[9px] text-cyan-100 hover:bg-cyan-700">
                    HITL Pack 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlActionPackImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-indigo-800 px-2 py-1 text-[9px] text-indigo-100 hover:bg-indigo-700">
                    Pipeline Status 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlPipelineStatusImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-teal-800 px-2 py-1 text-[9px] text-teal-100 hover:bg-teal-700">
                    Suggestion 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlWorktableSuggestionImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-lime-800 px-2 py-1 text-[9px] text-lime-100 hover:bg-lime-700">
                    Session Plan 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlReviewSessionPlanImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-fuchsia-800 px-2 py-1 text-[9px] text-fuchsia-100 hover:bg-fuchsia-700">
                    Session Packet 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlReviewSessionPacketImport}
                    />
                  </label>
                  <label className="cursor-pointer rounded bg-rose-800 px-2 py-1 text-[9px] text-rose-100 hover:bg-rose-700">
                    Human Brief 등록
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleOperationalHitlHumanDecisionBriefImport}
                    />
                  </label>
                  {operationalRelease && (
                    <span className="text-[9px] text-gray-500">
                      {new Date(operationalRelease.generatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {releaseImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  releaseImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {releaseImportStatus}
                </p>
              )}
              {operationalAuditImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalAuditImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalAuditImportStatus}
                </p>
              )}
              {moldMasterDevelopmentProgressImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  moldMasterDevelopmentProgressImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {moldMasterDevelopmentProgressImportStatus}
                </p>
              )}
              {operationalStatusBundleImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalStatusBundleImportStatus.includes('failed')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalStatusBundleImportStatus}
                </p>
              )}
              {operationalWebKnowledgeCommonAgentPackageImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalWebKnowledgeCommonAgentPackageImportStatus.includes('failed')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalWebKnowledgeCommonAgentPackageImportStatus}
                </p>
              )}
              {operationalWebKnowledgeCommonAgentPackage && (
                <p className="mt-2 break-words text-[9px] text-emerald-100">
                  Local Web package: {operationalWebKnowledgeCommonAgentPackage.status || 'unknown'}
                  {' / items '}
                  {operationalWebKnowledgeCommonAgentPackageSummary.packagedKnowledgeItems ?? 0}
                  {' / graph cases '}
                  {operationalWebKnowledgeCommonAgentPackageSummary.graphRoundtripCases ?? 0}
                </p>
              )}
              {operationalHitlActionPackImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlActionPackImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlActionPackImportStatus}
                </p>
              )}
              {operationalHitlPipelineStatusImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlPipelineStatusImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlPipelineStatusImportStatus}
                </p>
              )}
              {operationalHitlWorktableSuggestionImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlWorktableSuggestionImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlWorktableSuggestionImportStatus}
                </p>
              )}
              {operationalHitlReviewSessionPlanImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlReviewSessionPlanImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlReviewSessionPlanImportStatus}
                </p>
              )}
              {operationalHitlReviewSessionPacketImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlReviewSessionPacketImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlReviewSessionPacketImportStatus}
                </p>
              )}
              {operationalHitlHumanDecisionBriefImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  operationalHitlHumanDecisionBriefImportStatus.includes('실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {operationalHitlHumanDecisionBriefImportStatus}
                </p>
              )}
              <div className="mt-2 rounded border border-sky-900/60 bg-gray-950/30 p-2 text-[9px] text-gray-300">
                <p className="font-semibold text-sky-200">
                  릴리스 이력 {operationalReleaseHistorySummary.totalReports}건 · 근거완료{' '}
                  {operationalReleaseHistorySummary.completeEvidenceReports}건 · 운영확인{' '}
                  {operationalReleaseHistorySummary.operatorConfirmedReports}건
                </p>
                <p className="mt-1 text-gray-400">
                  최신 상태: {releaseHistoryStatusLabel(operationalReleaseHistorySummary.latestStatus)}
                  {operationalReleaseHistory.entries[0]
                    ? ` · ${operationalReleaseHistory.entries[0].report.decisionCard.title}`
                    : ''}
                </p>
                <p className="mt-1 text-sky-100">
                  다음 조치: {operationalReleaseTrend.latestActionLabel}
                </p>
                <p className="mt-1 text-gray-400">
                  추세: 근거준비 {operationalReleaseTrend.evidenceReadyRate}% · 운영확인{' '}
                  {operationalReleaseTrend.operatorConfirmationRate}%
                </p>
                {operationalReleaseTrend.topBlockingReasons.length > 0 && (
                  <p className="mt-1 break-words text-amber-200">
                    반복 차단: {operationalReleaseTrend.topBlockingReasons
                      .slice(0, 2)
                      .map(reason => `${reason.name} ${reason.count}회`)
                      .join(' · ')}
                  </p>
                )}
                <p className="mt-1 break-words text-gray-500">
                  {operationalReleaseTrend.narrative}
                </p>
              </div>
              {operationalStatusBundleDisplay && (
                <div
                  aria-label="Operational Status Bundle"
                  className={`mt-2 rounded border p-2 text-[9px] text-gray-300 ${
                    operationalStatusBundleDisplay.severity === 'danger'
                      ? 'border-red-800/70 bg-red-950/30'
                      : operationalStatusBundleDisplay.severity === 'success'
                        ? 'border-emerald-800/70 bg-emerald-950/25'
                        : 'border-blue-800/70 bg-blue-950/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-blue-100">
                        {operationalStatusBundleDisplay.title}
                      </p>
                      <p className="mt-1 text-blue-200">
                        {operationalStatusBundleDisplay.statusLabel}
                      </p>
                    </div>
                    <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                      {operationalStatusBundleDisplay.status}
                    </span>
                  </div>
                  {operationalStatusBundleDisplay.phaseText && (
                    <p className="mt-1 break-words text-blue-100">
                      Phase: {operationalStatusBundleDisplay.phaseText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.pipelineStageText && (
                    <p className="mt-1 break-words text-blue-100">
                      Pipeline: {operationalStatusBundleDisplay.pipelineStageText}
                    </p>
                  )}
                  <p className="mt-1 break-words text-gray-300">
                    {operationalStatusBundleDisplay.summaryText}
                  </p>
                  {operationalStatusBundleDisplay.webKnowledgeText && (
                    <p className="mt-1 break-words text-cyan-100">
                      {operationalStatusBundleDisplay.webKnowledgeText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.webKnowledgePackageText && (
                    <div className="mt-2 rounded border border-emerald-900/50 bg-emerald-950/20 px-2 py-1">
                      <p className="break-words text-[8px] font-bold text-emerald-50">
                        {operationalStatusBundleDisplay.webKnowledgePackageText}
                      </p>
                      {operationalStatusBundleDisplay.webKnowledgePackageActionText && (
                        <p className="mt-1 break-words text-[8px] text-emerald-100">
                          {operationalStatusBundleDisplay.webKnowledgePackageActionText}
                        </p>
                      )}
                      {operationalStatusBundleDisplay.webKnowledgePackagePath && (
                        <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                          {operationalStatusBundleDisplay.webKnowledgePackagePath}
                        </p>
                      )}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.preparationRunText && (
                    <div className="mt-2 rounded border border-cyan-900/50 bg-cyan-950/20 px-2 py-1">
                      <p className="break-words text-[8px] font-bold text-cyan-50">
                        {operationalStatusBundleDisplay.preparationRunText}
                      </p>
                      {operationalStatusBundleDisplay.preparationRunPath && (
                        <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                          {operationalStatusBundleDisplay.preparationRunPath}
                        </p>
                      )}
                      {operationalStatusBundleDisplay.preparationWorksheetPaths.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {operationalStatusBundleDisplay.preparationWorksheetPaths.map(path => (
                            <p key={path} className="break-words font-mono text-[8px] text-cyan-100">
                              {path}
                            </p>
                          ))}
                        </div>
                      )}
                      {operationalStatusBundleDisplay.preparationDecisionTemplatePaths.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[8px] font-bold text-cyan-50">Decision templates</p>
                          {operationalStatusBundleDisplay.preparationDecisionTemplatePaths.map(path => (
                            <p key={path} className="break-words font-mono text-[8px] text-cyan-100">
                              {path}
                            </p>
                          ))}
                        </div>
                      )}
                      {operationalStatusBundleDisplay.preparationHumanGatedCommandTexts.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <p className="text-[8px] font-bold text-cyan-50">Human-gated commands</p>
                          {operationalStatusBundleDisplay.preparationHumanGatedCommandTexts.map(command => (
                            <p key={command} className="break-words font-mono text-[8px] text-amber-100">
                              {command}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.decisionReviewText && (
                    <div className="mt-2 rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1">
                      <p className="break-words text-[8px] font-bold text-amber-50">
                        {operationalStatusBundleDisplay.decisionReviewText}
                      </p>
                      {operationalStatusBundleDisplay.decisionReviewPath && (
                        <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                          {operationalStatusBundleDisplay.decisionReviewPath}
                        </p>
                      )}
                      {operationalStatusBundleDisplay.decisionReviewSectionPreviews.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {operationalStatusBundleDisplay.decisionReviewSectionPreviews.map(section => (
                            <div
                              key={section.queueCode}
                              className="rounded border border-amber-900/40 bg-gray-950/30 px-2 py-1"
                            >
                              <p className="break-words text-[8px] font-bold text-amber-50">
                                {section.queueCode} · prepared {section.preparedDecisionItems} · pending {section.pendingActions} · target {section.targetPending}
                              </p>
                              {section.verificationCommand && (
                                <p className="mt-1 break-words font-mono text-[8px] text-amber-100">
                                  {section.verificationCommand}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.accuracyText && (
                    <p className="mt-1 break-words text-amber-100">
                      {operationalStatusBundleDisplay.accuracyText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.captureWorkOrderText && (
                    <p className="mt-1 break-words text-emerald-100">
                      {operationalStatusBundleDisplay.captureWorkOrderText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.postImportValidationText && (
                    <p className="mt-1 break-words text-sky-100">
                      {operationalStatusBundleDisplay.postImportValidationText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.captureWorkOrderPreviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {operationalStatusBundleDisplay.captureWorkOrderPreviews.map(order => (
                        <div
                          key={`${order.defectClass}:${order.actionType}`}
                          className="rounded border border-emerald-900/50 bg-gray-950/35 px-2 py-1"
                        >
                          <p className="break-words text-[8px] font-bold text-emerald-50">
                            P{order.priority} {order.defectClass} · {order.actionType}
                          </p>
                          <p className="mt-1 break-words text-[8px] text-emerald-100">
                            신규 {order.missingApprovedSamples}건 · 재촬영 {order.recaptureSampleCount}건
                          </p>
                          {order.requiredViewsText && (
                            <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                              {order.requiredViewsText}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.labelConflictGuideText && (
                    <div className="mt-2 rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1">
                      <p className="font-bold text-amber-50">Label Conflict HITL Guide</p>
                      <p className="mt-1 break-words text-[8px] text-amber-100">
                        {operationalStatusBundleDisplay.labelConflictGuideText}
                      </p>
                      {operationalStatusBundleDisplay.labelConflictGuideRiskText && (
                        <p className="mt-1 break-words text-[8px] text-orange-100">
                          {operationalStatusBundleDisplay.labelConflictGuideRiskText}
                        </p>
                      )}
                      {operationalStatusBundleDisplay.labelConflictGuidePath && (
                        <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                          {operationalStatusBundleDisplay.labelConflictGuidePath}
                        </p>
                      )}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.nextSessionText && (
                    <p className="mt-1 break-words text-amber-100">
                      {operationalStatusBundleDisplay.nextSessionText}
                    </p>
                  )}
                  {operationalStatusBundleDisplay.worktableCsvPath && (
                    <p className="mt-1 break-words font-mono text-[8px] text-blue-100">
                      {operationalStatusBundleDisplay.worktableCsvPath}
                    </p>
                  )}
                  <p className="mt-1 break-words text-gray-400">
                    Next: {operationalStatusBundleDisplay.nextActionKo}
                  </p>
                  {operationalStatusBundleDisplay.settingsImportButtons.length > 0 && (
                    <div className="mt-2 rounded border border-blue-900/50 bg-gray-950/35 px-2 py-1">
                      <p className="font-bold text-blue-50">Settings import order</p>
                      <p className="mt-1 break-words text-[8px] text-blue-100">
                        {operationalStatusBundleDisplay.settingsImportButtons.join(' -> ')}
                      </p>
                    </div>
                  )}
                  {operationalStatusBundleDisplay.sessionPreviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {operationalStatusBundleDisplay.sessionPreviews.map(session => (
                        <div
                          key={session.code}
                          className="rounded border border-blue-900/50 bg-gray-950/35 px-2 py-1"
                        >
                          <p className="break-words text-[8px] font-bold text-blue-50">
                            P{session.priority} {session.titleKo} · pending {session.pendingRows}건
                            {session.highRiskRows > 0 ? ` · high risk ${session.highRiskRows}건` : ''}
                          </p>
                          {session.firstDecisionId && (
                            <p className="mt-1 break-words text-[8px] text-amber-100">
                              first decision: {session.firstDecisionId}
                            </p>
                          )}
                          {session.path && (
                            <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                              {session.path}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.actionPreviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {operationalStatusBundleDisplay.actionPreviews.map(action => (
                        <div
                          key={action.code}
                          className="rounded bg-gray-950/40 px-2 py-1"
                        >
                          <p className="break-words text-[8px] font-bold text-blue-50">
                            {action.titleKo || action.code}
                          </p>
                          <p className="mt-1 break-words text-[8px] text-gray-300">
                            {action.instructionKo}
                          </p>
                          {action.path && (
                            <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                              {action.path}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {operationalStatusBundleDisplay.feedbackPreviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {operationalStatusBundleDisplay.feedbackPreviews.map(feedback => (
                        <p key={feedback} className="break-words text-[8px] text-gray-300">
                          {feedback}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {operationalStatusBundleDisplay.safetyBadges.map(badge => (
                      <span
                        key={badge}
                        className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {moldMasterDevelopmentProgressDisplay && (
                <div
                  aria-label="Mold Master Development Progress"
                  className={`mt-2 rounded border p-2 text-[9px] text-gray-300 ${
                    moldMasterDevelopmentProgressDisplay.severity === 'danger'
                      ? 'border-red-800/70 bg-red-950/30'
                      : moldMasterDevelopmentProgressDisplay.severity === 'success'
                        ? 'border-emerald-800/70 bg-emerald-950/25'
                        : 'border-violet-800/70 bg-violet-950/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-violet-100">
                        {moldMasterDevelopmentProgressDisplay.title}
                      </p>
                      <p className="mt-1 text-violet-200">
                        {moldMasterDevelopmentProgressDisplay.statusLabel}
                      </p>
                    </div>
                    <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                      {moldMasterDevelopmentProgressDisplay.status}
                    </span>
                  </div>
                  {moldMasterDevelopmentProgressDisplay.phaseText && (
                    <p className="mt-1 break-words text-violet-100">
                      현재 단계: {moldMasterDevelopmentProgressDisplay.phaseText}
                    </p>
                  )}
                  <p className="mt-1 break-words text-gray-300">
                    {moldMasterDevelopmentProgressDisplay.summaryText}
                  </p>
                  {moldMasterDevelopmentProgressDisplay.accuracyText && (
                    <p className="mt-1 break-words text-amber-100">
                      {moldMasterDevelopmentProgressDisplay.accuracyText}
                    </p>
                  )}
                  <p className="mt-1 break-words text-gray-400">
                    다음: {moldMasterDevelopmentProgressDisplay.nextActionKo}
                  </p>
                  {moldMasterDevelopmentProgressDisplay.nextCommand && (
                    <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-violet-100">
                      {moldMasterDevelopmentProgressDisplay.nextCommand}
                    </p>
                  )}
                  {moldMasterDevelopmentProgressDisplay.feedbackPreviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {moldMasterDevelopmentProgressDisplay.feedbackPreviews.map(feedback => (
                        <p key={feedback} className="break-words text-[8px] text-gray-300">
                          {feedback}
                        </p>
                      ))}
                    </div>
                  )}
                  {moldMasterDevelopmentProgressDisplay.stagePreviews.length > 0 && (
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {moldMasterDevelopmentProgressDisplay.stagePreviews.map(stage => (
                        <div
                          key={stage.id}
                          className="rounded border border-violet-900/50 bg-gray-950/35 px-2 py-1"
                        >
                          <p className="break-words text-[8px] font-bold text-violet-50">
                            {stage.titleKo} · {stage.status}
                          </p>
                          <p className="mt-1 break-words text-[8px] text-gray-400">
                            {stage.owner}
                            {stage.commandCount > 0 ? ` · 명령 ${stage.commandCount}개` : ''}
                          </p>
                          {stage.blockerText && (
                            <p className="mt-1 break-words text-[8px] text-amber-100">
                              차단: {stage.blockerText}
                            </p>
                          )}
                          {stage.feedbackKo && (
                            <p className="mt-1 break-words text-[8px] text-gray-500">
                              {stage.feedbackKo}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {moldMasterDevelopmentProgressDisplay.safetyBadges.map(badge => (
                      <span
                        key={badge}
                        className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div
                aria-label="Vision 운영 작업 목록"
                className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[9px] text-gray-300"
              >
                <p className="font-semibold text-amber-200">
                  운영 작업 목록 {operationalBlockerWorklist.summary.totalTasks}건 ·{' '}
                  {operationalWorklistStatusLabel(operationalBlockerWorklist.status)}
                </p>
                <p className="mt-1 break-words text-gray-400">
                  {operationalBlockerWorklist.recommendedAction}
                </p>
                {operationalBlockerWorklist.tasks.slice(0, 3).map((task: any) => (
                  <p key={task.code} className="mt-1 break-words text-amber-100">
                    P{task.priority} {task.titleKo} · {task.owner}
                    {task.count !== undefined ? ` · ${task.count}건` : ''}
                    {task.missing !== undefined ? ` · 부족 ${task.missing}건` : ''}
                  </p>
                ))}
                {operationalHitlPipelineStatusDisplay && (
                  <div
                    aria-label="HITL Pipeline Status"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlPipelineStatusDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlPipelineStatusDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-indigo-800/70 bg-indigo-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-indigo-100">
                          {operationalHitlPipelineStatusDisplay.title}
                        </p>
                        <p className="mt-1 text-indigo-200">
                          {operationalHitlPipelineStatusDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlPipelineStatusDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-indigo-100">
                      현재 단계: {operationalHitlPipelineStatusDisplay.stageText}
                    </p>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlPipelineStatusDisplay.summaryText}
                    </p>
                    {operationalHitlPipelineStatusDisplay.suggestionText && (
                      <p className="mt-1 break-words text-cyan-100">
                        {operationalHitlPipelineStatusDisplay.suggestionText}
                      </p>
                    )}
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlPipelineStatusDisplay.nextActionKo}
                    </p>
                    {operationalHitlPipelineStatusDisplay.nextCommand && (
                      <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-indigo-100">
                        {operationalHitlPipelineStatusDisplay.nextCommand}
                      </p>
                    )}
                    {operationalHitlPipelineStatusDisplay.stageTrailPreviews.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {operationalHitlPipelineStatusDisplay.stageTrailPreviews.map(step => (
                          <p key={step} className="break-words text-[8px] text-indigo-50">
                            {step}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlPipelineStatusDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlReviewSessionPlanDisplay && (
                  <div
                    aria-label="HITL Review Session Plan"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlReviewSessionPlanDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlReviewSessionPlanDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-lime-800/70 bg-lime-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-lime-100">
                          {operationalHitlReviewSessionPlanDisplay.title}
                        </p>
                        <p className="mt-1 text-lime-200">
                          {operationalHitlReviewSessionPlanDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlReviewSessionPlanDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlReviewSessionPlanDisplay.summaryText}
                    </p>
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlReviewSessionPlanDisplay.nextActionKo}
                    </p>
                    {operationalHitlReviewSessionPlanDisplay.sessionPreviews.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {operationalHitlReviewSessionPlanDisplay.sessionPreviews.map(session => (
                          <div
                            key={session.code}
                            className="rounded border border-lime-900/50 bg-gray-950/35 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-bold text-lime-50">
                              P{session.priority} {session.titleKo} · {session.rowCount}건
                              {session.highRiskRows > 0 ? ` · 고위험 ${session.highRiskRows}건` : ''}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-400">
                              {session.guidanceKo}
                            </p>
                            {session.firstRows.map(row => (
                              <div
                                key={`${session.code}:${row.queueCode}:${row.decisionId}:${row.action}`}
                                className="mt-1 rounded bg-gray-950/40 px-2 py-1"
                              >
                                <p className="break-words text-[8px] font-semibold text-lime-100">
                                  {row.queueCode} · {row.decisionId} · {row.action} · {row.risk}
                                </p>
                                <p className="mt-1 break-words text-[8px] text-gray-300">
                                  {row.displayLabel}
                                </p>
                                {row.copyableText && (
                                  <p className="mt-1 break-words text-[8px] text-cyan-100">
                                    {row.copyableText}
                                  </p>
                                )}
                                {row.manualText && (
                                  <p className="mt-1 break-words text-[8px] text-amber-100">
                                    {row.manualText}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlReviewSessionPlanDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlReviewSessionPacketDisplay && (
                  <div
                    aria-label="HITL Review Session Packet"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlReviewSessionPacketDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlReviewSessionPacketDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-fuchsia-800/70 bg-fuchsia-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-fuchsia-100">
                          {operationalHitlReviewSessionPacketDisplay.title}
                        </p>
                        <p className="mt-1 text-fuchsia-200">
                          {operationalHitlReviewSessionPacketDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlReviewSessionPacketDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlReviewSessionPacketDisplay.summaryText}
                    </p>
                    {operationalHitlReviewSessionPacketDisplay.packetDir && (
                      <p className="mt-1 break-words font-mono text-[8px] text-fuchsia-100">
                        {operationalHitlReviewSessionPacketDisplay.packetDir}
                      </p>
                    )}
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlReviewSessionPacketDisplay.nextActionKo}
                    </p>
                    {operationalHitlReviewSessionPacketDisplay.packetPreviews.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {operationalHitlReviewSessionPacketDisplay.packetPreviews.map(packet => (
                          <div
                            key={packet.code}
                            className="rounded border border-fuchsia-900/50 bg-gray-950/35 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-bold text-fuchsia-50">
                              P{packet.priority} {packet.titleKo} · {packet.rowCount}건
                              {packet.highRiskRows > 0 ? ` · 고위험 ${packet.highRiskRows}건` : ''}
                            </p>
                            <p className="mt-1 break-words font-mono text-[8px] text-fuchsia-100">
                              CSV: {packet.csvFileName}
                            </p>
                            <p className="mt-1 break-words font-mono text-[8px] text-fuchsia-100">
                              MD: {packet.markdownFileName}
                            </p>
                            {packet.csvPath && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-400">
                                {packet.csvPath}
                              </p>
                            )}
                            {packet.markdownPath && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                                {packet.markdownPath}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlReviewSessionPacketDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlHumanDecisionBriefDisplay && (
                  <div
                    aria-label="HITL Human Decision Brief"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlHumanDecisionBriefDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlHumanDecisionBriefDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-rose-800/70 bg-rose-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-rose-100">
                          {operationalHitlHumanDecisionBriefDisplay.title}
                        </p>
                        <p className="mt-1 text-rose-200">
                          {operationalHitlHumanDecisionBriefDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlHumanDecisionBriefDisplay.status}
                      </span>
                    </div>
                    {operationalHitlHumanDecisionBriefDisplay.stageText && (
                      <p className="mt-1 break-words text-rose-100">
                        현재 단계: {operationalHitlHumanDecisionBriefDisplay.stageText}
                      </p>
                    )}
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlHumanDecisionBriefDisplay.summaryText}
                    </p>
                    {operationalHitlHumanDecisionBriefDisplay.nextSessionText && (
                      <p className="mt-1 break-words text-amber-100">
                        {operationalHitlHumanDecisionBriefDisplay.nextSessionText}
                      </p>
                    )}
                    {operationalHitlHumanDecisionBriefDisplay.worktableCsvPath && (
                      <p className="mt-1 break-words font-mono text-[8px] text-rose-100">
                        {operationalHitlHumanDecisionBriefDisplay.worktableCsvPath}
                      </p>
                    )}
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlHumanDecisionBriefDisplay.nextActionKo}
                    </p>
                    {operationalHitlHumanDecisionBriefDisplay.nextCommand && (
                      <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-rose-100">
                        {operationalHitlHumanDecisionBriefDisplay.nextCommand}
                      </p>
                    )}
                    {operationalHitlHumanDecisionBriefDisplay.operatorStepPreviews.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {operationalHitlHumanDecisionBriefDisplay.operatorStepPreviews.map(step => (
                          <div
                            key={`${step.code}:${step.titleKo}`}
                            className="rounded border border-rose-900/50 bg-gray-950/35 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-bold text-rose-50">
                              {step.titleKo}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-300">
                              {step.instructionKo}
                            </p>
                            {step.command && (
                              <p className="mt-1 break-words font-mono text-[8px] text-rose-100">
                                {step.command}
                              </p>
                            )}
                            {step.path && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                                {step.path}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {operationalHitlHumanDecisionBriefDisplay.entryQueuePreviews.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <p className="text-[8px] font-bold uppercase tracking-wide text-cyan-100">
                          Quick Entry Queue
                        </p>
                        {operationalHitlHumanDecisionBriefDisplay.entryQueuePreviews.map(entry => (
                          <div
                            key={`${entry.entryNumber}:${entry.sessionCode}:${entry.decisionId}`}
                            className="rounded border border-cyan-900/50 bg-cyan-950/20 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-bold text-cyan-50">
                              #{entry.entryNumber} P{entry.sessionPriority} {entry.sessionCode} · {entry.decisionId} · {entry.action} · {entry.risk}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-300">
                              {entry.displayLabel}
                            </p>
                            {entry.copyableText && (
                              <p className="mt-1 break-words text-[8px] text-cyan-100">
                                {entry.copyableText}
                              </p>
                            )}
                            {entry.manualText && (
                              <p className="mt-1 break-words text-[8px] text-amber-100">
                                {entry.manualText}
                              </p>
                            )}
                            {entry.sessionPath && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                                {entry.sessionPath}
                              </p>
                            )}
                            {entry.worktableCsvPath && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                                {entry.worktableCsvPath}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {operationalHitlHumanDecisionBriefDisplay.sessionPreviews.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {operationalHitlHumanDecisionBriefDisplay.sessionPreviews.map(session => (
                          <div
                            key={session.code}
                            className="rounded border border-rose-900/50 bg-gray-950/35 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-bold text-rose-50">
                              P{session.priority} {session.titleKo} · 대기 {session.pendingRows}건
                              {session.invalidRows > 0 ? ` · 오류 ${session.invalidRows}건` : ''}
                              {session.highRiskRows > 0 ? ` · 고위험 ${session.highRiskRows}건` : ''}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-400">
                              {session.guidanceKo}
                            </p>
                            {session.markdownPath && (
                              <p className="mt-1 break-words font-mono text-[8px] text-gray-500">
                                {session.markdownPath}
                              </p>
                            )}
                            {session.nextRows.map(row => (
                              <div
                                key={`${session.code}:${row.queueCode}:${row.decisionId}:${row.action}`}
                                className="mt-1 rounded bg-gray-950/40 px-2 py-1"
                              >
                                <p className="break-words text-[8px] font-semibold text-rose-100">
                                  {row.queueCode} · {row.decisionId} · {row.action} · {row.risk}
                                </p>
                                <p className="mt-1 break-words text-[8px] text-gray-300">
                                  {row.displayLabel}
                                </p>
                                {row.reasonKo && (
                                  <p className="mt-1 break-words text-[8px] text-gray-400">
                                    {row.reasonKo}
                                  </p>
                                )}
                                {row.requiredHumanChecksKo && (
                                  <p className="mt-1 break-words text-[8px] text-amber-100">
                                    확인: {row.requiredHumanChecksKo}
                                  </p>
                                )}
                                {row.copyableText && (
                                  <p className="mt-1 break-words text-[8px] text-cyan-100">
                                    {row.copyableText}
                                  </p>
                                )}
                                {row.manualText && (
                                  <p className="mt-1 break-words text-[8px] text-amber-100">
                                    {row.manualText}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlHumanDecisionBriefDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlWorktableSuggestionDisplay && (
                  <div
                    aria-label="HITL Worktable Suggestions"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlWorktableSuggestionDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlWorktableSuggestionDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-teal-800/70 bg-teal-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-teal-100">
                          {operationalHitlWorktableSuggestionDisplay.title}
                        </p>
                        <p className="mt-1 text-teal-200">
                          {operationalHitlWorktableSuggestionDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlWorktableSuggestionDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlWorktableSuggestionDisplay.summaryText}
                    </p>
                    {operationalHitlWorktableSuggestionDisplay.riskText && (
                      <p className="mt-1 break-words text-amber-100">
                        {operationalHitlWorktableSuggestionDisplay.riskText}
                      </p>
                    )}
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlWorktableSuggestionDisplay.nextActionKo}
                    </p>
                    {operationalHitlWorktableSuggestionDisplay.rowPreviews.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {operationalHitlWorktableSuggestionDisplay.rowPreviews.map(row => (
                          <div
                            key={`${row.queueCode}:${row.decisionId}:${row.action}`}
                            className="rounded bg-gray-950/40 px-2 py-1"
                          >
                            <p className="break-words text-[8px] font-semibold text-teal-50">
                              {row.queueCode} · {row.decisionId} · {row.action} · {row.risk}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-300">
                              {row.displayLabel}
                            </p>
                            <p className="mt-1 break-words text-[8px] text-gray-400">
                              {row.reasonKo}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlWorktableSuggestionDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlActionPackDisplay && (
                  <div
                    aria-label="HITL Action Pack"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlActionPackDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlActionPackDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-cyan-800/70 bg-cyan-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-cyan-100">
                          {operationalHitlActionPackDisplay.title}
                        </p>
                        <p className="mt-1 text-cyan-200">
                          {operationalHitlActionPackDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlActionPackDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlActionPackDisplay.summaryText}
                    </p>
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlActionPackDisplay.nextActionKo}
                    </p>
                    {operationalHitlActionPackDisplay.nextCommand && (
                      <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-cyan-100">
                        {operationalHitlActionPackDisplay.nextCommand}
                      </p>
                    )}
                    {operationalHitlActionPackDisplay.actionStepPreviews.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {operationalHitlActionPackDisplay.actionStepPreviews.map(step => (
                          <p key={step} className="break-words text-[8px] text-cyan-50">
                            {step}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlActionPackDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalLabelConflictWorkflowDisplay && (
                  <div
                    aria-label="Label Conflict Workflow"
                    className={`mt-2 rounded border p-2 ${
                      operationalLabelConflictWorkflowDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalLabelConflictWorkflowDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-orange-800/70 bg-orange-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-orange-100">
                          {operationalLabelConflictWorkflowDisplay.title}
                        </p>
                        <p className="mt-1 text-orange-200">
                          {operationalLabelConflictWorkflowDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalLabelConflictWorkflowDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalLabelConflictWorkflowDisplay.summaryText}
                    </p>
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalLabelConflictWorkflowDisplay.nextActionKo}
                    </p>
                    {operationalLabelConflictWorkflowDisplay.nextCommand && (
                      <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-orange-100">
                        {operationalLabelConflictWorkflowDisplay.nextCommand}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalLabelConflictWorkflowDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {operationalHitlWorkflowDisplay && (
                  <div
                    aria-label="HITL Workflow"
                    className={`mt-2 rounded border p-2 ${
                      operationalHitlWorkflowDisplay.severity === 'danger'
                        ? 'border-red-800/70 bg-red-950/30'
                        : operationalHitlWorkflowDisplay.severity === 'success'
                          ? 'border-emerald-800/70 bg-emerald-950/25'
                          : 'border-cyan-800/70 bg-cyan-950/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-cyan-100">
                          {operationalHitlWorkflowDisplay.title}
                        </p>
                        <p className="mt-1 text-cyan-200">
                          {operationalHitlWorkflowDisplay.statusLabel}
                        </p>
                      </div>
                      <span className="rounded bg-gray-950/50 px-2 py-1 text-[8px] text-gray-300">
                        {operationalHitlWorkflowDisplay.status}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-gray-300">
                      {operationalHitlWorkflowDisplay.summaryText}
                    </p>
                    <p className="mt-1 break-words text-gray-400">
                      다음: {operationalHitlWorkflowDisplay.nextActionKo}
                    </p>
                    {operationalHitlWorkflowDisplay.nextCommand && (
                      <p className="mt-1 break-words rounded bg-gray-950/40 px-2 py-1 font-mono text-[8px] text-cyan-100">
                        {operationalHitlWorkflowDisplay.nextCommand}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {operationalHitlWorkflowDisplay.safetyBadges.map(badge => (
                        <span
                          key={badge}
                          className="rounded bg-gray-900/80 px-2 py-1 text-[8px] text-gray-200"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-1 text-gray-500">
                  Common Agent handoff: Graph/Model 활성화 금지 · HITL 필요
                </p>
              </div>
              {operationalRelease ? (
                <>
                  <div className="mt-3 space-y-2 text-[10px] text-gray-300">
                    <p className="leading-relaxed text-sky-100">
                      {operationalRelease.decisionCard.summary}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded bg-sky-900/70 px-2 py-1 text-[9px] text-sky-100">
                        조치: {releaseActionLabel(operationalRelease.decisionCard.primaryAction)}
                      </span>
                      <span className="rounded bg-gray-800 px-2 py-1 text-[9px] text-gray-200">
                        사람 승인 필요
                      </span>
                      <span className="rounded bg-gray-800 px-2 py-1 text-[9px] text-gray-200">
                        자동 적용 금지
                      </span>
                      <span className={`rounded px-2 py-1 text-[9px] ${
                        operationalRelease.decisionCard.evidenceBundle.complete
                          ? 'bg-emerald-900/60 text-emerald-200'
                          : 'bg-amber-900/60 text-amber-200'
                      }`}>
                        근거 {operationalRelease.decisionCard.evidenceBundle.items.length}건
                      </span>
                    </div>
                    <div className="rounded border border-gray-700/70 bg-gray-950/40 p-2">
                      <p className={`font-semibold ${
                        operationalRelease.decisionCard.evidenceBundle.complete
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}>
                        {operationalRelease.decisionCard.evidenceBundle.complete
                          ? '운영 근거 연결 완료'
                          : `운영 근거 미연결: ${operationalRelease.decisionCard.evidenceBundle.missingEvidence.map(releaseEvidenceKindLabel).join(', ')}`}
                      </p>
                      {operationalRelease.decisionCard.evidenceBundle.items.slice(0, 3).map(item => (
                        <p key={`${item.kind}:${item.uri}`} className="mt-1 break-words text-[9px] text-gray-400">
                          {releaseEvidenceKindLabel(item.kind)}: {item.uri}
                        </p>
                      ))}
                      {operationalEvidenceAlignment && (
                        <div className={`mt-2 rounded border p-2 ${
                          operationalEvidenceAlignment.passed
                            ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-200'
                            : 'border-red-900/60 bg-red-950/20 text-red-200'
                        }`}>
                          <p className="font-semibold">
                            {operationalEvidenceAlignment.passed
                              ? '운영 근거 정합성 확인 완료'
                              : '운영 근거 정합성 실패'}
                          </p>
                          {operationalEvidenceAlignment.issues.slice(0, 2).map(issue => (
                            <p key={`${issue.check}:${issue.message}`} className="mt-1 break-words text-[9px]">
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sky-200">운영 확인 절차</p>
                      {operationalRelease.decisionCard.operatorSteps.slice(0, 3).map(step => (
                        <p key={step} className="mt-1 break-words text-gray-300">
                          {step}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-300">
                    <span>
                      Top-1{' '}
                      <strong className="text-white">
                        {(operationalRelease.candidate.top1Accuracy * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      Top-3{' '}
                      <strong className="text-white">
                        {(operationalRelease.candidate.top3Accuracy * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      선택 정확도{' '}
                      <strong className="text-white">
                        {(operationalRelease.candidate.selectiveAccuracy * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      위험 오판{' '}
                      <strong className={
                        operationalRelease.candidate.unsafeFalsePositiveRate > 0.05
                          ? 'text-red-300'
                          : 'text-white'
                      }>
                        {(operationalRelease.candidate.unsafeFalsePositiveRate * 100).toFixed(1)}%
                      </strong>
                    </span>
                    <span>
                      ECE{' '}
                      <strong className={
                        operationalRelease.candidate.expectedCalibrationError > 0.08
                          ? 'text-red-300'
                          : 'text-white'
                      }>
                        {operationalRelease.candidate.expectedCalibrationError.toFixed(4)}
                      </strong>
                    </span>
                    <span>
                      P95{' '}
                      <strong className="text-white">
                        {operationalRelease.candidate.p95LatencyMs}ms
                      </strong>
                    </span>
                  </div>
                  <p className="mt-2 break-words text-[9px] text-sky-200/70">
                    결정 대상: {operationalRelease.decisionCard.targetVersion.modelVersion} /{' '}
                    {operationalRelease.decisionCard.targetVersion.promptVersion} /{' '}
                    {operationalRelease.decisionCard.targetVersion.graphVersion}
                  </p>
                  <p className="mt-1 break-words text-[9px] text-gray-500">
                    후보: {operationalRelease.candidateVersion.modelVersion} /{' '}
                    {operationalRelease.candidateVersion.promptVersion} /{' '}
                    {operationalRelease.candidateVersion.graphVersion}
                  </p>
                  {operationalRelease.rollbackTarget && (
                    <p className="mt-1 break-words text-[9px] text-red-200">
                      롤백 대상: {operationalRelease.rollbackTarget.modelVersion} /{' '}
                      {operationalRelease.rollbackTarget.promptVersion} /{' '}
                      {operationalRelease.rollbackTarget.graphVersion}
                    </p>
                  )}
                  {operationalRelease.decisionCard.blockingReasons.length > 0 && (
                    <p className="mt-1 break-words text-[9px] text-amber-200">
                      차단 기준: {operationalRelease.decisionCard.blockingReasons.join(', ')}
                    </p>
                  )}
                  <div className="mt-3 rounded border border-sky-900/60 bg-gray-900/40 p-2">
                    {operationalRelease.operatorDecision ? (
                      <div className="text-[10px] text-gray-300">
                        <p className="font-semibold text-emerald-300">운영 조치 확인 완료</p>
                        <p className="mt-1 break-words">
                          {releaseActionLabel(operationalRelease.operatorDecision.action)} ·{' '}
                          {operationalRelease.operatorDecision.operator} ·{' '}
                          {new Date(operationalRelease.operatorDecision.decidedAt).toLocaleString()}
                        </p>
                        <p className="mt-1 break-words text-gray-400">
                          {operationalRelease.operatorDecision.comment}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            value={releaseOperator}
                            onChange={event => setReleaseOperator(event.target.value)}
                            placeholder="담당자"
                            className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] text-white outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={handleConfirmOperationalDecision}
                            disabled={
                              !operationalRelease.decisionCard.evidenceBundle.complete
                              || !operationalEvidenceAlignment?.passed
                            }
                            className="rounded bg-sky-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {releaseActionLabel(operationalRelease.decisionCard.primaryAction)} 확인
                          </button>
                        </div>
                        <textarea
                          value={releaseOperatorComment}
                          onChange={event => setReleaseOperatorComment(event.target.value)}
                          placeholder="검토 코멘트"
                          rows={2}
                          className="w-full resize-none rounded border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] text-white outline-none focus:border-sky-500"
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
                  baseline과 후보를 같은 holdout 코호트에서 비교한 보고서를 등록하기 전에는
                  현재 운영 버전을 유지합니다.
                </p>
              )}
            </div>
            {aiOrchestrationMode !== 'legacy' && (
              <div className="mt-3 rounded-lg border border-emerald-900/70 bg-emerald-950/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-emerald-100">Common Agent 승인 Vision 데이터 품질</p>
                    <p className={`mt-1 text-xs font-semibold ${
                      visionReadiness?.retirementDataReady ? 'text-emerald-300' : 'text-amber-300'
                    }`}>
                      {visionReadiness
                        ? visionReadiness.retirementDataReady
                          ? '실데이터 수량 및 필수 결함군 기준 충족'
                          : `유효 승인 ${visionReadiness.cleanApproved}/20건 · ${visionReadiness.additionalCleanImagesRequired}건 추가 필요${visionReadiness.learningIneligibleApproved > 0 ? ` · 학습 제외 ${visionReadiness.learningIneligibleApproved}건` : ''}`
                        : isLoadingVisionReadiness ? '승인 이미지와 원본 해시 확인 중...' : '데이터를 조회하지 못했습니다.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshVisionReadiness}
                    disabled={isLoadingVisionReadiness}
                    className="shrink-0 rounded bg-emerald-800 px-2 py-1 text-[10px] text-emerald-100 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoadingVisionReadiness ? '확인 중' : '새로고침'}
                  </button>
                </div>

                {visionReadiness && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-gray-300">
                      <span>전체 <strong className="text-white">{visionReadiness.total}건</strong></span>
                      <span>승인 <strong className="text-white">{visionReadiness.approved}건</strong></span>
                      <span>검토 필요 <strong className="text-white">{visionReadiness.needsReview + visionReadiness.candidate}건</strong></span>
                      <span>라벨 충돌 <strong className={visionReadiness.conflictGroups.length ? 'text-red-300' : 'text-white'}>{visionReadiness.conflictGroups.length}그룹</strong></span>
                      <span>해시 누락 <strong className={visionReadiness.missingHashApproved ? 'text-amber-300' : 'text-white'}>{visionReadiness.missingHashApproved}건</strong></span>
                      <span>라벨 누락 <strong className={visionReadiness.missingLabelApproved ? 'text-amber-300' : 'text-white'}>{visionReadiness.missingLabelApproved}건</strong></span>
                    </div>
                    <div className="mt-3 rounded border border-gray-700 bg-gray-950/30 p-2">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-bold text-gray-200">API 비용 없는 결함군 수집 현황</span>
                        <span className="text-gray-500">
                          관측 {visionReadiness.observedDefectClasses}/7 · 검증 {visionReadiness.coveredDefectClasses}/7
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {visionReadiness.defectClassCoverage.map(item => (
                          <span
                            key={item.defectClass}
                            className={`rounded border px-1.5 py-0.5 text-[9px] ${
                              item.covered
                                ? 'border-emerald-800 text-emerald-300'
                                : item.count > 0
                                  ? 'border-amber-800 text-amber-300'
                                  : 'border-gray-700 text-gray-500'
                            }`}
                          >
                            {DEFECT_CLASS_LABELS[item.defectClass] || item.defectClass}{' '}
                            {item.count}/{item.required}
                            {!item.covered && ` · 부족 ${item.missing}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    {visionReadiness.conflictGroups.length > 0 && (
                      <div className="mt-3 rounded border border-red-900/60 bg-red-950/30 p-2 text-[10px] text-red-200">
                        {visionReadiness.conflictGroups.map(group => (
                          <p key={group.contentSha256}>
                            동일 이미지 {group.imageIds.length}건: {group.labels.join(' / ')}
                          </p>
                        ))}
                        <p className="mt-1 text-red-300/80">상충 레코드는 수정 승인 전까지 전환 표본에서 제외됩니다.</p>
                      </div>
                    )}
                    {visionReadiness.defectTypeCounts.length > 0 && (
                      <p className="mt-2 text-[10px] text-emerald-200/70">
                        유효 라벨: {visionReadiness.defectTypeCounts
                          .slice(0, 5)
                          .map(item => `${item.defectType} ${item.count}`)
                          .join(' · ')}
                      </p>
                    )}
                  </>
                )}
                {visionReadinessError && (
                  <p className="mt-2 break-all text-[10px] text-red-300">{visionReadinessError}</p>
                )}
                <p className="mt-2 text-[10px] text-gray-500">
                  이 항목은 표본 품질 게이트입니다. 레거시 제거에는 별도로 Vision 결함 정확도 80% 이상이 필요합니다.
                </p>
              </div>
            )}
          </div>

          {aiOrchestrationMode !== 'legacy' && (
            <div className="rounded-lg border border-sky-900/70 bg-sky-950/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-sky-100">로컬 공정 지식 중앙 이전</p>
                  <p className="mt-1 text-[11px] text-sky-200/70">
                    knowledge_matrix를 출처가 보존된 문서로 변환해 Common Agent SQL 및 Graph 수집 파이프라인에 등록합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleKnowledgeMigration}
                  disabled={isMigratingKnowledge}
                  className="shrink-0 rounded bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isMigratingKnowledge ? '이전 중' : '지식 이전'}
                </button>
              </div>
              {knowledgeMigrationStatus && (
                <p className="mt-2 text-[11px] text-gray-200">{knowledgeMigrationStatus}</p>
              )}
            </div>
          )}

          {/* API Provider Config */}
          <div className="border-t border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">기존 AI 모델 (검증·대체 경로)</label>
            <div className="flex gap-4 mb-4">
                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center justify-center gap-2 transition-colors ${provider === 'gemini' ? 'bg-indigo-900/50 border-indigo-500 text-indigo-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                    <input type="radio" name="provider" value="gemini" checked={provider === 'gemini'} onChange={() => setProvider('gemini')} className="hidden" />
                    <span className="font-bold">Google Gemini</span>
                </label>
                <label className={`flex-1 cursor-pointer border rounded-lg p-3 flex items-center justify-center gap-2 transition-colors ${provider === 'openai' ? 'bg-green-900/50 border-green-500 text-green-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                    <input type="radio" name="provider" value="openai" checked={provider === 'openai'} onChange={() => setProvider('openai')} className="hidden" />
                                <span className="font-bold">OpenAI GPT-5.6</span>
                </label>
            </div>

            <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-2">
                {provider === 'gemini' ? 'Google Gemini API Key' : 'OpenAI API Key'}
            </label>

            {provider === 'gemini' ? (
                 <input
                    id="gemini-key"
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="AI Studio API Key 입력"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            ) : (
                <input
                    id="openai-key"
                    type="password"
                    value={openAiKey}
                    onChange={(e) => setOpenAiKey(e.target.value)}
                    placeholder="OpenAI API Key 입력 (sk-...)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
            )}

            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <InfoIcon className="w-3 h-3" /> 키는 각 제공자별로 안전하게 분리되어 저장됩니다.
            </div>
          </div>

          {/* Admin Password Config */}
          <div className="border-t border-gray-700 pt-4">
              <label className="block text-sm font-medium text-yellow-500 mb-2 flex items-center gap-2">
                  <LockIcon className="w-4 h-4"/> 관리자 비밀번호 변경
              </label>
              <div className="space-y-2">
                  <input
                    type="password"
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="새 관리자 비밀번호 (변경시에만 입력)"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
                />
                <input
                    type="password"
                    value={confirmAdminPassword}
                    onChange={(e) => setConfirmAdminPassword(e.target.value)}
                    placeholder="비밀번호 확인"
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-500"
                />
              </div>
          </div>

          {/* Shortcut Config */}
          <div className="border-t border-gray-700 pt-4">
             <label htmlFor="shortcut" className="block text-sm font-medium text-gray-300 mb-2">
                캡처 단축키
             </label>
             <div className="flex gap-2">
                 <div
                    className={`flex-grow bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white text-center font-mono cursor-pointer focus:outline-none ${isRecording ? 'border-indigo-500 ring-2 ring-indigo-500 bg-gray-600' : ''}`}
                    onClick={() => setIsRecording(true)}
                    tabIndex={0}
                    onKeyDown={handleKeyDown}
                 >
                    {isRecording ? "키 조합을 누르세요..." : shortcut}
                 </div>
                 <button
                    onClick={() => { setShortcut('CommandOrControl+Shift+C'); setIsRecording(false); }}
                    className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-xs text-white whitespace-nowrap"
                 >
                    초기화
                 </button>
             </div>
          </div>

          {/* Proxy Config */}
           <div>
            <label htmlFor="proxy-url" className="block text-sm font-medium text-gray-300 mb-2">
                프록시 서버 URL (선택 사항)
            </label>
            <input
                id="proxy-url"
                type="text"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="http://user:pass@host:port"
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <label htmlFor="agent-server-url" className="block text-sm font-medium text-gray-300 mb-2">
                Common Agent URL
            </label>
            <input
                id="agent-server-url"
                type="text"
                value={agentServerUrl}
                onChange={(e) => setAgentServerUrl(e.target.value)}
                placeholder={`${DEFAULT_AGENT_SERVER_URL} (비워두면 기본값 사용)`}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">Vision, Graph, 문서 자동작성, HITL API의 기준 주소입니다. 비워두면 {DEFAULT_AGENT_SERVER_URL}을 사용합니다.</p>
            <label htmlFor="vision-qa-server-url" className="mt-3 block text-sm font-medium text-gray-300">
                Vision QA URL (선택 사항)
            </label>
            <input
                id="vision-qa-server-url"
                type="text"
                value={visionQaServerUrl}
                onChange={(event) => setVisionQaServerUrl(event.target.value)}
                placeholder="로컬 분리형 예: http://127.0.0.1:8103"
                className="mt-2 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              비워두면 로컬 8000 구성은 8103으로, 통합 외부 서버 구성은 Common Agent URL과 동일하게 추론합니다.
            </p>
            <div className="mt-4 rounded-lg border border-sky-900/70 bg-sky-950/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-sky-100">Vision 기준 샘플 벤치마크 게이트</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                    Common Agent Graph 진단 전에 승인 이미지 기준 샘플로 현재 Vision 모델을 검증합니다.
                    Shadow는 경고만 남기고, Enforce는 기준 미달 시 기존 AI 경로로 대체합니다.
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-[9px] font-bold ${
                  visionReferenceBenchmarkGateMode === 'enforce'
                    ? 'bg-red-900/60 text-red-100'
                    : visionReferenceBenchmarkGateMode === 'shadow'
                      ? 'bg-amber-900/60 text-amber-100'
                      : 'bg-gray-700 text-gray-300'
                }`}>
                  {visionReferenceBenchmarkGateMode.toUpperCase()}
                </span>
              </div>

              <label htmlFor="vision-reference-benchmark-gate-mode" className="mt-3 block text-[11px] font-medium text-gray-300">
                게이트 모드
              </label>
              <select
                id="vision-reference-benchmark-gate-mode"
                value={visionReferenceBenchmarkGateMode}
                onChange={(event) =>
                  setVisionReferenceBenchmarkGateMode(event.target.value as VisionReferenceBenchmarkGateMode)
                }
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="off">Off - 진단 차단 없음</option>
                <option value="shadow">Shadow - 실패 경고만 기록</option>
                <option value="enforce">Enforce - 기준 미달 시 Graph 진단 차단</option>
              </select>

              <label htmlFor="vision-reference-benchmark-model-version" className="mt-3 block text-[11px] font-medium text-gray-300">
                모델 버전
              </label>
              <input
                id="vision-reference-benchmark-model-version"
                type="text"
                value={visionReferenceBenchmarkModelVersion}
                onChange={(event) => setVisionReferenceBenchmarkModelVersion(event.target.value)}
                placeholder="예: dinov2:facebook/dinov2-base"
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <label htmlFor="vision-reference-benchmark-required-defects" className="mt-3 block text-[11px] font-medium text-gray-300">
                필수 결함군
              </label>
              <input
                id="vision-reference-benchmark-required-defects"
                type="text"
                value={visionReferenceBenchmarkRequiredDefectTypes}
                onChange={(event) => setVisionReferenceBenchmarkRequiredDefectTypes(event.target.value)}
                placeholder="예: whitening, sink_mark, weld_line"
                className="mt-1 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  value={visionReferenceBenchmarkMinimumSamples}
                  onChange={(event) => setVisionReferenceBenchmarkMinimumSamples(event.target.value)}
                  placeholder="최소 샘플 수"
                  className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min="0"
                  value={visionReferenceBenchmarkMinimumSamplesPerClass}
                  onChange={(event) => setVisionReferenceBenchmarkMinimumSamplesPerClass(event.target.value)}
                  placeholder="결함군별 최소 수"
                  className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={visionReferenceBenchmarkMinimumTop1Accuracy}
                  onChange={(event) => setVisionReferenceBenchmarkMinimumTop1Accuracy(event.target.value)}
                  placeholder="Top-1 기준 예: 0.85"
                  className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={visionReferenceBenchmarkMinimumTop3Accuracy}
                  onChange={(event) => setVisionReferenceBenchmarkMinimumTop3Accuracy(event.target.value)}
                  placeholder="Top-3 기준 예: 0.95"
                  className="rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
                값이 비어 있으면 Common Agent의 서버 기본값을 사용합니다. 운영 전환 전에는 Shadow로 누적 로그를 확인한 뒤 Enforce로 승격하는 흐름을 권장합니다.
              </p>
            </div>
          </div>
        </main>

        <footer className="p-4 border-t border-gray-700 flex justify-between items-center">
          <p className={`text-sm ${status.includes('저장') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
          <button onClick={handleSave} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
            <SaveIcon className="w-5 h-5" />
            저장
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsModal;
