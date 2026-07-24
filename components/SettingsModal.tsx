

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
  parseVisionOperationalReleaseReport,
  readVisionOperationalReleaseReport,
  saveVisionOperationalReleaseReport,
  VisionOperationalReleaseReport
} from '../services/visionOperationalReleaseGate';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (config: ApiConfig) => void;
  initialConfig: ApiConfig | null;
}

const releaseDecisionLabel = (
  report: VisionOperationalReleaseReport | null
): string => {
  if (!report) return 'Shadow 평가 보고서 필요';
  if (report.decision === 'promote_candidate') return '후보 버전 승격 가능';
  if (report.decision === 'rollback_required') return '직전 버전 롤백 필요';
  return 'Shadow 모드 유지';
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
  const [releaseImportStatus, setReleaseImportStatus] = useState('');
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
    const report = {
      generatedAt: new Date().toISOString(),
      readiness: calculateTransitionReadiness(records),
      observability: calculateDiagnosisObservability(records),
      operationalRelease,
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
      setReleaseImportStatus('운영 평가 보고서를 검증하고 등록했습니다.');
    } catch (error) {
      setReleaseImportStatus(
        error instanceof Error ? `보고서 등록 실패: ${error.message}` : '보고서 등록 실패'
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
                  {operationalRelease && (
                    <span className="text-[9px] text-gray-500">
                      {new Date(operationalRelease.generatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {releaseImportStatus && (
                <p className={`mt-2 text-[9px] ${
                  releaseImportStatus.startsWith('보고서 등록 실패')
                    ? 'text-red-300'
                    : 'text-emerald-300'
                }`}>
                  {releaseImportStatus}
                </p>
              )}
              {operationalRelease ? (
                <>
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
                  {operationalRelease.blockingReasons.length > 0 && (
                    <p className="mt-1 break-words text-[9px] text-amber-200">
                      차단 기준: {operationalRelease.blockingReasons.join(', ')}
                    </p>
                  )}
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
                          : `유효 승인 ${visionReadiness.cleanApproved}/20건 · ${visionReadiness.additionalCleanImagesRequired}건 추가 필요`
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
                placeholder="예: dinov2-reference-v1"
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
