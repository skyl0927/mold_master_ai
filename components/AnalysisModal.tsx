

import React, { useState, useEffect } from 'react';
import { CapturedImage, DefectAnalysis, VisionObservationSummary, VisionSafetyGateSummary } from '../types';
import { CloseIcon, ClipboardIcon, SparklesIcon, SaveIcon, LockIcon } from './Icons';
import {
    resolveVisionHitlDecision,
    VisionHitlDecision
} from '../services/visionHitlDecisionProtocol';

interface AnalysisModalProps {
  image: CapturedImage | undefined;
  isLoading: boolean;
  onClose: () => void;
  onTryAgain: () => void;
  // Function to save corrected analysis to knowledge base
  onTrainAI: (correctedAnalysis: DefectAnalysis, status: VisionHitlDecision) => Promise<void> | void;
  isAdmin: boolean;
}

// EXTENDED DATASET for Data Binding
const DEFECT_TEMPLATES: Record<string, { desc: string; cause: string; counter: string }> = {
    "Sink Mark (수축)": {
        desc: "성형품 표면이 부분적으로 오목하게 들어가는 현상. 주로 리브나 보스 등 살두께가 두꺼운 부분의 뒷면에서 발생함.",
        cause: "1. 보압 부족 또는 보압 시간 짧음\n2. 수지 온도 또는 금형 온도 과다\n3. 게이트 크기 협소로 인한 조기 고화\n4. 살두께 불균일",
        counter: "1. 보압 압력 및 시간 증대\n2. 수지 온도 및 금형 온도 하향 조정\n3. 게이트 크기 확대 및 위치 변경\n4. 살두께 균일화 설계 변경 (살빼기 적용)"
    },
    "싱크 마크 (Sink Mark)": { // Korean Alias
        desc: "성형품 표면이 부분적으로 오목하게 들어가는 현상. 주로 리브나 보스 등 살두께가 두꺼운 부분의 뒷면에서 발생함.",
        cause: "1. 보압 부족 또는 보압 시간 짧음\n2. 수지 온도 또는 금형 온도 과다\n3. 게이트 크기 협소로 인한 조기 고화\n4. 살두께 불균일",
        counter: "1. 보압 압력 및 시간 증대\n2. 수지 온도 및 금형 온도 하향 조정\n3. 게이트 크기 확대 및 위치 변경\n4. 살두께 균일화 설계 변경 (살빼기 적용)"
    },
    "Short Shot (미성형)": {
        desc: "캐비티 내에 수지가 완전히 충전되지 않아 제품의 일부가 비어 있는 현상. 주로 유동 말단부나 얇은 리브에서 발생.",
        cause: "1. 사출 압력 또는 사출 속도 부족\n2. 계량(Shot Size) 부족\n3. 가스 빼기(Venting) 불량\n4. 수지 유동성 부족",
        counter: "1. 사출 압력 및 속도 상향\n2. 계량 위치(Cushion 양) 확인 및 증대\n3. 에어 벤트 추가 및 세척\n4. 유동성이 좋은 수지 등급으로 변경"
    },
    "미성형 (Short Shot)": { // Korean Alias
        desc: "캐비티 내에 수지가 완전히 충전되지 않아 제품의 일부가 비어 있는 현상. 주로 유동 말단부나 얇은 리브에서 발생.",
        cause: "1. 사출 압력 또는 사출 속도 부족\n2. 계량(Shot Size) 부족\n3. 가스 빼기(Venting) 불량\n4. 수지 유동성 부족",
        counter: "1. 사출 압력 및 속도 상향\n2. 계량 위치(Cushion 양) 확인 및 증대\n3. 에어 벤트 추가 및 세척\n4. 유동성이 좋은 수지 등급으로 변경"
    },
    "Flash (Burr, 플래시)": {
        desc: "금형의 파팅 라인(PL), 핀 구멍 등의 틈새로 수지가 흘러나와 얇은 막이 형성된 현상.",
        cause: "1. 사출 압력 과다 또는 형체력 부족\n2. 금형 파팅 면 손상 또는 이물질\n3. 수지 온도 과다로 인한 점도 저하",
        counter: "1. 사출 압력 하향 및 형체력 증대\n2. 금형 파팅 면 수정 및 세척\n3. 수지 온도 하향 조정"
    },
    "플래시/버 (Flash/Burr)": { // Korean Alias
        desc: "금형의 파팅 라인(PL), 핀 구멍 등의 틈새로 수지가 흘러나와 얇은 막이 형성된 현상.",
        cause: "1. 사출 압력 과다 또는 형체력 부족\n2. 금형 파팅 면 손상 또는 이물질\n3. 수지 온도 과다로 인한 점도 저하",
        counter: "1. 사출 압력 하향 및 형체력 증대\n2. 금형 파팅 면 수정 및 세척\n3. 수지 온도 하향 조정"
    },
    "Flow Mark (유동 자국)": {
        desc: "게이트를 중심으로 동심원 모양의 물결무늬가 제품 표면에 나타나는 현상.",
        cause: "1. 금형 온도 또는 수지 온도 저하\n2. 사출 속도 부적절 (너무 느림)\n3. 게이트 크기 협소",
        counter: "1. 금형 및 수지 온도 상향\n2. 사출 속도 조절 (다단 제어)\n3. 콜드 슬러그 웰 크기 증대"
    },
    "유동 자국 (Flow Mark)": { // Korean Alias
        desc: "게이트를 중심으로 동심원 모양의 물결무늬가 제품 표면에 나타나는 현상.",
        cause: "1. 금형 온도 또는 수지 온도 저하\n2. 사출 속도 부적절 (너무 느림)\n3. 게이트 크기 협소",
        counter: "1. 금형 및 수지 온도 상향\n2. 사출 속도 조절 (다단 제어)\n3. 콜드 슬러그 웰 크기 증대"
    },
    "Weld Line (웰드 라인)": {
        desc: "두 갈래 이상의 수지 흐름이 만나 융합되는 지점에서 생기는 가느다란 선.",
        cause: "1. 수지 온도 또는 금형 온도 낮음\n2. 사출 압력 및 속도 부족\n3. 게이트 위치 부적절",
        counter: "1. 수지 및 금형 온도 상향\n2. 사출 속도 및 압력 증대\n3. 가스 빼기(Vent) 개선 및 게이트 위치 변경"
    },
    "웰드 라인 (Weld Line)": { // Korean Alias
        desc: "두 갈래 이상의 수지 흐름이 만나 융합되는 지점에서 생기는 가느다란 선.",
        cause: "1. 수지 온도 또는 금형 온도 낮음\n2. 사출 압력 및 속도 부족\n3. 게이트 위치 부적절",
        counter: "1. 수지 및 금형 온도 상향\n2. 사출 속도 및 압력 증대\n3. 가스 빼기(Vent) 개선 및 게이트 위치 변경"
    },
    "Burn Mark (탄 자국)": {
        desc: "캐비티 내의 공기가 갇혀 단열 압축에 의해 고온이 발생, 수지가 타서 검게 변하는 현상. 주로 유동 말단에서 발생.",
        cause: "1. 사출 속도 과다\n2. 에어 벤트(Gas Vent) 불량\n3. 배압 부족",
        counter: "1. 말단부 사출 속도 하향 (다단 제어)\n2. 에어 벤트 추가 및 깊이 수정\n3. 금형 세척"
    },
    "가스 자국/탄 자국 (Burn Mark)": { // Korean Alias
        desc: "캐비티 내의 공기가 갇혀 단열 압축에 의해 고온이 발생, 수지가 타서 검게 변하는 현상. 주로 유동 말단에서 발생.",
        cause: "1. 사출 속도 과다\n2. 에어 벤트(Gas Vent) 불량\n3. 배압 부족",
        counter: "1. 말단부 사출 속도 하향 (다단 제어)\n2. 에어 벤트 추가 및 깊이 수정\n3. 금형 세척"
    },
    "Jetting (제팅)": {
        desc: "게이트에서 분출된 수지가 뱀처럼 구불구불한 자국을 남기며 굳는 현상.",
        cause: "1. 게이트 통과 속도가 너무 빠름\n2. 게이트 위치나 크기 부적절\n3. 웰 위치가 없거나 작음",
        counter: "1. 사출 속도 하향 조정\n2. 게이트 크기 증대 (Fan 게이트 등)\n3. 게이트 맞은편에 충돌벽 설치"
    },
    "이젝트 핀 자국 (Ejector Pin Mark)": {
        desc: "제품 표면에 이젝트 핀에 의한 눌림 자국, 백화(Stress Mark) 또는 돌출이 발생함.",
        cause: "1. 이젝트 시 제품이 금형에 고착됨 (이형 불량)\n2. 냉각 부족으로 제품 강도가 약한 상태에서 취출\n3. 이젝트 핀의 위치 부적절 또는 핀 직경 과소\n4. 이젝트 속도 및 압력 과다",
        counter: "1. 금형 이형성 개선 (테이퍼 각 수정, 코팅, 이형제 사용)\n2. 냉각 시간 연장 또는 냉각 회로 개선\n3. 이젝트 핀 증설 및 직경 확대\n4. 이젝트 속도 및 압력 하향 조정"
    },
    "흑점 (Black Spot)": {
        desc: "성형품 표면이나 내부에 검은 점 형태의 이물질이 박혀 있는 현상.",
        cause: "1. 수지 내 이물질 혼입 (재분쇄재 오염)\n2. 배럴 및 스크류 내 탄화된 수지 잔류물 박리\n3. 주변 환경의 먼지 유입",
        counter: "1. 호퍼 및 건조기 청소, 원재료 관리 철저\n2. 퍼징(Purging) 실시 및 스크류 세척\n3. 성형기 주변 청결 유지"
    },
    "스크래치 (Scratch)": {
        desc: "제품 표면에 긁힌 자국이나 손상이 발생함.",
        cause: "1. 취출 시 로봇 또는 슈트(Chute)와의 마찰\n2. 금형 표면(캐비티)의 손상\n3. 포장 및 적재 과정에서의 부주의",
        counter: "1. 취출 로봇 지그 수정 및 슈트 보호재 부착\n2. 금형 표면 폴리싱(Polishing) 재작업\n3. 적재 방식 개선 및 간지 사용"
    },
    "기포 (Void/Bubble)": {
        desc: "성형품 내부에 빈 공간(공극)이 생기는 현상.",
        cause: "1. 살두께가 두꺼운 부분의 수축 불균일 (진공 기포)\n2. 수지 내 수분 또는 휘발 가스 (가스 기포)",
        counter: "1. 보압 및 냉각 시간 증대 (진공 기포)\n2. 수지 건조 강화 및 배압 증대 (가스 기포)"
    }
};

const formatRetrievalMode = (mode: string) => mode.replace(/_/g, ' ').toUpperCase();

const VISION_GATE_REASON_LABELS: Record<string, string> = {
    legacy_observation_contract: '구형 Vision 응답 계약',
    image_quality_warning: '사진 품질 경고',
    image_quality_rejected: '사진 품질 불량으로 재촬영 필요',
    visual_abnormality_not_confirmed: '시각적 이상 확정 불가',
    single_candidate_requires_review: '후보가 1개뿐이라 교차 확인 필요',
    top_candidate_confidence_below_safety_floor: 'Top 후보 신뢰도 부족',
    top_candidate_margin_too_small: 'Top 후보와 2순위 차이 부족',
    insufficient_independent_visual_evidence: '독립 시각 근거 부족',
    single_visual_evidence_category: '근거 범주가 1종에 치우침',
    top_candidate_has_contradicting_evidence: 'Top 후보에 반대 근거 존재',
    provider_contract_invalid: 'Vision 응답 계약 오류',
    non_physical_image: '문서/도면 이미지로 물리 결함 판정 금지',
    no_visible_defect: '표시 결함 확인 불가',
    no_classifiable_candidate: '분류 가능한 결함 후보 없음',
    missing_visual_observations: '시각 관찰 근거 누락',
    candidate_without_observation_evidence: '후보가 관찰 근거를 인용하지 않음'
};

const formatVisionPolicy = (policy: VisionSafetyGateSummary['candidateUsePolicy']) => {
    if (policy === 'candidate_primary_graph_cross_check') {
        return 'Graph 사용: 후보 우선 + Graph 교차검증';
    }
    if (policy === 'graph_cross_check_only') {
        return 'Graph 사용: 교차검증 전용';
    }
    return 'Graph 사용 금지: 재촬영/HITL 전용';
};

const formatVisionGateStatus = (status: VisionSafetyGateSummary['status']) => {
    if (status === 'reliable') return '시각 근거 신뢰 가능';
    if (status === 'blocked') return '자동 진단 차단';
    return '사람 검토 필요';
};

const buildVisionReviewReasonText = (summary: VisionObservationSummary) => {
    const safetyReasons = (summary.safetyGate?.reasons || [])
        .map(reason => VISION_GATE_REASON_LABELS[reason] || reason);
    const additionalViews = summary.requiredAdditionalViews
        .map(view => `추가 촬영: ${view}`);
    const reasons = [
        ...summary.qualityConcerns,
        ...safetyReasons,
        ...additionalViews,
        summary.abstentionReason,
        ...summary.validationIssues.map(issue => VISION_GATE_REASON_LABELS[issue] || issue)
    ]
        .map(reason => reason.trim())
        .filter(Boolean);
    const uniqueReasons = Array.from(new Set(reasons));
    return uniqueReasons.length > 0 ? uniqueReasons.slice(0, 5).join(', ') : '없음';
};

// Interface for Custom Defect Data
interface CustomDefectData {
    defectType: string;
    description: string;
    possibleCauses: string;
    countermeasures: string;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ image, isLoading, onClose, onTryAgain, onTrainAI, isAdmin }) => {
    const [copySuccess, setCopySuccess] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editableData, setEditableData] = useState<DefectAnalysis | null>(null);
    const [trainStatus, setTrainStatus] = useState('');

    // Updated: Store full defect info for custom types
    const [customDefectTypes, setCustomDefectTypes] = useState<CustomDefectData[]>([]);
    const [isManualInput, setIsManualInput] = useState(false);

    useEffect(() => {
        if (image?.analysis) {
            setEditableData({ ...image.analysis });
        }
    }, [image?.analysis]);

    // Load user feedback from DB to populate dropdown on mount
    useEffect(() => {
        const loadUserFeedback = async () => {
            try {
                const feedback = await window.electronAPI.getUserFeedback();
                if (feedback && feedback.length > 0) {
                    // Extract unique custom defects with their full data
                    const customMap = new Map<string, CustomDefectData>();

                    feedback.forEach(item => {
                        const type = item.analysis.defectType;
                        if (!DEFECT_TEMPLATES[type]) {
                            // Only add if not already in templates.
                            // Using the latest feedback for description/causes if multiple exist
                            customMap.set(type, {
                                defectType: type,
                                description: item.analysis.description,
                                possibleCauses: item.analysis.possibleCauses,
                                countermeasures: item.analysis.countermeasures
                            });
                        }
                    });

                    setCustomDefectTypes(Array.from(customMap.values()));
                }
            } catch (e) {
                console.error("Failed to load user feedback", e);
            }
        };
        loadUserFeedback();
    }, []);

    const handleCopyReport = () => {
        const data = editableData || image?.analysis;
        if (data) {
            const report = `
[사출 불량 개선 시방서]
1. 불량 유형: ${data.defectType} (${data.severity})
2. 현상: ${data.description}
3. 추정 원인:
${data.possibleCauses}
4. 개선 대책:
${data.countermeasures}
            `;
            navigator.clipboard.writeText(report).then(() => {
                setCopySuccess('보고서 복사 완료!');
                setTimeout(() => setCopySuccess(''), 2000);
            });
        }
    };

    const handleTrain = async (status: VisionHitlDecision) => {
        if (editableData) {
            const decision = resolveVisionHitlDecision(status);
            setTrainStatus(status === 'approved' ? '저장 중...' : '제출 중...');
            try {
                await onTrainAI(editableData, status);
                setTrainStatus(decision.successMessage);
                setTimeout(() => setTrainStatus(''), 3000);
                setIsEditing(false);
            } catch {
                setTrainStatus('피드백 저장 실패');
            }

            // Immediately update local state to reflect new type in dropdown if it's new
            const isKnown = DEFECT_TEMPLATES[editableData.defectType] || customDefectTypes.some(c => c.defectType === editableData.defectType);

            if (!isKnown) {
                 setCustomDefectTypes(prev => [...prev, {
                     defectType: editableData.defectType,
                     description: editableData.description,
                     possibleCauses: editableData.possibleCauses,
                     countermeasures: editableData.countermeasures
                 }]);
            }
        }
    };

    const handleDefectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedDefect = e.target.value;

        if (selectedDefect === "직접 입력") {
            setIsManualInput(true);
            if (editableData) setEditableData({ ...editableData, defectType: "" });
            return;
        }

        setIsManualInput(false);

        if (editableData) {
            // 1. Check Standard KB (Explicit Lookup)
            const template = DEFECT_TEMPLATES[selectedDefect];
            if (template) {
                setEditableData({
                    ...editableData,
                    defectType: selectedDefect,
                    description: template.desc,
                    possibleCauses: template.cause,
                    countermeasures: template.counter
                });
                return;
            }

            // 2. Check Custom/Learned DB (Explicit Lookup from loaded state)
            const custom = customDefectTypes.find(c => c.defectType === selectedDefect);
            if (custom) {
                setEditableData({
                    ...editableData,
                    defectType: selectedDefect,
                    description: custom.description,
                    possibleCauses: custom.possibleCauses,
                    countermeasures: custom.countermeasures
                });
                return;
            }

            // 3. Fallback (Just name change if not found in data sources)
            setEditableData({
                ...editableData,
                defectType: selectedDefect,
            });
        }
    };

    if (!image) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className={`bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border ${isAdmin ? 'border-yellow-500' : 'border-gray-700'}`} onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <header className="p-5 flex justify-between items-center border-b border-gray-700 bg-gray-900 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isAdmin ? 'bg-yellow-600' : 'bg-indigo-600'}`}>
                            {isAdmin ? <LockIcon className="w-6 h-6 text-white" /> : <SparklesIcon className="w-6 h-6 text-white" />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">AI 불량 진단 & 대책 보고서</h2>
                            <p className="text-xs text-gray-400">Vision AI + Knowledge Base(RAG) Analysis {isAdmin ? '(Admin Mode)' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>

                {/* Content */}
                <div className="flex-grow overflow-hidden flex flex-col md:flex-row">
                    {/* Image Section */}
                    <div className="md:w-2/5 bg-black flex items-center justify-center p-4 border-r border-gray-700">
                        <img src={image.dataUrl} alt="Defect" className="max-w-full max-h-[60vh] object-contain rounded border border-gray-700" />
                    </div>

                    {/* Report Section */}
                    <div className="md:w-3/5 p-6 overflow-y-auto bg-gray-800">
                        {isLoading ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                                <p className="text-indigo-300 font-medium animate-pulse">이미지 분석 및 표준 대책 검색 중...</p>
                                <p className="text-xs text-gray-500">Vision AI가 결함을 찾고, RAG 엔진이 대책을 매칭합니다.</p>
                            </div>
                        ) : image.analysisError ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <p className="text-red-400 font-bold text-lg mb-2">진단 실패</p>
                                <p className="text-gray-400 mb-6">{image.analysisError}</p>
                                <button onClick={onTryAgain} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">다시 시도</button>
                            </div>
                        ) : editableData ? (
                            <div className="space-y-6 font-sans">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        {isEditing ? (
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <select
                                                    className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg block w-full p-2.5"
                                                    value={editableData.severity}
                                                    onChange={(e) => setEditableData({...editableData, severity: e.target.value})}
                                                >
                                                    <option value="High">High Severity</option>
                                                    <option value="Medium">Medium Severity</option>
                                                    <option value="Low">Low Severity</option>
                                                </select>
                                            </div>
                                        ) : (
                                            <span className="inline-block px-2 py-1 text-xs font-bold text-red-100 bg-red-900/50 border border-red-700 rounded mb-2">
                                                {editableData.severity} Severity
                                            </span>
                                        )}

                                        {isEditing ? (
                                            <>
                                                <label className="text-xs text-gray-400 block mb-1">불량 유형 선택 (자동 완성):</label>
                                                <select
                                                    className="bg-gray-700 border border-gray-600 text-white text-lg font-bold rounded-lg block w-full p-2.5"
                                                    value={isManualInput ? "직접 입력" : editableData.defectType}
                                                    onChange={handleDefectChange}
                                                >
                                                    {!isManualInput && !DEFECT_TEMPLATES[editableData.defectType] && !customDefectTypes.some(c => c.defectType === editableData.defectType) && (
                                                         <option value={editableData.defectType}>{editableData.defectType} (현재)</option>
                                                    )}

                                                    <option disabled>--- 표준 불량 유형 (KB) ---</option>
                                                    {Object.keys(DEFECT_TEMPLATES).sort().map(key => (
                                                        <option key={key} value={key}>{key}</option>
                                                    ))}

                                                    {customDefectTypes.length > 0 && (
                                                        <>
                                                            <option disabled>--- 학습된 불량 유형 ---</option>
                                                            {customDefectTypes.map(c => (
                                                                <option key={c.defectType} value={c.defectType}>{c.defectType}</option>
                                                            ))}
                                                        </>
                                                    )}

                                                    <option disabled>--- 기타 ---</option>
                                                    <option value="직접 입력">직접 입력</option>
                                                </select>

                                                {isManualInput && (
                                                     <input
                                                        type="text"
                                                        className="mt-2 bg-gray-700 border border-gray-600 text-white rounded-lg block w-full p-2.5"
                                                        placeholder="불량 명칭 직접 입력"
                                                        value={editableData.defectType}
                                                        onChange={(e) => setEditableData({...editableData, defectType: e.target.value})}
                                                        autoFocus
                                                     />
                                                )}
                                            </>
                                        ) : (
                                            <h3 className="text-2xl font-bold text-white">{editableData.defectType}</h3>
                                        )}
                                        {editableData.retrievalSummary && (
                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                {editableData.orchestrationSummary && (
                                                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                                        editableData.orchestrationSummary.selectedSource === 'common_agent'
                                                            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                                                            : 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                                                    }`}>
                                                        {editableData.orchestrationSummary.selectedSource === 'common_agent'
                                                            ? 'COMMON AGENT'
                                                            : 'LEGACY FALLBACK'}
                                                    </span>
                                                )}
                                                <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-200">
                                                    Retrieval {formatRetrievalMode(editableData.retrievalSummary.modeUsed)}
                                                </span>
                                                <span className="rounded-full border border-gray-600 bg-gray-700/60 px-3 py-1 text-[11px] font-semibold text-gray-200">
                                                    Evidence {editableData.retrievalSummary.evidenceCount}
                                                </span>
                                                <span className="rounded-full border border-gray-600 bg-gray-700/60 px-3 py-1 text-[11px] font-semibold text-gray-200">
                                                    Citations {editableData.retrievalSummary.citations.length}
                                                </span>
                                                {editableData.retrievalSummary.graphGrounded && (
                                                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                                                        Graph Grounded
                                                    </span>
                                                )}
                                                {editableData.retrievalSummary.llmSupplemented && (
                                                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200">
                                                        LLM Supplement
                                                    </span>
                                                )}
                                                {editableData.orchestrationSummary?.defectTypeAgreement !== undefined && (
                                                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                                        editableData.orchestrationSummary.defectTypeAgreement
                                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                                            : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                                    }`}>
                                                        {editableData.orchestrationSummary.defectTypeAgreement ? 'DUAL MATCH' : 'DUAL REVIEW'}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        className="ml-4 text-xs text-indigo-300 hover:text-white underline whitespace-nowrap"
                                    >
                                        {isEditing ? '편집 취소' : '내용 수정'}
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {image.visionQuality && (
                                        <div className={`rounded-lg border p-4 ${
                                            image.visionQuality.status === 'pass'
                                                ? 'border-emerald-800/60 bg-emerald-950/20'
                                                : image.visionQuality.status === 'warn'
                                                    ? 'border-amber-800/60 bg-amber-950/20'
                                                    : 'border-red-800/60 bg-red-950/20'
                                        }`}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <h4 className="text-sm font-semibold text-gray-100">사진 품질 게이트</h4>
                                                <span className="rounded-full border border-gray-600 bg-gray-900/70 px-3 py-1 text-xs text-gray-200">
                                                    {image.visionQuality.score}점 · {image.visionQuality.status.toUpperCase()}
                                                </span>
                                            </div>
                                            {image.visionQuality.issues.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {image.visionQuality.issues.map(issue => (
                                                        <div key={issue.code} className="text-xs text-gray-300">
                                                            <span className="font-semibold text-amber-200">{issue.message}</span>
                                                            <span className="ml-2">{issue.recommendation}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {editableData.visionSummary && (
                                        <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-cyan-300">
                                                    구조화 Vision 관찰 및 Top-3
                                                </h4>
                                                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                                    editableData.visionSummary.decisionStatus === 'probable'
                                                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
                                                        : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                                                }`}>
                                                    {editableData.visionSummary.decisionStatus === 'probable'
                                                        ? '유력 후보'
                                                        : editableData.visionSummary.decisionStatus === 'needs_review'
                                                            ? '사람 검토 필요'
                                                            : '판정 보류'}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                                                <span className={`rounded-full border px-2 py-1 ${
                                                    editableData.visionSummary.groundingStatus === 'grounded'
                                                        ? 'border-emerald-700 text-emerald-200'
                                                        : editableData.visionSummary.groundingStatus === 'invalid'
                                                            ? 'border-red-700 text-red-200'
                                                            : 'border-amber-700 text-amber-200'
                                                }`}>
                                                    {editableData.visionSummary.contractVersion}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                                                    {editableData.visionSummary.imageKind}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                                                    {editableData.visionSummary.normalityStatus}
                                                </span>
                                            </div>
                                            {editableData.visionSummary.safetyGate && (
                                                <div className={`mt-3 rounded-lg border p-3 ${
                                                    editableData.visionSummary.safetyGate.status === 'reliable'
                                                        ? 'border-emerald-700/60 bg-emerald-950/20'
                                                        : editableData.visionSummary.safetyGate.status === 'blocked'
                                                            ? 'border-red-700/60 bg-red-950/25'
                                                            : 'border-amber-700/60 bg-amber-950/20'
                                                }`}>
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-xs font-semibold tracking-wider text-cyan-200">
                                                            Vision 판정 사용 정책
                                                        </span>
                                                        <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-200">
                                                            {editableData.visionSummary.safetyGate.score}점 · {formatVisionGateStatus(editableData.visionSummary.safetyGate.status)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 grid gap-2 text-xs text-gray-200 sm:grid-cols-2">
                                                        <div className="rounded border border-gray-700 bg-gray-950/50 px-3 py-2">
                                                            {formatVisionPolicy(editableData.visionSummary.safetyGate.candidateUsePolicy)}
                                                        </div>
                                                        <div className="rounded border border-gray-700 bg-gray-950/50 px-3 py-2">
                                                            자동 확정: {editableData.visionSummary.safetyGate.autoGraphCandidateUseAllowed ? 'Graph 근거 확인 후 가능' : '불가'}
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-xs text-amber-100">
                                                        재촬영/검토 사유: {buildVisionReviewReasonText(editableData.visionSummary)}
                                                    </p>
                                                </div>
                                            )}
                                            {editableData.visionSummary.fusionSummary && (
                                                <div className="mt-3 rounded-lg border border-sky-700/60 bg-sky-950/40 p-3">
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                                        <span className="font-semibold uppercase tracking-wider text-sky-200">
                                                            Multi-view Fusion
                                                        </span>
                                                        <span className="rounded-full border border-sky-700 px-2 py-0.5 text-sky-200">
                                                            {editableData.visionSummary.fusionSummary.validViewCount}/
                                                            {editableData.visionSummary.fusionSummary.requestedViewCount} 유효
                                                        </span>
                                                        <span className={`rounded-full border px-2 py-0.5 ${
                                                            editableData.visionSummary.fusionSummary.disagreementScore >= 0.35
                                                                ? 'border-amber-600 text-amber-200'
                                                                : 'border-emerald-700 text-emerald-200'
                                                        }`}>
                                                            불일치 {Math.round(editableData.visionSummary.fusionSummary.disagreementScore * 100)}%
                                                        </span>
                                                    </div>
                                                    <p className="mt-2 text-xs text-gray-300">
                                                        확보 시점: {editableData.visionSummary.fusionSummary.availableViewTags.join(', ')}
                                                    </p>
                                                    {editableData.visionSummary.fusionSummary.candidateSupport.map(item => (
                                                        <p key={item.defectType} className="mt-1 text-xs text-sky-200">
                                                            {item.defectType}: {item.supportingViewCount}개 시점 합의
                                                            {item.contradictingViewIds.length > 0
                                                                ? ` · 반대 ${item.contradictingViewIds.length}개`
                                                                : ''}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {editableData.visionSummary.viewEvidence
                                                && editableData.visionSummary.viewEvidence.length > 1 && (
                                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                    {editableData.visionSummary.viewEvidence.map(view => (
                                                        <div
                                                            key={view.viewId}
                                                            className="rounded-lg border border-gray-700 bg-gray-950/70 px-3 py-2 text-xs"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-mono text-cyan-300">
                                                                    {view.captureViewTag}
                                                                </span>
                                                                <span className="text-gray-500">
                                                                    관찰 {view.observationCount}
                                                                </span>
                                                            </div>
                                                            <p className="mt-1 text-gray-300">
                                                                {view.topCandidate || '판정 보류'}
                                                                {view.topCandidate
                                                                    ? ` · ${Math.round(view.confidence * 100)}%`
                                                                    : ''}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {editableData.visionSummary.visualObservations.length > 0 && (
                                                <div className="mt-3 grid gap-2">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                                                        AI가 본 근거 영역
                                                    </p>
                                                    {editableData.visionSummary.visualObservations.map(observation => (
                                                        <div
                                                            key={observation.observationId}
                                                            className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2"
                                                        >
                                                            <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                                                <span className="font-mono text-cyan-300">{observation.observationId}</span>
                                                                <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-cyan-200">{observation.category}</span>
                                                                {observation.region && <span className="text-gray-500">영역: {observation.region}</span>}
                                                                <span className="ml-auto text-gray-500">{Math.round(observation.confidence * 100)}%</span>
                                                            </div>
                                                            <p className="mt-1 text-xs text-gray-200">{observation.description}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {editableData.visionSummary.visibleFeatures.length > 0 && (
                                                <p className="mt-3 text-xs leading-relaxed text-gray-300">
                                                    관찰 특징: {editableData.visionSummary.visibleFeatures.join(', ')}
                                                </p>
                                            )}
                                            <div className="mt-3 space-y-2">
                                                {editableData.visionSummary.candidates.map((candidate, index) => (
                                                    <div key={`${candidate.defectType}-${index}`} className="rounded-lg border border-gray-700 bg-gray-900/70 p-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="text-sm font-semibold text-white">
                                                                {index + 1}. {candidate.defectType}
                                                            </span>
                                                            <span className="text-xs font-bold text-cyan-200">
                                                                {Math.round(candidate.confidence * 100)}%
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-700">
                                                            <div
                                                                className="h-full rounded-full bg-cyan-500"
                                                                style={{ width: `${Math.round(candidate.confidence * 100)}%` }}
                                                            />
                                                        </div>
                                                        {candidate.supportingFeatures.length > 0 && (
                                                            <p className="mt-2 text-xs text-emerald-200">
                                                                일치: {candidate.supportingFeatures.join(', ')}
                                                            </p>
                                                        )}
                                                        {candidate.supportingObservationIds.length > 0 && (
                                                            <p className="mt-1 font-mono text-[10px] text-cyan-400">
                                                                관찰 근거: {candidate.supportingObservationIds.join(', ')}
                                                            </p>
                                                        )}
                                                        {candidate.contradictingFeatures.length > 0 && (
                                                            <p className="mt-1 text-xs text-amber-200">
                                                                불일치/미확인: {candidate.contradictingFeatures.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {editableData.visionSummary.requiredAdditionalViews.length > 0 && (
                                                <p className="mt-3 text-xs text-amber-200">
                                                    추가 확인 촬영: {editableData.visionSummary.requiredAdditionalViews.join(', ')}
                                                </p>
                                            )}
                                            {editableData.visionSummary.abstentionReason && (
                                                <p className="mt-3 text-xs text-red-200">
                                                    판정 보류 사유: {editableData.visionSummary.abstentionReason}
                                                </p>
                                            )}
                                            {editableData.visionSummary.validationIssues.length > 0 && (
                                                <p className="mt-3 text-xs text-red-200">
                                                    관찰 계약 오류: {editableData.visionSummary.validationIssues.join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {editableData.retrievalSummary?.graphValidation && (
                                        <div className={`rounded-lg border p-4 ${
                                            editableData.retrievalSummary.graphValidation.visionGraphConflict
                                                ? 'border-red-700/70 bg-red-950/25'
                                                : editableData.retrievalSummary.graphValidation.graphGrounded
                                                    ? 'border-emerald-700/60 bg-emerald-950/20'
                                                    : 'border-amber-700/60 bg-amber-950/20'
                                        }`}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
                                                    Graph Cross-validation
                                                </h4>
                                                <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${
                                                    editableData.retrievalSummary.graphValidation.autoFinalizeAllowed
                                                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                                                        : editableData.retrievalSummary.graphValidation.visionGraphConflict
                                                            ? 'border-red-500/50 bg-red-500/10 text-red-200'
                                                            : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                                                }`}>
                                                    {editableData.retrievalSummary.graphValidation.autoFinalizeAllowed
                                                        ? 'AUTO FINALIZE'
                                                        : editableData.retrievalSummary.graphValidation.visionGraphConflict
                                                            ? 'VISION-GRAPH CONFLICT'
                                                            : 'HITL REQUIRED'}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                                                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                                                    승인 경로 {editableData.retrievalSummary.graphValidation.approvedPathCount}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                                                    인용 {editableData.retrievalSummary.graphValidation.citationCount}
                                                </span>
                                                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">
                                                    {editableData.retrievalSummary.graphValidation.contractVersion}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs text-gray-300">
                                                판정: {editableData.retrievalSummary.graphValidation.decisionReason}
                                            </p>
                                            <div className="mt-3 grid gap-2">
                                                {editableData.retrievalSummary.graphValidation.candidateGrounding.map(candidate => {
                                                    const primaryCitation = candidate.citations[0];
                                                    return (
                                                        <div
                                                            key={`${candidate.visionRank}-${candidate.defectType}`}
                                                            className="rounded-lg border border-gray-700 bg-gray-950/70 p-3"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <span className="text-sm font-semibold text-white">
                                                                    {candidate.visionRank}. {candidate.defectType}
                                                                </span>
                                                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                                                    candidate.status === 'supported'
                                                                        ? 'border-emerald-700 text-emerald-200'
                                                                        : candidate.status === 'weak'
                                                                            ? 'border-amber-700 text-amber-200'
                                                                            : 'border-gray-700 text-gray-400'
                                                                }`}>
                                                                    {candidate.status.toUpperCase()} · Graph {Math.round(candidate.supportScore * 100)}%
                                                                </span>
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-300">
                                                                <span>직접 {Math.round(candidate.directMatchScore * 100)}%</span>
                                                                <span>
                                                                    {primaryCitation ? `${primaryCitation.hopCount}-hop` : 'hop 없음'}{' '}
                                                                    {Math.round(candidate.multihopScore * 100)}%
                                                                </span>
                                                                <span>문맥 {Math.round(candidate.contextMatchScore * 100)}%</span>
                                                            </div>
                                                            {candidate.causes.length > 0 && (
                                                                <p className="mt-2 text-xs text-orange-200">
                                                                    승인 원인: {candidate.causes.join(', ')}
                                                                </p>
                                                            )}
                                                            {candidate.countermeasures.length > 0 && (
                                                                <p className="mt-1 text-xs text-emerald-200">
                                                                    승인 대책: {candidate.countermeasures.join(', ')}
                                                                </p>
                                                            )}
                                                            {candidate.citations.length > 0 && (
                                                                <div className="mt-2 space-y-1">
                                                                    {candidate.citations.map(citation => (
                                                                        <div
                                                                            key={citation.pathId}
                                                                            className="rounded border border-gray-800 bg-gray-900/80 px-2 py-1 text-[10px] text-gray-400"
                                                                        >
                                                                            <span className="font-mono text-sky-300">{citation.pathId}</span>
                                                                            <span className="ml-2">
                                                                                {citation.documentId} · {citation.hopCount}-hop · {Math.round(citation.score * 100)}%
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {editableData.retrievalSummary.llmSupplemented && (
                                                <p className="mt-3 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
                                                    LLM 보조 내용은 Graph 미검증 참고이며 승인 전 학습·시방서 확정에 사용할 수 없습니다.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {editableData.retrievalSummary && editableData.retrievalSummary.citations.length > 0 && (
                                        <div className="bg-sky-950/20 p-4 rounded-lg border border-sky-900/50">
                                            <h4 className="text-sm font-semibold text-sky-300 mb-2 uppercase tracking-wider">Retrieval Trace</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {editableData.retrievalSummary.citations.map((citation, index) => (
                                                    <span key={`${citation}-${index}`} className="rounded-full bg-gray-900/70 px-3 py-1 text-xs text-gray-300 border border-gray-700">
                                                        {citation}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {editableData.retrievalSummary?.graphTrace && editableData.retrievalSummary.graphTrace.length > 0 && (
                                        <div className="bg-sky-950/20 p-4 rounded-lg border border-sky-900/50">
                                            <h4 className="text-sm font-semibold text-sky-300 mb-2 uppercase tracking-wider">Graph Trace</h4>
                                            <div className="space-y-2">
                                                {editableData.retrievalSummary.graphTrace.map((trace, index) => (
                                                    <div key={`${trace}-${index}`} className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs text-gray-300">
                                                        {trace}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                                        <h4 className="text-sm font-semibold text-indigo-300 mb-2 uppercase tracking-wider">현상 (Phenomenon)</h4>
                                        {isEditing ? (
                                            <textarea
                                                className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm h-20"
                                                value={editableData.description}
                                                onChange={(e) => setEditableData({...editableData, description: e.target.value})}
                                            />
                                        ) : (
                                            <p className="text-gray-200 text-sm leading-relaxed">{editableData.description}</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
                                            <h4 className="text-sm font-semibold text-orange-300 mb-2 uppercase tracking-wider">추정 원인 (Root Cause)</h4>
                                            {isEditing ? (
                                                <textarea
                                                    className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm h-32"
                                                    value={editableData.possibleCauses}
                                                    onChange={(e) => setEditableData({...editableData, possibleCauses: e.target.value})}
                                                />
                                            ) : (
                                                <p className="text-gray-300 text-sm whitespace-pre-line">{editableData.possibleCauses}</p>
                                            )}
                                        </div>

                                        <div className="bg-gray-700/30 p-4 rounded-lg border border-green-900/50">
                                            <h4 className="text-sm font-semibold text-green-400 mb-2 uppercase tracking-wider">개선 대책 (Countermeasure)</h4>
                                            {isEditing ? (
                                                <textarea
                                                    className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm h-32"
                                                    value={editableData.countermeasures}
                                                    onChange={(e) => setEditableData({...editableData, countermeasures: e.target.value})}
                                                />
                                            ) : (
                                                <div className="text-gray-200 text-sm whitespace-pre-line">
                                                    {editableData.countermeasures}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Footer */}
                {editableData && !isLoading && (
                    <footer className="p-4 border-t border-gray-700 bg-gray-900 flex flex-wrap justify-between items-center gap-3">
                        <div className="flex items-center gap-4">
                            <span className={`text-sm font-bold text-green-400 transition-opacity flex items-center gap-2 ${trainStatus || copySuccess ? 'opacity-100' : 'opacity-0'}`}>
                                {trainStatus || copySuccess}
                            </span>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                            {isAdmin && (
                                <button onClick={() => handleTrain('approved')} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                    <SaveIcon className="w-4 h-4"/> 승인·Graph 승격
                                </button>
                            )}
                            <button onClick={() => handleTrain('corrected')} className="flex items-center gap-2 bg-sky-700 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                <SaveIcon className="w-4 h-4"/> 교정 저장
                            </button>
                            <button onClick={() => handleTrain('recapture')} className="flex items-center gap-2 bg-amber-700 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                재촬영 요청
                            </button>
                            <button onClick={() => handleTrain('rejected')} className="flex items-center gap-2 bg-red-800 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                반려
                            </button>
                            {!isAdmin && (
                                <button onClick={() => handleTrain('pending')} className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                    <div className="rotate-180"><SaveIcon className="w-4 h-4"/></div> 검토 요청
                                </button>
                            )}

                            <button onClick={handleCopyReport} className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-md transition-colors shadow-lg">
                                <ClipboardIcon className="w-4 h-4"/> 보고서 복사
                            </button>
                        </div>
                    </footer>
                )}
            </div>
        </div>
    );
};

export default AnalysisModal;
