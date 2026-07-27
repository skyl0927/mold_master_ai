

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    CapturedImage,
    TextAnnotation,
    Shape,
    ApiConfig,
    DefectAnalysis,
    DBStats,
    MobileConnectionData,
    RetrievalMode,
    VisionImageQualityReport,
    CaptureImageKind,
    CaptureSource,
    CaptureViewTag
} from './types';
import { formatVisionQualityMessage, inspectVisionImageQuality } from './visionImageQuality';
import AnnotationCanvas from './components/AnnotationCanvas';
import AnalysisModal from './components/AnalysisModal';
import Chatbot from './components/Chatbot';
import SettingsModal from './components/SettingsModal';
import CameraCapture, { CameraCaptureMetadata } from './components/CameraCapture';
import DatabaseView from './components/DatabaseView';
import DefectDashboard from './components/DefectDashboard';
import ReportWizard from './components/ReportWizard';
import { generatePptxReport, generateXlsxReport, ReportItem } from './services/reportService';
import { CommonAgentGateway } from './services/commonAgentGateway';
import {
    buildVisionHitlReviewMetadata,
    canPromoteVisionAnalysisToGraph,
    resolveVisionHitlDecision,
    VisionHitlDecision
} from './services/visionHitlDecisionProtocol';
import { buildMultimodalDiagnosisContext } from './services/diagnosisContextService';
import { CommonAgentApiService, CommonAgentAnnotationRequest, NormalizedBbox } from './services/commonAgentApiService';
import { CommonAgentDocumentService, buildDocumentDraftSyncPayload } from './services/commonAgentDocumentService';
import {
    listManualDocuments,
    MANUAL_DOCUMENTS_CHANGED_EVENT,
    syncManualDocument
} from './services/manualKnowledgeSyncService';
import { checkServerHealth, ServerHealthStatus } from './services/serverHealthService';
import { CameraIcon, PptIcon, ExcelIcon, TrashIcon, EditIcon, SparklesIcon, SpinnerIcon, DragHandleIcon, ChatIcon, SettingsIcon, WifiOffIcon, CopyIcon, UploadIcon, BotIcon, WifiIcon, QrCodeIcon, CloseIcon, LockIcon, UnlockIcon } from './components/Icons';
import QRCode from 'qrcode';
import {
    CAPTURE_VIEW_OPTIONS,
    assessCaptureImageForDiagnosis,
    buildCaptureMetadata,
    buildRecaptureCaptureGuidance,
    buildRecaptureSourceFromReview,
    collectSessionDiagnosisImages,
    createCaptureSessionId,
    selectDiagnosisTargetIds,
    summarizeCaptureSession
} from './captureSessionProtocol';
import { buildVisionBboxAnnotationPayloads, VisionBboxReviewSubmission } from './visionBboxAnnotation';
import { summarizeVisionBboxAnnotationStatus } from './visionBboxAnnotationStatus';

interface EditingState {
    id?: string;
    baseImageUrl: string;
    annotations: TextAnnotation[];
    shapes?: Shape[];
    captureSessionId?: string;
    captureViewTag?: CaptureViewTag;
    captureImageKind?: CaptureImageKind;
    captureSource?: CaptureSource;
    recaptureSource?: CapturedImage['recaptureSource'];
}

const dataURItoBlob = (dataURI: string): Blob => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
};

const splitReviewLines = (value: string): string[] =>
    value
        .split(/\r?\n|;/)
        .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(Boolean);

const sha256Hex = async (blob: Blob): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
};

const dataUrlToFile = (dataUrl: string, fileName: string): File => {
    const blob = dataURItoBlob(dataUrl);
    return new File([blob], fileName, { type: blob.type || 'image/png' });
};

const getDataUrlImageSize = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = () => reject(new Error('이미지 크기를 읽을 수 없습니다.'));
        img.src = dataUrl;
    });
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const shapeToNormalizedBbox = (shape: Shape, imageWidth: number, imageHeight: number): NormalizedBbox | null => {
    if (!['rect', 'ellipse', 'blur'].includes(shape.tool)) return null;
    if (!shape.points || shape.points.length < 2 || imageWidth <= 0 || imageHeight <= 0) return null;

    const xs = shape.points.map(point => point.x);
    const ys = shape.points.map(point => point.y);
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxX = Math.min(imageWidth, Math.max(...xs));
    const maxY = Math.min(imageHeight, Math.max(...ys));
    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 2 || height < 2) return null;

    return {
        x: clamp01(minX / imageWidth),
        y: clamp01(minY / imageHeight),
        width: clamp01(width / imageWidth),
        height: clamp01(height / imageHeight)
    };
};

const buildCommonAgentAnnotationPayloads = async (
    image: CapturedImage,
    existingAnnotations: Array<{ metadata?: Record<string, any> }> = []
): Promise<CommonAgentAnnotationRequest[]> => {
    const shapes = image.shapes || [];
    const { width, height } = shapes.length > 0
        ? await getDataUrlImageSize(image.dataUrl)
        : { width: 0, height: 0 };
    const defaultLabel = image.analysis?.defectType || 'field_roi';
    const existingShapeIds = new Set(
        existingAnnotations
            .map(annotation => annotation.metadata?.local_shape_id)
            .filter(Boolean)
    );

    const shapePayloads = shapes
        .map(shape => {
            if (existingShapeIds.has(shape.id)) return null;
            const bbox = shapeToNormalizedBbox(shape, width, height);
            if (!bbox) return null;

            const payload: CommonAgentAnnotationRequest = {
                label: shape.text || defaultLabel,
                annotation_type: 'bbox' as const,
                bbox: {
                    ...bbox,
                    coordinate_system: 'normalized_xywh' as const
                },
                review_status: 'candidate' as const,
                source_app: 'mold-master-ai',
                note: 'mold-master-ai ROI sync',
                metadata: {
                    local_image_id: image.id,
                    local_shape_id: shape.id,
                    local_shape_tool: shape.tool,
                    local_shape_color: shape.color,
                    capture_session_id: image.captureSessionId,
                    capture_view_tags: image.captureViewTag ? [image.captureViewTag] : [],
                    vision_image_kind: image.captureImageKind,
                    capture_source: image.captureSource
                }
            };
            return payload;
        })
        .filter((item): item is CommonAgentAnnotationRequest => item !== null);
    const visionPayloads = buildVisionBboxAnnotationPayloads({
        image,
        existingAnnotations
    }) as CommonAgentAnnotationRequest[];

    return [...shapePayloads, ...visionPayloads];
};

const isElectron = () => {
    return navigator.userAgent.toLowerCase().includes(' electron/');
};

const ServerStatusBadge: React.FC<{ label: string; status: 'online' | 'offline' }> = ({ label, status }) => (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
        status === 'online'
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
            : 'border-red-500/40 bg-red-500/10 text-red-200'
    }`}>
        <span className={`h-2 w-2 rounded-full ${status === 'online' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
        {label} {status === 'online' ? 'Online' : 'Offline'}
    </span>
);

const App: React.FC = () => {
    const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
    const [editingState, setEditingState] = useState<EditingState | null>(null);
    const [status, setStatus] = useState<'idle' | 'capturing' | 'generating'>('idle');
    const [error, setError] = useState<string | null>(null);

    const [modalImageId, setModalImageId] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<Set<string>>(new Set());
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    const modalImage = capturedImages.find(img => img.id === modalImageId);

    const draggedItemIndex = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isFileDragging, setIsFileDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isChatbotOpen, setIsChatbotOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [activeCaptureSessionId, setActiveCaptureSessionId] = useState(
        () => createCaptureSessionId('workspace')
    );
    const activeCaptureSessionIdRef = useRef(activeCaptureSessionId);
    const [screenCaptureViewTag, setScreenCaptureViewTag] = useState<CaptureViewTag>('full_part_context');
    const screenCaptureViewTagRef = useRef<CaptureViewTag>('full_part_context');
    const [pendingRecaptureSource, setPendingRecaptureSource] = useState<NonNullable<CapturedImage['recaptureSource']> | null>(null);
    const pendingRecaptureSourceRef = useRef<NonNullable<CapturedImage['recaptureSource']> | null>(null);
    const [isDBViewOpen, setIsDBViewOpen] = useState(false);
    const [isDashboardOpen, setIsDashboardOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportType, setReportType] = useState<'pptx' | 'xlsx'>('pptx');
    const [dbStats, setDbStats] = useState<DBStats | null>(null);

    const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [serverHealth, setServerHealth] = useState<ServerHealthStatus | null>(null);

    const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
    const [copyNotification, setCopyNotification] = useState('');

    const [loadedDocs, setLoadedDocs] = useState<string[]>([]);
    const [isDocProcessing, setIsDocProcessing] = useState(false);

    const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
    const [mobileConnection, setMobileConnection] = useState<MobileConnectionData | null>(null);
    const [mobileLoading, setMobileLoading] = useState(false);
    const [customPort, setCustomPort] = useState('');

    // --- ADMIN MODE STATE ---
    const [isAdmin, setIsAdmin] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    const activeCaptureSummary = summarizeCaptureSession(capturedImages, activeCaptureSessionId);
    const pendingRecaptureGuidance = pendingRecaptureSource
        ? buildRecaptureCaptureGuidance(pendingRecaptureSource)
        : null;

    const startNewCaptureSession = useCallback((source = 'workspace') => {
        const nextSessionId = createCaptureSessionId(source);
        activeCaptureSessionIdRef.current = nextSessionId;
        setActiveCaptureSessionId(nextSessionId);
        return nextSessionId;
    }, []);

    const updateScreenCaptureViewTag = (viewTag: CaptureViewTag) => {
        screenCaptureViewTagRef.current = viewTag;
        setScreenCaptureViewTag(viewTag);
    };

    const setPendingRecaptureLineage = useCallback((source: CapturedImage['recaptureSource'] | null) => {
        const nextSource = source || null;
        pendingRecaptureSourceRef.current = nextSource;
        setPendingRecaptureSource(nextSource);
        if (nextSource) {
            const guidance = buildRecaptureCaptureGuidance(nextSource);
            screenCaptureViewTagRef.current = guidance.recommendedViewTag;
            setScreenCaptureViewTag(guidance.recommendedViewTag);
        }
    }, []);

    const consumePendingRecaptureLineage = useCallback((): CapturedImage['recaptureSource'] | undefined => {
        const source = pendingRecaptureSourceRef.current || undefined;
        if (source) {
            pendingRecaptureSourceRef.current = null;
            setPendingRecaptureSource(null);
        }
        return source;
    }, []);

    const getRecaptureRecommendedView = useCallback(
        (source: CapturedImage['recaptureSource'] | undefined): CaptureViewTag | undefined =>
            source ? buildRecaptureCaptureGuidance(source).recommendedViewTag : undefined,
        []
    );

    useEffect(() => {
        const refreshManualDocuments = () => {
            setLoadedDocs(listManualDocuments().map(document => document.fileName));
        };
        refreshManualDocuments();
        window.addEventListener(MANUAL_DOCUMENTS_CHANGED_EVENT, refreshManualDocuments);
        return () => {
            window.removeEventListener(MANUAL_DOCUMENTS_CHANGED_EVENT, refreshManualDocuments);
        };
    }, []);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const unsubEditor = window.electronAPI.onShowAnnotationEditor((dataUrl) => {
            setEditingState({
                baseImageUrl: dataUrl,
                annotations: [],
                shapes: [],
                captureSessionId: activeCaptureSessionIdRef.current,
                captureViewTag: screenCaptureViewTagRef.current,
                captureImageKind: 'physical_product',
                captureSource: 'screen',
                recaptureSource: pendingRecaptureSourceRef.current || undefined
            });
            setStatus('idle');
        });

        const unsubSession = window.electronAPI.onCaptureSessionEnded(() => setStatus('idle'));

        const unsubMobileUpload = window.electronAPI.onMobileUploadSuccess((payload) => {
            const recaptureSource = consumePendingRecaptureLineage();
            const recaptureViewTag = getRecaptureRecommendedView(recaptureSource);
            setCapturedImages(prev => {
                if (prev.length > 0 && prev[prev.length - 1].dataUrl === payload.dataUrl) {
                    return prev;
                }
                return [...prev, {
                    id: Date.now().toString(),
                    baseImageUrl: payload.dataUrl,
                    dataUrl: payload.dataUrl,
                    annotations: [],
                    shapes: [],
                    captureSessionId: activeCaptureSessionIdRef.current,
                    ...(recaptureViewTag ? { captureViewTag: recaptureViewTag } : {}),
                    captureImageKind: 'physical_product',
                    captureSource: 'mobile',
                    ...(recaptureSource ? { recaptureSource } : {})
                }];
            });
            setCopyNotification(`모바일에서 파일이 수신되었습니다: ${payload.filename}`);
            setTimeout(() => setCopyNotification(''), 3000);
        });

        const unsubMobileConnect = window.electronAPI.onMobileConnectAttempt((payload) => {
            setCopyNotification(`📲 모바일 접속 시도 감지됨 (IP: ${payload.ip})`);
            setTimeout(() => setCopyNotification(''), 4000);
        });

        const fetchConfig = async () => {
            const config = await window.electronAPI.getApiConfig();
            setApiConfig(config);
        };

        const updateStats = async () => {
            try {
                const stats = await window.electronAPI.getDBStats();
                setDbStats(stats);
            } catch (e) { console.error(e); }
        };

        fetchConfig();
        setLoadedDocs(listManualDocuments().map(document => document.fileName));
        updateStats();

        const interval = setInterval(updateStats, 10000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
            unsubEditor();
            unsubSession();
            unsubMobileUpload();
            unsubMobileConnect();
        };
    }, [consumePendingRecaptureLineage, getRecaptureRecommendedView]);

    useEffect(() => {
        let cancelled = false;

        const updateServerStatus = async () => {
            if (!isOnline) {
                if (!cancelled) {
                    setServerHealth({
                        rag: 'offline',
                        agent: 'offline',
                        checkedAt: Date.now()
                    });
                }
                return;
            }

            try {
                const health = await checkServerHealth();
                if (!cancelled) {
                    setServerHealth(health);
                }
            } catch (error) {
                console.error('Failed to check server health:', error);
                if (!cancelled) {
                    setServerHealth({
                        rag: 'offline',
                        agent: 'offline',
                        checkedAt: Date.now()
                    });
                }
            }
        };

        updateServerStatus();
        const interval = window.setInterval(updateServerStatus, 15000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [apiConfig?.agentServerUrl, isOnline]);

    const handleAdminLogin = () => {
        const targetPassword = apiConfig?.adminPassword || 'admin1234';
        if (loginPassword === targetPassword) {
            setIsAdmin(true);
            setShowLoginModal(false);
            setLoginPassword('');
            setLoginError('');
        } else {
            setLoginError('비밀번호가 올바르지 않습니다.');
        }
    };

    const startCapture = async () => {
        if (status !== 'idle') return;
        setStatus('capturing');
        setError(null);
        try {
            await window.electronAPI.startCaptureSession();
        } catch (err) {
            console.error(err);
            setError("캡처 시작 실패");
            setStatus('idle');
        }
    };

    const handleSaveAnnotation = (savedData: any) => {
        if (savedData.id) {
            setCapturedImages(prev => prev.map(img =>
                img.id === savedData.id
                    ? {
                        ...img,
                        baseImageUrl: savedData.baseImageUrl,
                        dataUrl: savedData.dataUrl,
                        annotations: savedData.annotations,
                        shapes: savedData.shapes,
                        analysis: undefined,
                        analysisError: undefined,
                        visionQuality: undefined,
                        commonAgentImageId: undefined,
                        commonAgentStatus: 'idle',
                        commonAgentLastSyncAt: undefined,
                        commonAgentAnnotationCount: undefined
                    }
                    : img
            ));
        } else {
            const recaptureSource = editingState?.recaptureSource;
            const newImage: CapturedImage = {
                id: Date.now().toString(),
                baseImageUrl: savedData.baseImageUrl,
                dataUrl: savedData.dataUrl,
                annotations: savedData.annotations,
                shapes: savedData.shapes,
                captureSessionId: editingState?.captureSessionId || activeCaptureSessionIdRef.current,
                captureViewTag: editingState?.captureViewTag || screenCaptureViewTagRef.current,
                captureImageKind: editingState?.captureImageKind || 'physical_product',
                captureSource: editingState?.captureSource || 'screen',
                ...(recaptureSource ? { recaptureSource } : {})
            };
            setCapturedImages(prev => [...prev, newImage]);
            if (recaptureSource) setPendingRecaptureLineage(null);
        }
        setEditingState(null);
        setStatus('idle');
    };

    const cropImageToShapes = async (dataUrl: string, shapes: Shape[], annotations: TextAnnotation[]): Promise<string> => {
        if ((!shapes || shapes.length === 0) && (!annotations || annotations.length === 0)) {
            return dataUrl;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
                let hasPoints = false;

                shapes?.forEach(shape => {
                    shape.points.forEach(p => {
                        minX = Math.min(minX, p.x);
                        minY = Math.min(minY, p.y);
                        maxX = Math.max(maxX, p.x);
                        maxY = Math.max(maxY, p.y);
                        hasPoints = true;
                    });
                });

                annotations?.forEach(ann => {
                    minX = Math.min(minX, ann.textPos.x);
                    minY = Math.min(minY, ann.textPos.y - ann.fontSize);
                    maxX = Math.max(maxX, ann.textPos.x + (ann.text.length * ann.fontSize));
                    maxY = Math.max(maxY, ann.textPos.y);
                    hasPoints = true;

                    if (ann.arrow) {
                        [ann.arrow.start, ann.arrow.end].forEach(p => {
                            minX = Math.min(minX, p.x);
                            minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x);
                            maxY = Math.max(maxY, p.y);
                        });
                    }
                });

                if (!hasPoints) {
                    resolve(dataUrl);
                    return;
                }

                const padding = 50;
                minX = Math.max(0, minX - padding);
                minY = Math.max(0, minY - padding);
                maxX = Math.min(img.width, maxX + padding);
                maxY = Math.min(img.height, maxY + padding);

                const width = maxX - minX;
                const height = maxY - minY;

                if (width <= 0 || height <= 0) {
                    resolve(dataUrl);
                    return;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, minX, minY, width, height, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/png'));
                } else {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    };

    const runDiagnosis = useCallback(async (imageId: string, retrievalMode: RetrievalMode = 'hybrid') => {
        const image = capturedImages.find(img => img.id === imageId);
        if (!image) return;
        const sessionImages = collectSessionDiagnosisImages(image, capturedImages);
        const sessionImageIds = sessionImages.map(item => item.id);
        if (
            sessionImages.length === 0
            || sessionImageIds.some(id => isAnalyzing.has(id))
        ) return;

        const captureAssessment = assessCaptureImageForDiagnosis(image, capturedImages);
        if (!captureAssessment.ready) {
            setCapturedImages(prev => prev.map(img => img.id === imageId
                ? { ...img, analysisError: `촬영 프로토콜 확인 필요: ${captureAssessment.message}` }
                : img
            ));
            return;
        }

        if (!isOnline) {
            setCapturedImages(prev => prev.map(img => img.id === imageId ? { ...img, analysisError: "인터넷 연결 필요" } : img));
            return;
        }

        setIsAnalyzing(prev => {
            const next = new Set(prev);
            sessionImageIds.forEach(id => next.add(id));
            return next;
        });
        setCapturedImages(prev => prev.map(img => sessionImageIds.includes(img.id)
            ? { ...img, analysisError: undefined }
            : img
        ));

        try {
            const preparedViews = await Promise.all(sessionImages.map(async sessionImage => {
                const croppedDataUrl = await cropImageToShapes(
                    sessionImage.dataUrl,
                    sessionImage.shapes || [],
                    sessionImage.annotations || []
                );
                const visionQuality = await inspectVisionImageQuality(
                    croppedDataUrl
                ) as VisionImageQualityReport;
                return { image: sessionImage, croppedDataUrl, visionQuality };
            }));
            const qualityByImageId = new Map(
                preparedViews.map(item => [item.image.id, item.visionQuality])
            );
            setCapturedImages(prev => prev.map(img => qualityByImageId.has(img.id)
                ? { ...img, visionQuality: qualityByImageId.get(img.id) }
                : img
            ));
            const rejectedViews = preparedViews.filter(item => !item.visionQuality.canAnalyze);
            if (rejectedViews.length > 0) {
                const details = rejectedViews.map(item => [
                    item.image.captureViewTag,
                    formatVisionQualityMessage(item.visionQuality)
                ].filter(Boolean).join(': '));
                throw new Error(`다중 시점 사진 품질 확인 필요: ${details.join(' / ')}`);
            }
            const usableImages = preparedViews.map(item => item.image);
            const usableAssessment = summarizeCaptureSession(
                usableImages,
                image.captureSessionId
            );
            if (!usableAssessment.ready) {
                throw new Error(`다중 시점 촬영 확인 필요: ${usableAssessment.message}`);
            }
            const primaryView = preparedViews.find(item => item.image.id === imageId);
            if (!primaryView) {
                throw new Error('선택한 대표 이미지를 다중 시점 세션에서 찾지 못했습니다.');
            }
            const captureMetadata = buildCaptureMetadata(image, usableImages);
            const diagnosisContext = buildMultimodalDiagnosisContext(image, captureMetadata);
            const diagnosis = await CommonAgentGateway.diagnoseImage({
                imageId,
                dataUrl: primaryView.croppedDataUrl,
                fileName: `${imageId}.png`,
                retrievalMode,
                diagnosisContext,
                visionQuality: primaryView.visionQuality,
                sessionImages: preparedViews.map(item => ({
                    imageId: item.image.id,
                    dataUrl: item.croppedDataUrl,
                    fileName: `${item.image.id}.png`,
                    captureViewTag: item.image.captureViewTag!,
                    captureImageKind: item.image.captureImageKind!,
                    captureSource: item.image.captureSource || 'file',
                    isPrimary: item.image.id === imageId,
                    visionQuality: item.visionQuality
                }))
            });
            const result = diagnosis.analysis;
            const serverIds = diagnosis.commonAgentImageIdsByLocalId || {};
            setCapturedImages(prev => prev.map(img => sessionImageIds.includes(img.id) ? {
                ...img,
                analysis: result,
                visionQuality: qualityByImageId.get(img.id) || img.visionQuality,
                commonAgentImageId: serverIds[img.id]
                    || (img.id === imageId ? diagnosis.commonAgentImageId : undefined)
                    || img.commonAgentImageId,
                commonAgentStatus: serverIds[img.id] || (img.id === imageId && diagnosis.commonAgentImageId)
                    ? 'synced'
                    : img.commonAgentStatus,
                commonAgentLastSyncAt: serverIds[img.id] || (img.id === imageId && diagnosis.commonAgentImageId)
                    ? Date.now()
                    : img.commonAgentLastSyncAt
            } : img));

        } catch (err) {
            const msg = err instanceof Error ? err.message : '진단 실패';
            setCapturedImages(prev => prev.map(img => sessionImageIds.includes(img.id)
                ? { ...img, analysisError: msg }
                : img
            ));
        } finally {
            setIsAnalyzing(prev => {
                const next = new Set(prev);
                sessionImageIds.forEach(id => next.delete(id));
                return next;
            });
        }
    }, [capturedImages, isAnalyzing, isOnline]);

    const handleAnalyzeClick = (imageId: string, retrievalMode: RetrievalMode = 'hybrid') => {
        setModalImageId(imageId);
        const img = capturedImages.find(i => i.id === imageId);
        if (img && !img.analysis && !img.analysisError) {
            runDiagnosis(imageId, retrievalMode);
        }
    };

    const handleGraphAnalyzeClick = (imageId: string) => {
        setModalImageId(imageId);
        void runDiagnosis(imageId, 'graph_only');
    };

    const handleCommonAgentSync = useCallback(async (imageId: string) => {
        const image = capturedImages.find(img => img.id === imageId);
        if (!image || isAnalyzing.has(imageId)) return;

        const captureAssessment = assessCaptureImageForDiagnosis(image, capturedImages);
        if (!captureAssessment.ready) {
            setCapturedImages(prev => prev.map(img => img.id === imageId ? {
                ...img,
                commonAgentStatus: 'error',
                analysisError: `촬영 프로토콜 확인 필요: ${captureAssessment.message}`
            } : img));
            return;
        }

        if (!isOnline) {
            setCapturedImages(prev => prev.map(img => img.id === imageId ? {
                ...img,
                commonAgentStatus: 'error',
                analysisError: 'Common Agent 동기화에는 네트워크 연결이 필요합니다.'
            } : img));
            return;
        }

        setIsAnalyzing(prev => new Set(prev).add(imageId));
        setCapturedImages(prev => prev.map(img => img.id === imageId ? {
            ...img,
            commonAgentStatus: 'syncing',
            analysisError: undefined
        } : img));

        try {
            let commonAgentImageId = image.commonAgentImageId;
            let analysis = image.analysis;

            if (!commonAgentImageId) {
                const uploadDataUrl = image.baseImageUrl || image.dataUrl;
                const visionQuality = await inspectVisionImageQuality(uploadDataUrl) as VisionImageQualityReport;
                setCapturedImages(prev => prev.map(img => img.id === imageId
                    ? { ...img, visionQuality }
                    : img
                ));
                if (!visionQuality.canAnalyze) {
                    throw new Error(`사진 품질 확인 필요: ${formatVisionQualityMessage(visionQuality)}`);
                }
                const fileExt = uploadDataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
                const file = dataUrlToFile(uploadDataUrl, `${image.id}.${fileExt}`);
                const captureMetadata = buildCaptureMetadata(image, capturedImages);
                const diagnosisContext = buildMultimodalDiagnosisContext(image, captureMetadata);
                const diagnosis = await CommonAgentApiService.diagnoseImage(file, {
                    question: diagnosisContext.question,
                    sourceSystem: 'mold-master-ai',
                    processArea: image.analysis?.defectType ? undefined : '품질',
                    persistMode: 'classifiable_only',
                    metadata: {
                        local_image_id: image.id,
                        source_app: 'mold-master-ai',
                        local_shape_count: image.shapes?.length || 0,
                        vision_quality_status: visionQuality.status,
                        vision_quality_score: visionQuality.score,
                        vision_quality_issue_codes: visionQuality.issues.map(issue => issue.code),
                        ...diagnosisContext.metadata
                    },
                    sessionId: image.captureSessionId
                });
                if (diagnosis.metadata?.persisted_to_dataset === false) {
                    throw new Error('제조 결함을 판정할 수 없어 Common Agent 학습 큐에 저장하지 않았습니다.');
                }
                commonAgentImageId = diagnosis.image_id;
                analysis = CommonAgentApiService.toDefectAnalysis(diagnosis, 'graph_only');
            }

            const existingAnnotations = await CommonAgentApiService.listAnnotations(commonAgentImageId).catch(() => []);
            const payloads = await buildCommonAgentAnnotationPayloads(
                { ...image, analysis, commonAgentImageId },
                existingAnnotations
            );
            let createdCount = 0;
            const createdAnnotations = [];

            for (const payload of payloads) {
                const createdAnnotation = await CommonAgentApiService.createAnnotation(commonAgentImageId, payload);
                createdAnnotations.push(createdAnnotation);
                createdCount++;
            }
            const allAnnotations = [...existingAnnotations, ...createdAnnotations];
            const visionBboxAnnotationSummary = summarizeVisionBboxAnnotationStatus({
                visionSummary: analysis.visionSummary,
                annotations: allAnnotations
            });

            setCapturedImages(prev => prev.map(img => img.id === imageId ? {
                ...img,
                analysis,
                commonAgentImageId,
                commonAgentStatus: 'synced',
                commonAgentLastSyncAt: Date.now(),
                commonAgentAnnotationCount: allAnnotations.length,
                visionBboxAnnotationSummary,
                analysisError: undefined
            } : img));
            setCopyNotification(`Common Agent 동기화 완료: ${commonAgentImageId}, ROI ${createdCount}개 전송`);
            setTimeout(() => setCopyNotification(''), 4000);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Common Agent 동기화 실패';
            console.error('[Common Agent Sync Error]', err);
            setCapturedImages(prev => prev.map(img => img.id === imageId ? {
                ...img,
                commonAgentStatus: 'error',
                analysisError: msg
            } : img));
        } finally {
            setIsAnalyzing(prev => {
                const next = new Set(prev);
                next.delete(imageId);
                return next;
            });
        }
    }, [capturedImages, isAnalyzing, isOnline]);

    const formatBboxReviewSubmissionError = (reason: string) => {
        if (reason === 'missing_common_agent_image_id') return '먼저 Agent 동기화를 완료해야 bbox 검수 제출이 가능합니다.';
        if (reason === 'invalid_bbox_correction_draft') return 'bbox 보정 좌표가 유효하지 않습니다.';
        if (reason === 'invalid_vision_observation_bbox') return '유효한 Vision bbox 근거가 없습니다.';
        return 'bbox 검수 제출 요청이 유효하지 않습니다.';
    };

    const handleSubmitVisionBboxReview = useCallback(async (submission: VisionBboxReviewSubmission) => {
        if (!submission.canSubmit || !submission.packet || !submission.annotationRequest) {
            throw new Error(formatBboxReviewSubmissionError(submission.rejectionReason));
        }

        const imageId = submission.packet.localImageId;
        const image = capturedImages.find(item => item.id === imageId);
        if (!image) {
            throw new Error('bbox 검수 대상 이미지를 찾을 수 없습니다.');
        }

        setCapturedImages(prev => prev.map(item => item.id === imageId ? {
            ...item,
            commonAgentStatus: 'syncing',
            analysisError: undefined
        } : item));

        try {
            const createdAnnotation = await CommonAgentApiService.createAnnotation(
                submission.commonAgentImageId,
                submission.annotationRequest
            );
            const allAnnotations = await CommonAgentApiService
                .listAnnotations(submission.commonAgentImageId)
                .catch(() => [createdAnnotation]);
            const visionBboxAnnotationSummary = image.analysis?.visionSummary
                ? summarizeVisionBboxAnnotationStatus({
                    visionSummary: image.analysis.visionSummary,
                    annotations: allAnnotations
                })
                : image.visionBboxAnnotationSummary;

            setCapturedImages(prev => prev.map(item => item.id === imageId ? {
                ...item,
                commonAgentStatus: 'synced',
                commonAgentLastSyncAt: Date.now(),
                commonAgentAnnotationCount: allAnnotations.length,
                visionBboxAnnotationSummary,
                analysisError: undefined
            } : item));
            setCopyNotification(`bbox 검수 제출 완료: ${submission.packet.observationId}`);
            setTimeout(() => setCopyNotification(''), 3000);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'bbox 검수 제출 실패';
            setCapturedImages(prev => prev.map(item => item.id === imageId ? {
                ...item,
                commonAgentStatus: 'error',
                analysisError: message
            } : item));
            throw error;
        }
    }, [capturedImages]);

    const handleBatchAnalysis = async () => {
        if (selectedImageIds.size === 0) return;
        setIsBatchProcessing(true);

        const idsToProcess = selectDiagnosisTargetIds(
            capturedImages,
            Array.from(selectedImageIds),
            Array.from(isAnalyzing)
        );

        try {
            await Promise.all(idsToProcess.map(id => runDiagnosis(id)));
        } catch (e) {
            console.error("Batch processing error", e);
        } finally {
            setIsBatchProcessing(false);
        }
    };

    const handleTrainAI = async (correctedData: DefectAnalysis, status: VisionHitlDecision) => {
        try {
            const decision = resolveVisionHitlDecision(status);
            const graphPromotionGuard = canPromoteVisionAnalysisToGraph(correctedData);
            if (decision.promoteToGraph && !graphPromotionGuard.allowed) {
                throw new Error(graphPromotionGuard.message);
            }
            if (modalImageId) {
                const image = capturedImages.find(img => img.id === modalImageId);
                if (image) {
                    try {
                        const captureAssessment = assessCaptureImageForDiagnosis(image, capturedImages);
                        if (decision.promoteToGraph && !captureAssessment.ready) {
                            throw new Error(`승인 전 촬영 프로토콜 확인 필요: ${captureAssessment.message}`);
                        }
                        const captureMetadata = buildCaptureMetadata(image, capturedImages);
                        let commonAgentImageId = image.commonAgentImageId;
                        if (!commonAgentImageId) {
                            const blob = dataURItoBlob(image.dataUrl);
                            const file = new File([blob], `${modalImageId}.png`, { type: blob.type || 'image/png' });
                            const diagnosisContext = buildMultimodalDiagnosisContext(image, captureMetadata);
                            const diagnosis = await CommonAgentApiService.diagnoseImage(file, {
                                question: diagnosisContext.question,
                                sourceSystem: 'mold-master-ai',
                                processArea: 'injection-molding',
                                persistMode: 'always',
                                metadata: {
                                    local_image_id: modalImageId,
                                    source_app: 'mold-master-ai',
                                    upload_reason: 'hitl_feedback',
                                    ...diagnosisContext.metadata
                                },
                                sessionId: image.captureSessionId
                            });
                            commonAgentImageId = diagnosis.image_id;
                            setCapturedImages(prev => prev.map(img => img.id === modalImageId ? {
                                ...img,
                                commonAgentImageId,
                                commonAgentStatus: 'synced',
                                commonAgentLastSyncAt: Date.now()
                            } : img));
                        }

                        const imageBlob = dataURItoBlob(image.dataUrl);
                        const contentSha256 = await sha256Hex(imageBlob);
                        if (decision.promoteToGraph) {
                            const conflicts = await CommonAgentApiService.findApprovedImageLabelConflicts({
                                contentSha256,
                                defectType: correctedData.defectType,
                                excludeImageId: commonAgentImageId
                            });
                            if (conflicts.length > 0) {
                                const conflictLabels = [...new Set(conflicts.map(conflict => conflict.defectType))];
                                throw new Error(
                                    `동일 이미지가 다른 승인 라벨(${conflictLabels.join(', ')})로 등록되어 있습니다. `
                                    + '기존 레코드를 HITL에서 정리한 후 승인하세요.'
                                );
                            }
                        }
                        await CommonAgentApiService.reviewImageDataset(commonAgentImageId, {
                            decision: decision.apiDecision,
                            defectType: correctedData.defectType,
                            observationSummary: correctedData.description,
                            possibleCauses: splitReviewLines(correctedData.possibleCauses),
                            recommendedChecks: splitReviewLines(correctedData.countermeasures),
                            labels: [correctedData.defectType],
                            processArea: 'injection-molding',
                            severity: correctedData.severity,
                            question: image.phenomenonDescription,
                            answer: correctedData.rawOutput,
                            comment: status === 'approved'
                                ? 'Mold Master AI에서 교정된 진단으로 승인 및 Graph 승격'
                                : status === 'corrected'
                                    ? 'Mold Master AI에서 사람 교정본 저장 및 재평가 요청'
                                    : status === 'rejected'
                                        ? 'Mold Master AI에서 진단 반려'
                                        : status === 'recapture'
                                            ? 'Mold Master AI에서 추가 시점 재촬영 요청'
                                            : 'Mold Master AI에서 사람 검토 요청',
                            promoteToGraph: decision.promoteToGraph,
                            metadata: {
                                local_image_id: modalImageId,
                                content_sha256: contentSha256,
                                corrected_analysis: correctedData,
                                original_analysis: image.analysis,
                                actor_id: isAdmin
                                    ? 'mold-master-ai-admin'
                                    : 'mold-master-ai-reviewer',
                                source_app: 'mold-master-ai',
                                human_review_decision: status,
                                human_correction_applied: status === 'corrected',
                                recapture_required: status === 'recapture',
                                learning_candidate_eligible: status === 'approved',
                                fine_tuning_auto_start_allowed: false,
                                orchestration: correctedData.orchestrationSummary,
                                ...buildVisionHitlReviewMetadata(correctedData, status),
                                ...captureMetadata
                            }
                        });
                        if (status === 'recapture') {
                            const reviewDecisionId = `${commonAgentImageId}:recapture:${contentSha256.slice(0, 12)}`;
                            setPendingRecaptureLineage(buildRecaptureSourceFromReview({
                                image: { ...image, commonAgentImageId },
                                analysis: correctedData,
                                reviewDecisionId
                            }));
                            setCopyNotification('재촬영 연결 대기: 다음 신규 사진이 이 HITL 요청과 자동 연결됩니다.');
                            setTimeout(() => setCopyNotification(''), 5000);
                        }
                        console.log('Successfully submitted HITL feedback to Common Agent');
                    } catch (agentFeedbackError) {
                        console.error('Failed to submit HITL feedback to Common Agent:', agentFeedbackError);
                        setCopyNotification('Common Agent HITL 검증에 실패하여 승인 상태를 저장하지 않았습니다.');
                        setTimeout(() => setCopyNotification(''), 5000);
                        throw agentFeedbackError;
                    }
                }

                await window.electronAPI.saveUserFeedback(
                    correctedData,
                    modalImageId,
                    decision.localStatus,
                    decision.localLearningVerified,
                    image?.dataUrl,
                    { knowledgeScope: decision.knowledgeScope }
                );
                const reviewedAnalysis = status === 'approved'
                    ? correctedData
                    : {
                        ...correctedData,
                        visionSummary: correctedData.visionSummary
                            ? {
                                ...correctedData.visionSummary,
                                decisionStatus: 'needs_review' as const,
                                decisionReason: status === 'corrected'
                                    ? 'human_correction_pending_re_evaluation'
                                    : status === 'recapture'
                                        ? 'human_recapture_requested'
                                        : status === 'rejected'
                                            ? 'human_rejected'
                                            : 'human_review_requested'
                            }
                            : correctedData.visionSummary
                    };
                setCapturedImages(prev => prev.map(img =>
                    img.id === modalImageId ? { ...img, analysis: reviewedAnalysis } : img
                ));
                const stats = await window.electronAPI.getDBStats();
                setDbStats(stats);
            }
        } catch (e) {
            console.error("Failed to learn", e);
            setError("학습 데이터 저장 실패");
            throw e;
        }
    };

    const copyTextToClipboard = async (text: string, successMessage: string) => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopyNotification(successMessage);
            setTimeout(() => setCopyNotification(''), 3000);
        } catch (error) {
            console.error('Clipboard copy failed:', error);
            setError('클립보드 복사에 실패했습니다.');
        }
    };

    const handleCopyCommonAgentImageId = async (imageId: string) => {
        const image = capturedImages.find(img => img.id === imageId);
        if (!image?.commonAgentImageId) {
            setCopyNotification('먼저 Agent 동기화를 실행해 image_id를 생성하세요.');
            setTimeout(() => setCopyNotification(''), 3000);
            return;
        }
        await copyTextToClipboard(image.commonAgentImageId, `image_id 복사 완료: ${image.commonAgentImageId}`);
    };

    const buildCommonAgentImageIdListText = () => {
        const syncedImages = capturedImages.filter(image => image.commonAgentImageId);
        const lines = [
            'Common Agent image_id list',
            `exported_at=${new Date().toISOString()}`,
            `count=${syncedImages.length}`,
            '',
            'common_agent_image_id\tlocal_image_id\troi_count\tlast_sync_at'
        ];

        syncedImages.forEach(image => {
            const lastSync = image.commonAgentLastSyncAt ? new Date(image.commonAgentLastSyncAt).toISOString() : '';
            lines.push([
                image.commonAgentImageId,
                image.id,
                image.commonAgentAnnotationCount || 0,
                lastSync
            ].join('\t'));
        });

        return lines.join('\n') + '\n';
    };

    const handleCopyCommonAgentImageIdList = async () => {
        const syncedCount = capturedImages.filter(image => image.commonAgentImageId).length;
        if (syncedCount === 0) {
            setCopyNotification('복사할 Agent image_id가 없습니다.');
            setTimeout(() => setCopyNotification(''), 3000);
            return;
        }
        await copyTextToClipboard(buildCommonAgentImageIdListText(), `Agent image_id ${syncedCount}개 복사 완료`);
    };

    const handleDownloadCommonAgentImageIdList = () => {
        const syncedCount = capturedImages.filter(image => image.commonAgentImageId).length;
        if (syncedCount === 0) {
            setCopyNotification('저장할 Agent image_id가 없습니다.');
            setTimeout(() => setCopyNotification(''), 3000);
            return;
        }

        const blob = new Blob([buildCommonAgentImageIdListText()], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `common-agent-image-ids-${stamp}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setCopyNotification(`Agent image_id ${syncedCount}개 TXT 저장 완료`);
        setTimeout(() => setCopyNotification(''), 3000);
    };

    const handleUploadKB = async () => {
        const files = await window.electronAPI.readFileContents();
        if (!files || files.length === 0) return;

        setIsDocProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const file of files) {
            try {
                await syncManualDocument(file.name, file.content);
                successCount++;
            } catch (e) {
                console.error(`Common Agent document sync failed for ${file.name}`, e);
                failCount++;
            }
        }

        setLoadedDocs(listManualDocuments().map(document => document.fileName));
        setIsDocProcessing(false);
        setError(
            `${successCount}개 Common Agent 문서 등록 완료` +
            `${failCount > 0 ? `, ${failCount}개 실패` : ''}`
        );
        setTimeout(() => setError(null), 3000);
    };

    const handleCameraCapture = (dataUrl: string, metadata: CameraCaptureMetadata) => {
        const recaptureSource = consumePendingRecaptureLineage();
        setCapturedImages(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            baseImageUrl: dataUrl,
            dataUrl: dataUrl,
            annotations: [],
            shapes: [],
            ...metadata,
            ...(recaptureSource ? { recaptureSource } : {})
        }]);
    };

    const handleNewCaptureSession = (source = 'workspace') => {
        const sessionId = startNewCaptureSession(source);
        setCopyNotification(`새 촬영 세션 시작: ${sessionId.slice(-12)}`);
        setTimeout(() => setCopyNotification(''), 3000);
    };

    const updateImageCaptureMetadata = (
        imageId: string,
        patch: Partial<Pick<CapturedImage, 'captureViewTag' | 'captureImageKind'>>
    ) => {
        setCapturedImages(previous => previous.map(image =>
            image.id === imageId
                ? {
                    ...image,
                    ...patch,
                    analysis: undefined,
                    analysisError: undefined,
                    visionQuality: undefined,
                    commonAgentImageId: undefined,
                    commonAgentStatus: 'idle',
                    commonAgentLastSyncAt: undefined,
                    commonAgentAnnotationCount: undefined
                }
                : image
        ));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach((file: any) => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (ev.target?.result) {
                            const recaptureSource = consumePendingRecaptureLineage();
                            const recaptureViewTag = getRecaptureRecommendedView(recaptureSource);
                            setCapturedImages(prev => [...prev, {
                                id: Date.now().toString() + Math.random(),
                                baseImageUrl: ev.target!.result as string,
                                dataUrl: ev.target!.result as string,
                                annotations: [],
                                shapes: [],
                                captureSessionId: activeCaptureSessionIdRef.current,
                                ...(recaptureViewTag ? { captureViewTag: recaptureViewTag } : {}),
                                captureImageKind: recaptureSource ? 'physical_product' : 'unknown',
                                captureSource: 'file',
                                ...(recaptureSource ? { recaptureSource } : {})
                            }]);
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
            e.target.value = '';
        }
    };

    const handleDragStart = (index: number) => { draggedItemIndex.current = index; };
    const handleDragEnter = (index: number) => { if (draggedItemIndex.current !== index) setDragOverIndex(index); };
    const handleDropSort = () => {
        if (draggedItemIndex.current === null || dragOverIndex === null || draggedItemIndex.current === dragOverIndex) {
            draggedItemIndex.current = null; setDragOverIndex(null); return;
        }
        const newImages = [...capturedImages];
        const [item] = newImages.splice(draggedItemIndex.current, 1);
        newImages.splice(dragOverIndex, 0, item);
        setCapturedImages(newImages);
        draggedItemIndex.current = null; setDragOverIndex(null);
    };
    const handleDragEnd = () => { draggedItemIndex.current = null; setDragOverIndex(null); };
    const toggleImageSelection = (id: string) => {
        setSelectedImageIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    };
    const handleGenerateReportClick = (type: 'pptx' | 'xlsx') => {
        setReportType(type);
        if (type === 'pptx') {
            setIsReportModalOpen(true);
        } else {
            // XLSX는 레이아웃 선택 없이 바로 생성 (추후 확장 가능)
            handleGenerateReport(type, undefined, {}, []);
        }
    };

    const handleGenerateReport = async (type: 'pptx' | 'xlsx', layoutId?: string, basicInfo?: any, modifiedImages?: CapturedImage[] | ReportItem[], isVerified: boolean = false) => {
        if (capturedImages.length === 0) return;
        setStatus('generating');
        try {
            // Wizard에서 수정된 이미지가 넘어오면 그것을 사용, 아니면 선택된 이미지 사용
            // ReportItem[] 형태로 넘어올 수도 있어서 타입 체크가 필요하지만,
            // 현재 구조상 modifiedImages가 ReportItem[]일 수도 있음 (ReportWizard에서 reportItems를 넘김)
            // ReportWizard에서 onGenerate 호출 시: (layoutId, basicInfo, reportItems, isVerified)
            // handleGenerateReport 호출 시: ('pptx', layoutId, basicInfo, reportItems, isVerified)

            // 타입 단언 및 호환성 처리
            let target: any = modifiedImages;
            if (!target && selectedImageIds.size > 0) {
                target = capturedImages.filter(i => selectedImageIds.has(i.id));
            } else if (!target) {
                target = capturedImages;
            }

            if (type === 'pptx') {
                // 레이아웃 정보 가져오기
                let layout = null;
                if (layoutId) {
                    const layouts = await window.electronAPI.getReportLayouts();
                    layout = layouts.find((l: any) => l.id === layoutId);
                }
                // isVerified 전달
                await generatePptxReport(target, layout, basicInfo, isVerified);
                if (Array.isArray(target) && target.length > 0 && 'images' in target[0]) {
                    try {
                        const syncPayload = buildDocumentDraftSyncPayload(
                            layoutId,
                            basicInfo || {},
                            target as ReportItem[]
                        );
                        const draft = await CommonAgentDocumentService.syncDraft(syncPayload, { verified: isVerified });
                        setCopyNotification(`Common Agent 문서 동기화 완료: ${draft.draft_id} (${draft.status})`);
                        setTimeout(() => setCopyNotification(''), 4000);
                    } catch (syncError) {
                        console.error('Common Agent document sync failed:', syncError);
                        setCopyNotification('보고서는 생성되었지만 Common Agent 문서 동기화에 실패했습니다.');
                        setTimeout(() => setCopyNotification(''), 5000);
                    }
                }
            }
            else await generateXlsxReport(target);

            setIsReportModalOpen(false);
        } catch (e) {
            console.error(e);
            setError('생성 실패');
        } finally {
            setStatus('idle');
        }
    };
    const copyImagesToClipboard = useCallback(async (idsToCopy: string[]) => {
        if (idsToCopy.length === 0) return;
        const orderedImagesToCopy = capturedImages.filter(img => idsToCopy.includes(img.id));
        if (orderedImagesToCopy.length === 0) return;
        setStatus('generating');
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Canvas Context Error");
            const imageElements = await Promise.all(
                orderedImagesToCopy.map(imgData => new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = imgData.dataUrl;
                }))
            );
            const totalWidth = Math.max(...imageElements.map(img => img.width));
            const totalHeight = imageElements.reduce((sum, img) => sum + img.height, 0);
            canvas.width = totalWidth; canvas.height = totalHeight;
            let currentY = 0;
            for (const img of imageElements) { ctx.drawImage(img, 0, currentY); currentY += img.height; }
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    setCopyNotification(`Copied ${idsToCopy.length} images!`);
                    setTimeout(() => setCopyNotification(''), 2000);
                }
            }, 'image/png');
        } catch (err) { console.error(err); } finally { setStatus('idle'); }
    }, [capturedImages]);

    const startMobileConnection = async () => {
        setIsMobileModalOpen(true);
        setMobileLoading(true);
        try {
            if (isElectron()) {
                const port = customPort ? parseInt(customPort) : undefined;
                const result = await window.electronAPI.startMobileServer(port);
                if (result) {
                    setMobileConnection(result);
                } else {
                    setError("모바일 서버 시작 실패");
                }
            } else {
                const currentUrl = window.location.href;
                const qrCodeDataUrl = await QRCode.toDataURL(currentUrl);

                setMobileConnection({
                    url: currentUrl,
                    token: 'web-session',
                    ip: 'Web Browser',
                    port: parseInt(window.location.port) || (window.location.protocol === 'https:' ? 443 : 80),
                    availableIps: ['Current Browser URL'],
                    qrCode: qrCodeDataUrl
                });
            }
        } catch (e) {
            console.error(e);
            setError("모바일 연결 오류");
        } finally {
            setMobileLoading(false);
        }
    };

    const handleIpChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (!mobileConnection || !isElectron()) return;
        const newIp = e.target.value;
        const port = mobileConnection.port;
        const token = mobileConnection.token;
        const newUrl = `http://${newIp}:${port}?token=${token}`;
        const newQrCode = await window.electronAPI.generateQrCode(newUrl);
        setMobileConnection({ ...mobileConnection, ip: newIp, url: newUrl, qrCode: newQrCode });
    };

    const runSelfTest = async () => {
        if (!mobileConnection) return;
        try {
            const testUrl = `http://127.0.0.1:${mobileConnection.port}/?token=${mobileConnection.token}`;
            const res = await fetch(testUrl);
            if (res.ok) {
                alert("✅ [테스트 성공] 서버가 정상적으로 작동 중입니다!\n\n휴대폰 접속이 안 된다면 'Windows 방화벽'이 원인일 가능성이 높습니다.\n제어판 > 방화벽에서 'Node.js' 앱을 허용해주세요.");
            } else {
                alert(`❌ [테스트 실패] 서버가 응답하지만 오류가 발생했습니다.\nStatus: ${res.status} ${res.statusText}`);
            }
        } catch (e) {
            alert(`❌ [치명적 오류] 서버에 연결할 수 없습니다.\n포트가 이미 사용 중이거나 프로그램이 차단되었습니다.\n\nError: ${e}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col relative" onDragOver={e => e.preventDefault()} onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) {
                Array.from(e.dataTransfer.files).filter((f: any) => f.type.startsWith('image/')).forEach((file: any) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (ev.target?.result) {
                            const recaptureSource = consumePendingRecaptureLineage();
                            const recaptureViewTag = getRecaptureRecommendedView(recaptureSource);
                            setCapturedImages(prev => [...prev, {
                                id: Date.now().toString() + Math.random(),
                                baseImageUrl: ev.target!.result as string,
                                dataUrl: ev.target!.result as string,
                                annotations: [],
                                shapes: [],
                                captureSessionId: activeCaptureSessionIdRef.current,
                                ...(recaptureViewTag ? { captureViewTag: recaptureViewTag } : {}),
                                captureImageKind: recaptureSource ? 'physical_product' : 'unknown',
                                captureSource: 'file',
                                ...(recaptureSource ? { recaptureSource } : {})
                            }]);
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }
        }}>
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*"
                onChange={handleFileUpload}
            />

            {!isOnline && <div className="bg-red-600 text-white text-xs text-center p-1">오프라인 상태입니다. AI 진단 불가.</div>}

            {editingState && <AnnotationCanvas editingImage={editingState} onSave={handleSaveAnnotation} onCancel={() => setEditingState(null)} />}
            {isCameraOpen && (
                <CameraCapture
                    sessionId={activeCaptureSessionId}
                    sessionSummary={activeCaptureSummary}
                    recaptureGuidance={pendingRecaptureGuidance || undefined}
                    onCapture={handleCameraCapture}
                    onNewSession={() => handleNewCaptureSession('camera')}
                    onClose={() => setIsCameraOpen(false)}
                />
            )}
            {isDBViewOpen && <DatabaseView stats={dbStats} onClose={() => setIsDBViewOpen(false)} />}
            <DefectDashboard isOpen={isDashboardOpen} onClose={() => setIsDashboardOpen(false)} />
            <ReportWizard
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                images={selectedImageIds.size > 0 ? capturedImages.filter(i => selectedImageIds.has(i.id)) : capturedImages}
                onGenerate={(layoutId, basicInfo, modifiedImages, isVerified) => handleGenerateReport('pptx', layoutId, basicInfo, modifiedImages, isVerified)}
            />

            <AnalysisModal
                image={modalImage}
                isLoading={isAnalyzing.has(modalImageId ?? '')}
                onClose={() => setModalImageId(null)}
                onTryAgain={() => runDiagnosis(modalImageId!)}
                onTrainAI={handleTrainAI}
                onSubmitVisionBboxReview={handleSubmitVisionBboxReview}
                isAdmin={isAdmin}
            />

            {isSettingsOpen && <SettingsModal initialConfig={apiConfig} onClose={() => setIsSettingsOpen(false)} onSave={setApiConfig} />}

            {/* Login Modal */}
            {showLoginModal && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setShowLoginModal(false)}>
                    <div className="bg-gray-800 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><LockIcon className="w-5 h-5 text-yellow-500" /> 관리자 로그인</h2>
                        <input
                            type="password"
                            placeholder="비밀번호 입력"
                            value={loginPassword}
                            onChange={e => setLoginPassword(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleAdminLogin()}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white mb-2"
                            autoFocus
                        />
                        {loginError && <p className="text-red-400 text-xs mb-4">{loginError}</p>}
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setShowLoginModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">취소</button>
                            <button onClick={handleAdminLogin} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold">로그인</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Connection Modal */}
            {isMobileModalOpen && (
                <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={() => setIsMobileModalOpen(false)}>
                    <div className="bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl border border-gray-700 relative flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setIsMobileModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                        <div className="text-center overflow-y-auto">
                            <div className="w-16 h-16 bg-indigo-900 rounded-full flex items-center justify-center mx-auto mb-4">
                                <WifiIcon className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">모바일 연결</h2>
                            <p className="text-gray-400 text-sm mb-6">아래 QR 코드를 휴대폰 카메라로 스캔하여 연결하세요.</p>

                            {mobileLoading ? (
                                <div className="flex justify-center p-8">
                                    <SpinnerIcon className="w-10 h-10 text-indigo-500" />
                                </div>
                            ) : mobileConnection ? (
                                <>
                                    <div className="mb-4">
                                        <label className="block text-xs text-left text-gray-500 mb-1">
                                            {isElectron() ? '연결 IP 선택 (네트워크 변경 시 사용)' : '연결 소스 (Web Mode)'}
                                        </label>
                                        <select
                                            className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            value={mobileConnection.ip}
                                            onChange={handleIpChange}
                                            disabled={!isElectron()}
                                        >
                                            {mobileConnection.availableIps && mobileConnection.availableIps.map(ip => (
                                                <option key={ip} value={ip}>{ip}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="bg-white p-4 rounded-lg inline-block mx-auto mb-4">
                                        <img
                                            src={mobileConnection.qrCode}
                                            alt="Mobile Connection QR"
                                            className="w-48 h-48"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="text-red-400 bg-red-900/20 p-4 rounded border border-red-800">
                                    서버를 시작할 수 없습니다.
                                </div>
                            )}

                            {mobileConnection && (
                                <div className="text-xs text-gray-500 mt-2 font-mono bg-gray-900 p-2 rounded break-all">
                                    {mobileConnection.url}
                                </div>
                            )}
                            <p className="text-xs text-indigo-400 mt-4">Tip: 휴대폰과 PC가 동일한 Wi-Fi 네트워크에 있어야 합니다.</p>

                            {isElectron() && (
                                <div className="mt-8 pt-6 border-t border-gray-700">
                                    <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center justify-center gap-2">
                                        🛠️ 연결 문제 해결 도구
                                    </h3>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={runSelfTest}
                                            className="w-full bg-gray-700 hover:bg-green-700 text-white text-sm py-2 px-4 rounded transition-colors border border-gray-600"
                                        >
                                            ✅ 서버 자가 진단 (Self Test)
                                        </button>

                                        <div className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                                            <span className="text-xs text-gray-400 whitespace-nowrap pl-1">포트 변경:</span>
                                            <input
                                                type="text"
                                                placeholder="예: 8080"
                                                value={customPort}
                                                onChange={(e) => setCustomPort(e.target.value)}
                                                className="bg-gray-800 text-white text-xs p-1 rounded border border-gray-600 w-20 text-center focus:outline-none focus:border-indigo-500"
                                            />
                                            <button
                                                onClick={startMobileConnection}
                                                className="flex-grow bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1 px-2 rounded"
                                            >
                                                재시작
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-grow p-6 max-w-[1600px] mx-auto w-full flex flex-col">

                {/* Header & Dashboard Info */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-gray-800 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                            <SparklesIcon className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Mold Master AI</h1>
                            <p className="text-gray-400 text-sm">사출 금형 불량 분석 및 대책 시방서 생성 시스템</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <ServerStatusBadge label="Knowledge" status={serverHealth?.rag || 'offline'} />
                                <ServerStatusBadge label="Agent" status={serverHealth?.agent || 'offline'} />
                                <span className="inline-flex items-center rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
                                    Agent Docs {loadedDocs.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {/* 결함 통계 대시보드 버튼 */}
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-lg p-3 flex items-center gap-4 border border-indigo-500 cursor-pointer hover:from-indigo-500 hover:to-purple-600 transition-all shadow-lg" onClick={() => setIsDashboardOpen(true)}>
                            <div className="text-right">
                                <p className="text-xs text-indigo-200 font-medium uppercase tracking-wider">Defect Stats</p>
                                <p className="text-sm font-bold text-white">{dbStats?.defectStats?.total || 0} Records</p>
                            </div>
                            <div className="p-2 bg-indigo-800/50 rounded-full">
                                <span className="text-xl">📊</span>
                            </div>
                        </div>

                        <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-4 border border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors" onClick={() => setIsDBViewOpen(true)}>
                            <div className="text-right">
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Database Tree</p>
                                <p className="text-sm font-bold text-indigo-300">{dbStats ? dbStats.trainingSetCount + dbStats.vectorCount + (dbStats.defectCount || 0) : 0} Records</p>
                            </div>
                            <div className="p-2 bg-gray-700 rounded-full">
                                <span className="text-xl">🗄️</span>
                            </div>
                        </div>

                        <div className="bg-gray-800 rounded-lg p-3 flex items-center gap-4 border border-gray-700">
                            <div className="text-right">
                                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Common Agent Docs</p>
                                <p className="text-sm font-bold text-green-300">{loadedDocs.length} Docs</p>
                            </div>
                            <button onClick={handleUploadKB} disabled={isDocProcessing || !isOnline} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full transition-colors">
                                {isDocProcessing ? <SpinnerIcon className="w-5 h-5" /> : <UploadIcon className="w-5 h-5 text-gray-300" />}
                            </button>
                        </div>

                        <div className="flex items-center gap-3 ml-2">
                            <button
                                onClick={() => isAdmin ? setIsAdmin(false) : setShowLoginModal(true)}
                                className={`p-2 rounded-full transition-colors bg-gray-800 ${isAdmin ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-400 hover:text-white'}`}
                                title={isAdmin ? "관리자 모드 해제" : "관리자 모드 전환"}
                            >
                                {isAdmin ? <UnlockIcon className="w-6 h-6" /> : <LockIcon className="w-6 h-6" />}
                            </button>

                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="p-2 text-gray-400 hover:text-white transition-colors bg-gray-800 rounded-full"
                                aria-label="앱 설정 열기"
                            >
                                <SettingsIcon className="w-6 h-6" />
                            </button>

                        </div>
                    </div>
                </header>

                {/* Action Bar */}
                <div className="bg-gray-800/50 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 border border-gray-700 backdrop-blur-sm">
                    <div className="text-gray-400 text-sm flex items-center gap-2">
                        {status === 'capturing' ? <span className="text-yellow-400 animate-pulse">● 캡처 모드 활성화...</span> :
                            status === 'generating' ? <span className="text-indigo-400 animate-pulse">● 보고서 생성 중...</span> :
                                isBatchProcessing ? <span className="text-purple-400 animate-pulse">● AI 일괄 분석 중 ({isAnalyzing.size}건)...</span> :
                                    isAdmin ? <span className="text-yellow-400 font-bold flex items-center gap-1"><UnlockIcon className="w-4 h-4" /> 관리자 모드 활성화</span> :
                                        <span>Ready ({apiConfig?.shortcut || 'CommandOrControl+Shift+C'})</span>}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={startMobileConnection} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg transition-all border border-gray-600">
                            <QrCodeIcon className="w-5 h-5" /> 모바일 연결
                        </button>
                        <button onClick={() => setIsCameraOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg transition-all border border-gray-600">
                            <CameraIcon className="w-5 h-5" /> 외부 카메라
                        </button>
                        <button onClick={startCapture} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg transition-all">
                            <CameraIcon className="w-5 h-5" /> 화면 캡처
                        </button>
                    </div>
                </div>

                <div className="mb-6 grid gap-3 rounded-xl border border-cyan-900/70 bg-cyan-950/20 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Active Capture Session</span>
                            <span className="rounded-full bg-gray-900 px-2 py-1 font-mono text-[10px] text-gray-400">
                                {activeCaptureSessionId.slice(-12)}
                            </span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                activeCaptureSummary.ready
                                    ? 'bg-emerald-900/70 text-emerald-200'
                                    : 'bg-amber-900/60 text-amber-100'
                            }`}>
                                기본 시점 {activeCaptureSummary.availableViews.length}/2
                            </span>
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                            {activeCaptureSummary.imageCount > 0
                                ? activeCaptureSummary.message
                                : '같은 제품의 전체 사진과 결함 근접 사진을 이 세션에 추가하세요.'}
                        </p>
                        {pendingRecaptureSource && pendingRecaptureGuidance && (
                            <div className="mt-2 rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                                <p className="font-bold">
                                    {pendingRecaptureGuidance.message} · 원본 {pendingRecaptureSource.localImageId || 'local image'}
                                </p>
                                {pendingRecaptureGuidance.instructions[0] && (
                                    <p className="mt-1 text-amber-200/90">{pendingRecaptureGuidance.instructions[0]}</p>
                                )}
                            </div>
                        )}
                    </div>
                    <label className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400">화면 캡처 시점</span>
                        <select
                            value={screenCaptureViewTag}
                            onChange={event => updateScreenCaptureViewTag(event.target.value as CaptureViewTag)}
                            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-100 outline-none focus:border-cyan-500"
                        >
                            {CAPTURE_VIEW_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <button
                        onClick={() => handleNewCaptureSession('workspace')}
                        className="rounded-lg border border-cyan-800 bg-gray-900 px-4 py-2 text-xs font-bold text-cyan-100 hover:border-cyan-500 hover:bg-cyan-950"
                    >
                        새 제품 촬영 시작
                    </button>
                </div>

                {error && <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg mb-6 text-center">{error}</div>}

                {/* Image Grid */}
                <div className="flex-grow">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
                            검사 대기 목록 <span className="bg-gray-700 text-xs px-2 py-0.5 rounded-full text-gray-300">{capturedImages.length}</span>
                        </h2>
                        {capturedImages.length > 0 && (
                            <div className="flex gap-2">
                                <button onClick={() => copyImagesToClipboard(Array.from(selectedImageIds))} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white flex items-center gap-2"><CopyIcon className="w-4 h-4" />선택 복사</button>
                                <button onClick={handleCopyCommonAgentImageIdList} className="px-3 py-1.5 bg-blue-800 hover:bg-blue-700 rounded text-sm text-white flex items-center gap-2"><CopyIcon className="w-4 h-4" />Agent ID 복사</button>
                                <button onClick={handleDownloadCommonAgentImageIdList} className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-sm text-white flex items-center gap-2"><UploadIcon className="w-4 h-4" />Agent ID TXT</button>
                                <button onClick={() => handleGenerateReportClick('pptx')} className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 rounded text-sm text-white flex items-center gap-2"><PptIcon className="w-4 h-4" />PPTX</button>
                                <button onClick={() => handleGenerateReportClick('xlsx')} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-sm text-white flex items-center gap-2"><ExcelIcon className="w-4 h-4" />XLSX</button>

                                {selectedImageIds.size > 0 && (
                                    <button
                                        onClick={handleBatchAnalysis}
                                        disabled={isBatchProcessing}
                                        className={`px-3 py-1.5 rounded text-sm text-white flex items-center gap-2 transition-colors ${isBatchProcessing ? 'bg-purple-800 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500'}`}
                                    >
                                        {isBatchProcessing ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                                        선택 항목 AI 진단
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {capturedImages.length === 0 ? (
                        <div className="border-2 border-dashed border-gray-700 rounded-xl h-64 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <CameraIcon className="w-12 h-12 mb-2 opacity-50" />
                            <p>이미지를 드래그하거나 클릭하여 분석을 시작하세요.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {capturedImages.map((image, index) => {
                                const isSel = selectedImageIds.has(image.id);
                                const isThisAnalyzing = isAnalyzing.has(image.id);
                                const captureAssessment = assessCaptureImageForDiagnosis(image, capturedImages);
                                const captureSummary = summarizeCaptureSession(capturedImages, image.captureSessionId);
                                return (
                                    <div key={image.id}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDrop={handleDropSort}
                                        onDragEnd={handleDragEnd}
                                        className={`relative group bg-gray-800 rounded-xl overflow-hidden shadow-xl border transition-all hover:border-indigo-500 ${isSel ? 'ring-2 ring-indigo-500' : ''} ${isAdmin ? 'border-yellow-500/50' : 'border-gray-700'}`}>

                                        <div className="absolute top-3 left-3 z-20">
                                            <input type="checkbox" checked={isSel} onChange={() => toggleImageSelection(image.id)} className="w-5 h-5 rounded bg-gray-900/80 border-gray-500 checked:bg-indigo-600 cursor-pointer" />
                                        </div>

                                        {isAdmin && (
                                            <div className="absolute top-3 right-3 z-20 pointer-events-none">
                                                <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.8)]"></div>
                                            </div>
                                        )}

                                        <div className="h-48 bg-black flex items-center justify-center overflow-hidden relative">
                                            <img src={image.dataUrl} className="w-full h-full object-contain" alt="" />
                                            <div className="absolute bottom-2 right-2">
                                                {isThisAnalyzing ? (
                                                    <span className="bg-indigo-900/90 text-indigo-100 text-xs font-bold px-2 py-1 rounded border border-indigo-700 shadow-sm flex items-center gap-1">
                                                        <SpinnerIcon className="w-3 h-3" /> 분석 중...
                                                    </span>
                                                ) : image.analysis ? (
                                                    <span className="bg-green-900/90 text-green-100 text-xs font-bold px-2 py-1 rounded border border-green-700 shadow-sm">진단 완료</span>
                                                ) : image.analysisError ? (
                                                    <span className="bg-red-900/90 text-red-100 text-xs font-bold px-2 py-1 rounded border border-red-700">오류</span>
                                                ) : (
                                                    <span className="bg-gray-900/80 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700">미진단</span>
                                                )}
                                            </div>
                                        </div>

                                         <div className="p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h3 className="text-white font-bold text-sm truncate w-32">{image.analysis?.defectType || `Sample #${index + 1}`}</h3>
                                                    <p className="text-xs text-gray-500">{image.analysis?.severity ? `${image.analysis.severity} Severity` : '분석 대기중'}</p>
                                                    {image.analysis?.retrievalSummary && (
                                                        <p className="text-[11px] text-sky-300 mt-1">
                                                            {image.analysis.retrievalSummary.modeUsed} · {image.analysis.retrievalSummary.evidenceCount} evidence
                                                        </p>
                                                    )}
                                                    {image.visionQuality && (
                                                        <p className={`mt-1 text-[11px] ${
                                                            image.visionQuality.status === 'pass'
                                                                ? 'text-emerald-300'
                                                                : image.visionQuality.status === 'warn'
                                                                    ? 'text-amber-300'
                                                                    : 'text-red-300'
                                                        }`}>
                                                            사진 품질 {image.visionQuality.score}점 · {
                                                                image.visionQuality.status === 'pass'
                                                                    ? '적합'
                                                                    : image.visionQuality.status === 'warn'
                                                                        ? '주의'
                                                                        : '재촬영 필요'
                                                            }
                                                        </p>
                                                    )}
                                                    {image.analysis?.visionSummary && (
                                                        <p className={`mt-1 text-[11px] ${
                                                            image.analysis.visionSummary.decisionStatus === 'probable'
                                                                ? 'text-cyan-300'
                                                                : 'text-amber-300'
                                                        }`}>
                                                            비전 후보 {image.analysis.visionSummary.candidates.length}개 · {
                                                                image.analysis.visionSummary.decisionStatus === 'probable'
                                                                    ? '유력'
                                                                    : image.analysis.visionSummary.decisionStatus === 'needs_review'
                                                                        ? '사람 검토 필요'
                                                                        : '판정 보류'
                                                            }
                                                        </p>
                                                    )}
                                                </div>
                                             </div>

                                            {image.visionQuality && image.visionQuality.issues.length > 0 && (
                                                <div className={`mb-3 rounded-lg border px-3 py-2 text-[11px] ${
                                                    image.visionQuality.canAnalyze
                                                        ? 'border-amber-700/50 bg-amber-950/20 text-amber-200'
                                                        : 'border-red-700/60 bg-red-950/30 text-red-200'
                                                }`}>
                                                    {image.visionQuality.issues.map(issue => issue.message).join(' ')}
                                                </div>
                                            )}

                                            <div className={`mb-3 rounded-lg border px-3 py-3 ${
                                                captureAssessment.ready
                                                    ? 'border-emerald-800/70 bg-emerald-950/20'
                                                    : 'border-amber-800/70 bg-amber-950/20'
                                            }`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={`text-[11px] font-bold ${
                                                        captureAssessment.ready ? 'text-emerald-300' : 'text-amber-200'
                                                    }`}>
                                                        {captureAssessment.ready ? '촬영 프로토콜 충족' : '촬영 정보 확인 필요'}
                                                    </span>
                                                    <span className="font-mono text-[9px] text-gray-500" title={image.captureSessionId}>
                                                        {image.captureSessionId?.slice(-10) || '세션 없음'}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[10px] leading-4 text-gray-400">
                                                    {captureAssessment.message}
                                                </p>
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    <label>
                                                        <span className="mb-1 block text-[9px] font-bold text-gray-500">이미지 종류</span>
                                                        <select
                                                            aria-label={`Sample ${index + 1} 이미지 종류`}
                                                            value={image.captureImageKind || 'unknown'}
                                                            onChange={event => updateImageCaptureMetadata(image.id, {
                                                                captureImageKind: event.target.value as CaptureImageKind
                                                            })}
                                                            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-cyan-500"
                                                        >
                                                            <option value="physical_product">실제 성형품</option>
                                                            <option value="document_or_diagram">문서·도면</option>
                                                            <option value="unknown">종류 미지정</option>
                                                        </select>
                                                    </label>
                                                    <label>
                                                        <span className="mb-1 block text-[9px] font-bold text-gray-500">촬영 시점</span>
                                                        <select
                                                            aria-label={`Sample ${index + 1} 촬영 시점`}
                                                            value={image.captureViewTag || ''}
                                                            onChange={event => updateImageCaptureMetadata(image.id, {
                                                                captureViewTag: (event.target.value || undefined) as CaptureViewTag | undefined
                                                            })}
                                                            className="w-full rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-[10px] text-gray-200 outline-none focus:border-cyan-500"
                                                        >
                                                            <option value="">시점 선택</option>
                                                            {CAPTURE_VIEW_OPTIONS.map(option => (
                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                                <p className="mt-2 text-[9px] text-gray-500">
                                                    세션 {captureSummary.imageCount}장 · 확보 시점 {captureSummary.availableViews.length}/2
                                                </p>
                                            </div>

                                            <label className="block mb-3">
                                                <span className="mb-1 block text-[11px] font-bold text-cyan-200">현상 설명</span>
                                                <textarea
                                                    aria-label={`Sample ${index + 1} 현상 설명`}
                                                    value={image.phenomenonDescription || ''}
                                                    onChange={(event) => {
                                                        const phenomenonDescription = event.target.value;
                                                        setCapturedImages(previous => previous.map(item =>
                                                            item.id === image.id
                                                                ? {
                                                                    ...item,
                                                                    phenomenonDescription,
                                                                    analysis: undefined,
                                                                    analysisError: undefined
                                                                }
                                                                : item
                                                        ));
                                                    }}
                                                    rows={2}
                                                    maxLength={1200}
                                                    placeholder="예: 리브 주변 백화, 취출 시 딱 소리, 사출 조건 정상 범위"
                                                    className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-xs text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-cyan-500"
                                                />
                                                <span className="mt-1 block text-[10px] text-gray-500">
                                                    사진, ROI, 주석과 함께 Common Agent Graph 진단에 사용됩니다.
                                                </span>
                                            </label>

                                             <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={() => handleAnalyzeClick(image.id)}
                                                    disabled={isThisAnalyzing || (!captureAssessment.ready && !image.analysis)}
                                                    className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${image.analysis ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                                >
                                                    {isThisAnalyzing ? <SpinnerIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />}
                                                    {isThisAnalyzing ? '분석 중' : (image.analysis ? '결과 보기' : (image.shapes && image.shapes.length > 0 ? 'ROI 진단' : 'AI 진단'))}
                                                </button>
                                                <button onClick={() => setEditingState({
                                                    id: image.id,
                                                    baseImageUrl: image.baseImageUrl,
                                                    annotations: image.annotations,
                                                    shapes: image.shapes,
                                                    captureSessionId: image.captureSessionId,
                                                    captureViewTag: image.captureViewTag,
                                                    captureImageKind: image.captureImageKind,
                                                    captureSource: image.captureSource
                                                })} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300" title="편집">
                                                    <EditIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => { setCapturedImages(prev => prev.filter(i => i.id !== image.id)); setSelectedImageIds(p => { const n = new Set(p); n.delete(image.id); return n; }) }} className="p-2 bg-gray-700 hover:bg-red-900/50 hover:text-red-400 rounded-lg text-gray-300" title="삭제">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* RAG 기능 버튼 */}
                                            <div className="mt-2">
                                                <button
                                                    onClick={() => handleGraphAnalyzeClick(image.id)}
                                                    disabled={isThisAnalyzing || !captureAssessment.ready}
                                                    className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors bg-sky-700 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Graph 경로 기반 추론"
                                                >
                                                    <SparklesIcon className="w-4 h-4" />
                                                    Graph 추론
                                                </button>
                                            </div>
                                            <div className="mt-2">
                                                <button
                                                    onClick={() => handleCommonAgentSync(image.id)}
                                                    disabled={isThisAnalyzing || serverHealth?.agent === 'offline' || !captureAssessment.ready}
                                                    className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Common Agent 이미지 진단 및 ROI 주석 동기화"
                                                >
                                                    {isThisAnalyzing ? <SpinnerIcon className="w-4 h-4" /> : <BotIcon className="w-4 h-4" />}
                                                    {image.commonAgentStatus === 'synced' ? 'Agent 동기화 완료' : 'Agent 동기화'}
                                                </button>
                                                {image.commonAgentImageId && (
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <p className="min-w-0 flex-1 text-[11px] text-blue-300 truncate" title={image.commonAgentImageId}>
                                                            {image.commonAgentImageId} · ROI {image.commonAgentAnnotationCount || 0}
                                                        </p>
                                                        <button
                                                            onClick={() => handleCopyCommonAgentImageId(image.id)}
                                                            className="shrink-0 rounded bg-blue-900/70 px-2 py-1 text-[11px] font-bold text-blue-100 hover:bg-blue-800"
                                                            title="Common Agent image_id 복사"
                                                        >
                                                            ID 복사
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Add New Image Card */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-gray-800/50 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-indigo-500 transition-all min-h-[300px]"
                            >
                                <CameraIcon className="w-10 h-10 text-gray-500 mb-2" />
                                <span className="text-gray-400 text-sm font-medium">이미지 추가</span>
                            </div>
                        </div>
                    )}
                </div>

                {copyNotification && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-green-600 text-white px-6 py-2 rounded-full shadow-lg z-50">{copyNotification}</div>}
                <footer className="mt-12 text-center text-gray-500 text-xs pb-6 border-t border-gray-800 pt-4">
                    <p>&copy; 2026 Mold Master AI. All rights reserved.</p>
                    <p className="mt-1">2026 Mold Master AI 모든 권리는 Atechsolution AXDX Team에 있습니다. 개발자 Jeong HJ</p>
                </footer>
            </div>

            {isChatbotOpen && <Chatbot onClose={() => setIsChatbotOpen(false)} isOnline={isOnline} />}
            <button
                onClick={() => setIsChatbotOpen(!isChatbotOpen)}
                className="fixed bottom-6 right-6 bg-indigo-600 p-4 rounded-full shadow-xl hover:bg-indigo-500 transition-transform hover:scale-105 z-40"
                aria-label={isChatbotOpen ? 'AI 어시스턴트 닫기' : 'AI 어시스턴트 열기'}
            >
                <ChatIcon className="w-6 h-6 text-white" />
            </button>
        </div>
    );
};

export default App;
