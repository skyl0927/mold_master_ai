import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, PptIcon, SpinnerIcon, EditIcon, CheckIcon, TrashIcon, ImageIcon, PlusIcon } from './Icons';
import { CapturedImage } from '../types';
import {
    CommonAgentAssistResponse,
    CommonAgentDocumentService
} from '../services/commonAgentDocumentService';
import { ReportPreview } from './ReportPreview';
import { createInitialReportBasicInfo } from '../reportBasicInfo';
import { compactSpecificationAnalysis } from '../services/reportContentFormatter';

interface ReportWizardProps {
    isOpen: boolean;
    onClose: () => void;
    images: CapturedImage[];
    onGenerate: (layoutId: string, basicInfo: any, reportItems: ReportItem[], isVerified: boolean) => void;
}

interface Layout {
    id: string;
    name: string;
    description: string;
    type: string;
    perSlideItems: number;
    fields?: { key: string; label: string; type: string; default?: string }[];
    sectionTypes?: { value: string; label: string }[];
}

export interface ReportItem {
    id: string;
    images: CapturedImage[];
    analysis: {
        problem: string;
        cause: string;
        countermeasures: string;
    };
    assist?: {
        draftId: string;
        graphGrounded: boolean;
        llmSupplemented: boolean;
        evidenceCount: number;
        evidenceRefs: string[];
        workflowTrace: string[];
        warnings: string[];
    };
    sectionType?: string; // feasibility_report용
    customTitle?: string; // sectionType이 'custom'일 때 사용
}

/**
 * AI 분석 텍스트를 문제점/원인/대책으로 자동 분리하는 파서
 * RAG 응답이 description 하나에 모든 내용을 포함할 경우 사용
 */
function parseAnalysisText(fullText: string): { problem: string; cause: string; countermeasures: string } {
    if (!fullText || fullText.trim() === '') return { problem: '', cause: '', countermeasures: '' };

    // 패턴 매칭: ### 원인, ### 대책, 등의 마크다운 섹션으로 분리
    const causePatterns = [/###\s*원인[:\s]*/i, /원인[:\s]*\n/i, /\*\*원인\*\*/i, /Possible\s*Causes?[:\s]*/i];
    const counterPatterns = [/###\s*대책[:\s]*/i, /대책[:\s]*\n/i, /\*\*대책\*\*/i, /Countermeasures?[:\s]*/i, /Solutions?[:\s]*/i, /###\s*(?:대책|조치|해결)/i];

    let problemText = fullText;
    let causeText = '';
    let counterText = '';

    // 원인 섹션 찾기
    let causeIdx = -1;
    for (const pat of causePatterns) {
        const match = fullText.search(pat);
        if (match !== -1 && (causeIdx === -1 || match < causeIdx)) {
            causeIdx = match;
        }
    }

    // 대책 섹션 찾기
    let counterIdx = -1;
    for (const pat of counterPatterns) {
        const match = fullText.search(pat);
        if (match !== -1 && (counterIdx === -1 || match < counterIdx)) {
            counterIdx = match;
        }
    }

    // 분리 로직
    if (causeIdx !== -1 && counterIdx !== -1 && causeIdx < counterIdx) {
        // 문제점 | 원인 | 대책 순서
        problemText = fullText.substring(0, causeIdx).trim();
        causeText = fullText.substring(causeIdx, counterIdx).replace(causePatterns.find(p => p.test(fullText.substring(causeIdx))) || '', '').trim();
        counterText = fullText.substring(counterIdx).trim();
        // 대책 헤더 제거
        for (const pat of counterPatterns) {
            counterText = counterText.replace(pat, '').trim();
        }
    } else if (counterIdx !== -1) {
        // 문제점 | 대책 (원인 없음)
        problemText = fullText.substring(0, counterIdx).trim();
        counterText = fullText.substring(counterIdx).trim();
        for (const pat of counterPatterns) {
            counterText = counterText.replace(pat, '').trim();
        }
    } else if (causeIdx !== -1) {
        // 문제점 | 원인 (대책 없음)
        problemText = fullText.substring(0, causeIdx).trim();
        causeText = fullText.substring(causeIdx).trim();
        for (const pat of causePatterns) {
            causeText = causeText.replace(pat, '').trim();
        }
    }
    // 원인 섹션 헤더도 정리
    for (const pat of causePatterns) {
        causeText = causeText.replace(pat, '').trim();
    }

    return {
        problem: problemText,
        cause: causeText,
        countermeasures: counterText
    };
}

const ReportWizard: React.FC<ReportWizardProps> = ({ isOpen, onClose, images, onGenerate }) => {
    const [step, setStep] = useState(1);
    const [layouts, setLayouts] = useState<Layout[]>([]);
    const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);
    const [basicInfo, setBasicInfo] = useState<any>({});
    const [reportItems, setReportItems] = useState<ReportItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [assistLoading, setAssistLoading] = useState(false);
    const [assistError, setAssistError] = useState<string | null>(null);
    const [pendingAssist, setPendingAssist] = useState<{
        itemId: string;
        response: CommonAgentAssistResponse;
    } | null>(null);

    // 초기화 상태 추적 (리셋 방지)
    const initializedRef = useRef(false);

    const processFile = (file: File): Promise<CapturedImage> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    dataUrl: e.target?.result as string,
                    analysis: null
                } as CapturedImage);
            };
            reader.readAsDataURL(file);
        });
    };

    useEffect(() => {
        if (!isOpen) return;

        const handlePaste = async (e: ClipboardEvent) => {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) return;

            if (e.clipboardData && e.clipboardData.files.length > 0) {
                const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
                if (files.length === 0) return;

                e.preventDefault();
                const newImages = await Promise.all(files.map(file => processFile(file)));

                if (selectedItemId) {
                    setReportItems(prev => prev.map(item =>
                        item.id === selectedItemId ? { ...item, images: [...item.images, ...newImages] } : item
                    ));
                } else if (reportItems.length > 0) {
                    setReportItems(prev => {
                        const newItems = [...prev];
                        newItems[0] = { ...newItems[0], images: [...newItems[0].images, ...newImages] };
                        return newItems;
                    });
                    setSelectedItemId(reportItems[0].id);
                } else {
                    const newItem: ReportItem = {
                        id: `item-${Date.now()}`,
                        images: newImages,
                        analysis: { problem: '', cause: '', countermeasures: '' }
                    };
                    setReportItems([newItem]);
                    setSelectedItemId(newItem.id);
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isOpen, selectedItemId, reportItems]);

    // Drag State
    const [draggingImage, setDraggingImage] = useState<{ itemId: string, imgIndex: number, img: CapturedImage } | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (!initializedRef.current) {
                setStep(1);
                loadLayouts();
                // 초기 아이템 생성: 이미지 1개당 아이템 1개
                const initialItems = images.map((img, idx) => {
                    // AI 분석 결과에서 문제점/원인/대책을 자동 파싱
                    let problem = img.analysis?.description || '';
                    let cause = img.analysis?.possibleCauses || '';
                    let countermeasures = img.analysis?.countermeasures || '';

                    // cause/countermeasures가 비어있으면 description에서 자동 분리 시도
                    if (!cause && !countermeasures && problem) {
                        const parsed = parseAnalysisText(problem);
                        problem = parsed.problem;
                        cause = parsed.cause;
                        countermeasures = parsed.countermeasures;
                    }

                    const conciseAnalysis = compactSpecificationAnalysis({
                        problem,
                        cause,
                        countermeasures
                    });
                    return {
                        id: `item-${Date.now()}-${idx}`,
                        images: [img],
                        analysis: conciseAnalysis
                    };
                });
                setReportItems(initialItems);
                if (initialItems.length > 0) setSelectedItemId(initialItems[0].id);
                initializedRef.current = true;
            }
        } else {
            initializedRef.current = false; // 모달 닫히면 초기화 플래그 리셋
        }
    }, [isOpen, images]); // images가 바뀌더라도 모달이 열려있는 동안은 초기화 안 함 (initializedRef 덕분)

    const loadLayouts = async () => {
        setLoading(true);
        try {
            const data = await window.electronAPI.getReportLayouts();
            setLayouts(data);
            if (data.length > 0) setSelectedLayoutId(data[0].id);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLayoutSelect = (id: string) => {
        setSelectedLayoutId(id);
        const layout = layouts.find(l => l.id === id);
        if (layout?.fields) {
            setBasicInfo(createInitialReportBasicInfo(layout.fields));
        }
    };
    const handleNext = () => {
        if (step === 1 && selectedLayoutId) {
            const layout = layouts.find(l => l.id === selectedLayoutId);
            if (!layout) return;
            if (layout.fields && layout.fields.length > 0) {
                setStep(2);
            } else {
                setStep(3);
            }
        } else if (step === 2) {
            setStep(3);
        } else if (step === 3) {
            setStep(4);
        } else if (step === 4) {
            if (selectedLayoutId) {
                onGenerate(selectedLayoutId, basicInfo, reportItems, isVerified);
            }
        }
    };

    // --- Drag & Drop Handlers ---
    const handleDragStart = (e: React.DragEvent, itemId: string, imgIndex: number, img: CapturedImage) => {
        setDraggingImage({ itemId, imgIndex, img });
        e.dataTransfer.setData('text/plain', JSON.stringify({ itemId, imgIndex }));
        e.dataTransfer.effectAllowed = 'copyMove'; // 복사/이동 모두 허용
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        // 파일 드롭인 경우 copy
        if (e.dataTransfer.types.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy';
        } else {
            // Ctrl 키 누르면 copy, 아니면 move
            e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
        }
    };

    const handleDrop = async (e: React.DragEvent, targetItemId: string) => {
        e.preventDefault();

        // 1. 외부 파일 드롭 처리
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length === 0) return;

            const newImages = await Promise.all(files.map(file => processFile(file)));

            setReportItems(prev => prev.map(item => {
                if (item.id === targetItemId) {
                    return { ...item, images: [...item.images, ...newImages] };
                }
                return item;
            }));
            return;
        }

        // 2. 내부 이미지 이동/복사 처리
        if (!draggingImage) return;

        // Ctrl 키 확인 (e.ctrlKey)
        const isCopy = e.ctrlKey;

        // 같은 아이템 내 이동/복사 방지 (순서 변경 미구현)
        if (!isCopy && draggingImage.itemId === targetItemId) return;

        setReportItems(prev => {
            // 깊은 복사 (Deep Copy)
            const newItems = prev.map(item => ({
                ...item,
                images: [...item.images], // 이미지 배열 복사
                analysis: { ...item.analysis }
            }));

            const sourceItem = newItems.find(i => i.id === draggingImage.itemId);
            if (!sourceItem) return prev;

            // 이미지 객체 준비 (복사 시에도 같은 객체 참조 사용 가능, or Deep Clone 필요 시 수행)
            // 여기서는 data를 공유해도 무방함
            const imageToMove = draggingImage.img;

            // 이동(Move)인 경우 소스에서 제거
            if (!isCopy) {
                // 인덱스가 유효한지 확인하고 제거
                // 상태 기반이므로 인덱스가 맞아야 함.
                // 안전을 위해 id 비교보다는 인덱스로 제거 (DragStart 시점의 인덱스)
                // 하지만 그 사이 변경되었을 수 있으므로...
                // 여기서는 단일 사용자 동기 환경 가정.
                sourceItem.images.splice(draggingImage.imgIndex, 1);
            }

            // 타겟 아이템에 추가
            const targetItem = newItems.find(i => i.id === targetItemId);
            if (targetItem) {
                targetItem.images.push(imageToMove);
            }

            return newItems;
        });
        setDraggingImage(null);
    };

    const handleCreateNewItem = () => {
        const newItem: ReportItem = {
            id: `item-${Date.now()}`,
            images: [],
            analysis: { problem: '', cause: '', countermeasures: '' }
        };
        // 기존 아이템 유지하고 뒤에 추가
        setReportItems(prev => [...prev, newItem]);
        setSelectedItemId(newItem.id);
    };

    const handleDeleteItem = (e: React.MouseEvent, itemId: string) => {
        e.stopPropagation();
        if (window.confirm("이 항목을 정말 삭제하시겠습니까?")) {
            setReportItems(prev => prev.filter(i => i.id !== itemId));
            if (selectedItemId === itemId) setSelectedItemId(null);
        }
    };

    const handleDeleteImage = (e: React.MouseEvent, itemId: string, imgIndex: number) => {
        e.stopPropagation();
        setReportItems(prev => prev.map(item => {
            if (item.id === itemId) {
                const newImages = [...item.images];
                newImages.splice(imgIndex, 1);
                return { ...item, images: newImages };
            }
            return item;
        }));
    };

    // --- Editor Handlers ---
    const handleUpdateItem = (itemId: string, field: keyof ReportItem['analysis'], value: string) => {
        setReportItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, analysis: { ...item.analysis, [field]: value } } : item
        ));
    };

    const handleAssistSelectedItem = async () => {
        const item = reportItems.find(candidate => candidate.id === selectedItemId);
        if (!item) return;
        const problem = item.analysis.problem.trim();
        if (!problem) {
            setAssistError('문제 현상을 먼저 입력해 주세요.');
            return;
        }

        setAssistLoading(true);
        setAssistError(null);
        setPendingAssist(null);
        const caseId = String(basicInfo.caseId || `case-mold-master-${Date.now()}`);
        if (!basicInfo.caseId) setBasicInfo((previous: any) => ({ ...previous, caseId }));
        const sourceImageIds = item.images.map(image => image.commonAgentImageId || image.id);
        const sectionType = item.sectionType === 'spec' || item.sectionType === 'undercut'
            || item.sectionType === 'custom' ? item.sectionType : 'problem';

        try {
            const response = await CommonAgentDocumentService.assistDraft({
                caseRequest: {
                    case_id: caseId,
                    title: String(basicInfo.reportTitle || item.customTitle || problem.slice(0, 80)),
                    process_area: basicInfo.processArea,
                    product_group: basicInfo.productGroup,
                    source_system: 'mold-master-ai',
                    source_refs: sourceImageIds,
                    workspace: basicInfo.workspace
                },
                assistRequest: {
                    case_id: caseId,
                    draft_type: basicInfo.draftType === 'specification_revision'
                        ? 'specification_revision'
                        : 'review_report',
                    title: item.customTitle,
                    problem_description: problem,
                    source_image_ids: sourceImageIds,
                    existing_sections: [{
                        section_id: item.id,
                        section_type: sectionType,
                        title: item.customTitle,
                        problem: item.analysis.problem,
                        cause: item.analysis.cause,
                        countermeasures: item.analysis.countermeasures,
                        source_image_ids: sourceImageIds
                    }],
                    workspace: basicInfo.workspace,
                    metadata: { layout_id: selectedLayoutId, source_app: 'mold-master-ai' }
                }
            });
            setPendingAssist({ itemId: item.id, response });
        } catch (error) {
            setAssistError(error instanceof Error ? error.message : 'Common Agent 자동작성에 실패했습니다.');
        } finally {
            setAssistLoading(false);
        }
    };

    const applyPendingAssist = () => {
        if (!pendingAssist) return;
        const section = pendingAssist.response.draft.sections?.[0];
        if (!section) {
            setAssistError('자동작성 결과에 적용 가능한 섹션이 없습니다.');
            return;
        }
        const conciseAnalysis = compactSpecificationAnalysis({
            problem: section.problem || '',
            cause: section.cause || '',
            countermeasures: section.countermeasures || ''
        });
        setReportItems(previous => previous.map(item => item.id === pendingAssist.itemId ? {
            ...item,
            analysis: {
                problem: conciseAnalysis.problem || item.analysis.problem,
                cause: conciseAnalysis.cause || item.analysis.cause,
                countermeasures: conciseAnalysis.countermeasures || item.analysis.countermeasures
            },
            assist: {
                draftId: pendingAssist.response.draft.draft_id,
                graphGrounded: pendingAssist.response.graph_grounded,
                llmSupplemented: pendingAssist.response.llm_supplemented,
                evidenceCount: pendingAssist.response.evidence_count,
                evidenceRefs: section.evidence_refs || [],
                workflowTrace: pendingAssist.response.workflow_trace,
                warnings: pendingAssist.response.warnings
            }
        } : item));
        setPendingAssist(null);
    };

    if (!isOpen) return null;

    const currentLayout = layouts.find(l => l.id === selectedLayoutId);
    const selectedItem = reportItems.find(i => i.id === selectedItemId);

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className={`bg-gray-800 rounded-xl w-full max-w-6xl h-[90vh] shadow-xl border border-gray-700 flex flex-col transition-all duration-300`} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-850">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <PptIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">리포트 마법사</h2>
                            <p className="text-sm text-gray-400">Step {step}: {
                                step === 1 ? "양식 선택" : step === 2 ? "기본 정보 입력" : step === 3 ? "상세 편집 및 병합" : "최종 미리보기"
                            }</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg">
                        <CloseIcon className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-grow overflow-hidden flex flex-col">
                    {step === 1 && (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                            {layouts.map(layout => (
                                <div key={layout.id} onClick={() => handleLayoutSelect(layout.id)}
                                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${selectedLayoutId === layout.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 hover:border-gray-600 bg-gray-750'}`}>
                                    <h3 className="font-bold text-lg mb-2 text-white">{layout.name}</h3>
                                    <p className="text-sm text-gray-400">{layout.description}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {step === 2 && currentLayout?.fields && (
                        <div className="p-6 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
                                {currentLayout.fields.map(field => (
                                    <div key={field.key} className={`flex flex-col gap-2 ${field.type === 'textarea' ? 'col-span-2' : ''}`}>
                                        <label className="text-sm font-medium text-gray-300">{field.label}</label>
                                        {field.type === 'textarea' ? (
                                            <textarea
                                                value={basicInfo[field.key] || ''}
                                                onChange={e => setBasicInfo({ ...basicInfo, [field.key]: e.target.value })}
                                                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                                                rows={3}
                                                placeholder={field.label}
                                            />
                                        ) : (
                                            <input
                                                type={field.type}
                                                value={basicInfo[field.key] || ''}
                                                onChange={e => setBasicInfo({ ...basicInfo, [field.key]: e.target.value })}
                                                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="flex flex-grow overflow-hidden">
                            {/* Left: Item List (Sidebar) */}
                            <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col">
                                <div className="p-3 border-b border-gray-700 bg-gray-850 flex justify-between items-center">
                                    <span className="text-sm font-bold text-gray-300">결함 항목 ({reportItems.length})</span>
                                    <button onClick={handleCreateNewItem} className="p-1 hover:bg-gray-700 rounded text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                        <PlusIcon className="w-4 h-4" /> 항목 추가
                                    </button>
                                </div>
                                <div className="flex-grow overflow-y-auto p-2 space-y-2">
                                    {reportItems.map((item, idx) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedItemId(item.id)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDrop(e, item.id)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all relative group ${selectedItemId === item.id
                                                ? 'border-indigo-500 bg-indigo-900/30'
                                                : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-bold text-gray-400">항목 #{idx + 1}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-gray-700 px-1.5 rounded text-gray-300">{item.images.length} imgs</span>
                                                    <button
                                                        onClick={(e) => handleDeleteItem(e, item.id)}
                                                        className="text-gray-500 hover:text-red-400 hidden group-hover:block"
                                                        title="항목 삭제"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            {/* Image Thumbnails in List */}
                                            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                                                {item.images.map((img, imgIdx) => (
                                                    <div
                                                        key={`${item.id}-img-${imgIdx}`}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, item.id, imgIdx, img)}
                                                        className="w-12 h-12 flex-shrink-0 bg-gray-950 rounded border border-gray-600 overflow-hidden relative group/img"
                                                    >
                                                        <img src={img.dataUrl} className="w-full h-full object-cover" alt="thumb" />
                                                        <button
                                                            onClick={(e) => handleDeleteImage(e, item.id, imgIdx)}
                                                            className="absolute top-0 right-0 p-0.5 bg-red-600/80 text-white hidden group-hover/img:block"
                                                            title="이미지 삭제"
                                                        >
                                                            <CloseIcon className="w-3 h-3" />
                                                        </button>
                                                        <div className="absolute inset-0 bg-black/50 hidden group-hover/img:flex items-center justify-center cursor-move pointer-events-none">
                                                            {/* Drag Handle Overlay */}
                                                        </div>
                                                    </div>
                                                ))}
                                                {item.images.length === 0 && (
                                                    <div className="w-12 h-12 flex-shrink-0 bg-gray-800 rounded border border-gray-700 border-dashed flex items-center justify-center text-gray-600 text-xs">
                                                        Empty
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="p-4 border-2 border-dashed border-gray-700 rounded-lg text-center text-gray-500 text-sm hover:border-gray-500 hover:text-gray-400 transition-colors">
                                        항목 간 이미지를 드래그하여 이동할 수 있습니다.
                                    </div>
                                </div>
                            </div>

                            {/* Right: Detailed Edit Form */}
                            <div className="flex-grow bg-gray-800 p-6 overflow-y-auto">
                                {selectedItem ? (
                                    <div className="max-w-4xl mx-auto space-y-6">
                                        <div className="bg-gray-750 p-4 rounded-xl border border-gray-700">
                                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                                <ImageIcon className="w-5 h-5 text-indigo-400" />
                                                첨부 이미지 ({selectedItem.images.length})
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {selectedItem.images.map((img, idx) => (
                                                    <div key={idx} className="aspect-video bg-black rounded-lg border border-gray-600 overflow-hidden relative group">
                                                        <img src={img.dataUrl} className="w-full h-full object-contain" alt="detail" />
                                                        <span className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 rounded">{idx + 1}</span>
                                                        <button
                                                            onClick={(e) => handleDeleteImage(e, selectedItem.id, idx)}
                                                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {selectedItem.images.length === 0 && (
                                                    <div className="col-span-full py-8 text-center text-gray-500">
                                                        이미지가 없습니다. 좌측에서 이미지를 드래그하여 추가하세요.
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-gray-750 p-4 rounded-xl border border-gray-700 space-y-4">
                                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                                <EditIcon className="w-5 h-5 text-indigo-400" />
                                                분석 내용 수정
                                            </h3>

                                            <div className="rounded-lg border border-cyan-800/70 bg-cyan-950/30 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-semibold text-cyan-100">Common Agent 그래프 자동작성</p>
                                                        <p className="mt-0.5 text-xs text-cyan-300/70">승인된 Graph DB 근거를 우선 사용하고 부족한 내용만 LLM이 보조합니다.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAssistSelectedItem}
                                                        disabled={assistLoading || !selectedItem.analysis.problem.trim()}
                                                        className="flex items-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                                                    >
                                                        {assistLoading && <SpinnerIcon className="h-4 w-4 animate-spin" />}
                                                        {assistLoading ? '그래프 분석 중' : '현재 섹션 자동작성'}
                                                    </button>
                                                </div>

                                                {assistError && (
                                                    <p className="mt-3 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">{assistError}</p>
                                                )}

                                                {pendingAssist?.itemId === selectedItem.id && (() => {
                                                    const assistedSection = pendingAssist.response.draft.sections?.[0];
                                                    return (
                                                        <div className="mt-3 space-y-3 rounded-md border border-gray-600 bg-gray-900/70 p-3">
                                                            <div className="flex flex-wrap gap-2 text-xs">
                                                                <span className={`rounded-full px-2 py-1 font-semibold ${pendingAssist.response.graph_grounded ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'}`}>
                                                                    {pendingAssist.response.graph_grounded ? 'GRAPH GROUNDED' : 'GRAPH 근거 부족'}
                                                                </span>
                                                                <span className="rounded-full bg-gray-700 px-2 py-1 text-gray-200">Evidence {pendingAssist.response.evidence_count}</span>
                                                                {pendingAssist.response.llm_supplemented && <span className="rounded-full bg-blue-900 px-2 py-1 text-blue-200">LLM 보조</span>}
                                                            </div>
                                                            <div className="grid gap-3 text-xs md:grid-cols-2">
                                                                <div>
                                                                    <p className="mb-1 font-semibold text-orange-300">제안 원인</p>
                                                                    <p className="whitespace-pre-wrap text-gray-300">{assistedSection?.cause || '원인 제안 없음'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="mb-1 font-semibold text-emerald-300">제안 대책</p>
                                                                    <p className="whitespace-pre-wrap text-gray-300">{assistedSection?.countermeasures || '대책 제안 없음'}</p>
                                                                </div>
                                                            </div>
                                                            {pendingAssist.response.warnings.length > 0 && (
                                                                <p className="text-xs text-amber-300">{pendingAssist.response.warnings.join(' ')}</p>
                                                            )}
                                                            <div className="flex justify-end gap-2">
                                                                <button type="button" onClick={() => setPendingAssist(null)} className="rounded px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">취소</button>
                                                                <button type="button" onClick={applyPendingAssist} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">제안 적용</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {selectedItem.assist && !pendingAssist && (
                                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                                                        <span className={selectedItem.assist.graphGrounded ? 'text-emerald-300' : 'text-amber-300'}>
                                                            {selectedItem.assist.graphGrounded ? 'Graph 적용됨' : 'LLM 보조 적용됨'}
                                                        </span>
                                                        <span>근거 {selectedItem.assist.evidenceCount}건</span>
                                                        <span>경로 {selectedItem.assist.workflowTrace.join(' → ')}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Feasibility Report: 섹션 타입 선택 */}
                                            {selectedLayoutId === 'feasibility_report' && currentLayout?.sectionTypes && (
                                                <div className="pb-2 border-b border-gray-700">
                                                    <label className="text-sm font-medium text-gray-300 mb-2 block">섹션 타입</label>
                                                    <select
                                                        value={selectedItem.sectionType || 'spec'}
                                                        onChange={e => {
                                                            const updatedItems = reportItems.map(item =>
                                                                item.id === selectedItem.id
                                                                    ? { ...item, sectionType: e.target.value }
                                                                    : item
                                                            );
                                                            setReportItems(updatedItems);
                                                        }}
                                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                    >
                                                        {currentLayout.sectionTypes.map(st => (
                                                            <option key={st.value} value={st.value}>{st.label}</option>
                                                        ))}
                                                    </select>
                                                    {selectedItem.sectionType === 'custom' && (
                                                        <input
                                                            type="text"
                                                            placeholder="커스텀 섹션 제목 입력"
                                                            value={selectedItem.customTitle || ''}
                                                            onChange={e => {
                                                                const updatedItems = reportItems.map(item =>
                                                                    item.id === selectedItem.id
                                                                        ? { ...item, customTitle: e.target.value }
                                                                        : item
                                                                );
                                                                setReportItems(updatedItems);
                                                            }}
                                                            className="w-full mt-2 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                        />
                                                    )}
                                                </div>
                                            )}

                                            <div>
                                                <label className="text-sm font-medium text-gray-300 mb-1 block">문제점 (Problem)</label>
                                                <textarea
                                                    className="w-full h-28 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y cursor-text"
                                                    value={selectedItem.analysis.problem}
                                                    onChange={e => handleUpdateItem(selectedItem.id, 'problem', e.target.value)}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => e.stopPropagation()}
                                                    placeholder="문제점을 상세히 기술하세요."
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-gray-300 mb-1 block">원인 (Cause)</label>
                                                <textarea
                                                    className="w-full h-28 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y cursor-text"
                                                    value={selectedItem.analysis.cause}
                                                    onChange={e => handleUpdateItem(selectedItem.id, 'cause', e.target.value)}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => e.stopPropagation()}
                                                    placeholder="원인을 상세히 기술하세요."
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-gray-300 mb-1 block">대책 수립 (Countermeasures)</label>
                                                <textarea
                                                    className="w-full h-28 bg-gray-700 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y cursor-text"
                                                    value={selectedItem.analysis.countermeasures}
                                                    onChange={e => handleUpdateItem(selectedItem.id, 'countermeasures', e.target.value)}
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onClick={e => e.stopPropagation()}
                                                    placeholder="대책 및 조치사항을 상세히 기술하세요."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-500">
                                        좌측 목록에서 항목을 선택하여 편집하세요.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {step === 4 && selectedLayoutId && currentLayout && (
                        <ReportPreview
                            layoutId={selectedLayoutId}
                            layoutName={currentLayout.name}
                            basicInfo={basicInfo}
                            items={reportItems}
                            verified={isVerified}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-700 bg-gray-800 flex flex-col gap-4">
                    {step === 3 && (
                        <div className="flex items-center p-3 bg-gray-750 rounded-lg border border-gray-600">
                            <input
                                type="checkbox"
                                id="wizard-quality-verify"
                                className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 bg-gray-700 border-gray-500"
                                checked={isVerified}
                                onChange={(e) => setIsVerified(e.target.checked)}
                            />
                            <label htmlFor="wizard-quality-verify" className="ml-3 text-sm text-gray-300 select-none cursor-pointer">
                                <span className="font-bold text-white">AI 학습 데이터 품질 승인 (Data Verification)</span>
                                <span className="block text-xs text-gray-500 mt-0.5">
                                    이 리포트의 내용을 검증된 학습 데이터로 사용하는 것에 동의합니다.
                                </span>
                            </label>
                        </div>
                    )}

                    <div className="flex justify-between items-center w-full">
                        <button
                            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                            className="px-4 py-2 text-gray-400 hover:text-white"
                        >
                            {step === 1 ? '취소' : '이전'}
                        </button>
                        <div className="flex gap-2">
                            <button
                                onClick={handleNext}
                                disabled={!selectedLayoutId || ((step === 3 || step === 4) && reportItems.length === 0)}
                                className={`px-6 py-2 rounded-lg font-bold text-white transition-colors flex items-center gap-2 ${selectedLayoutId ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-gray-700 cursor-not-allowed'
                                    }`}
                            >
                                {step === 4 ? (
                                    <>
                                        <PptIcon className="w-5 h-5" />
                                        저장 및 PPTX 생성
                                    </>
                                ) : (
                                    step === 3 ? "미리보기" : "다음 단계"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportWizard;
