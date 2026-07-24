import { CapturedImage, Shape } from '../types';
import { CAPTURE_VIEW_OPTIONS, CaptureMetadata } from '../captureSessionProtocol';

const MAX_FIELD_TEXT = 1200;
const MAX_OCR_TEXT = 800;
const MAX_ANNOTATION_TEXT = 500;
const MAX_ROI_ITEMS = 12;

export const CANONICAL_DEFECT_TAXONOMY = [
    '백화',
    '플래시(버/바리)',
    '미성형(Short Shot)',
    '흑점/탄화',
    '싱크마크',
    '웰드라인',
    '은줄',
    '기포',
    '변형/휨',
    '박리',
    '흐름 자국',
    '제팅',
    '게이트 자국',
    '밀핀 자국',
    '스크래치/패임',
    '크랙',
    '이형 불량',
    '치수 불량'
] as const;

const VISUAL_DISCRIMINATION_GUIDE = [
    '밀핀 자국: 밀핀 위치와 일치하는 원형 또는 원호형 경계, 원형 압흔·돌출·백화',
    '스크래치/패임: 금형 기능 형상과 무관한 선형·불규칙 마찰 흔적 또는 재료 손실',
    '플래시(버/바리): 파팅라인·인서트 경계 밖으로 이어지는 얇은 잉여 수지',
    '백화: 리브·코너·취출부 주변의 응력성 유백색 또는 흐린 변색'
].join('; ');

const compact = (value?: string, maxLength = MAX_FIELD_TEXT): string =>
    (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);

const summarizeShape = (shape: Shape, index: number): string => {
    const xs = shape.points.map(point => point.x);
    const ys = shape.points.map(point => point.y);
    if (xs.length === 0 || ys.length === 0) return `${index + 1}. ${shape.tool}`;

    const left = Math.round(Math.min(...xs));
    const top = Math.round(Math.min(...ys));
    const right = Math.round(Math.max(...xs));
    const bottom = Math.round(Math.max(...ys));
    const label = compact(shape.text, 80);
    return `${index + 1}. ${shape.tool} (${left},${top})-(${right},${bottom})${label ? `: ${label}` : ''}`;
};

export interface MultimodalDiagnosisContext {
    question: string;
    metadata: {
        context_provided: boolean;
        phenomenon_description_length: number;
        annotation_count: number;
        roi_count: number;
        ocr_provided: boolean;
        capture_session_id?: string;
        capture_view_tags?: string[];
        vision_image_kind?: string;
        capture_source?: string;
        capture_protocol_ready?: boolean;
        capture_available_views?: string[];
        capture_missing_views?: string[];
    };
}

export const buildMultimodalDiagnosisContext = (
    image: Pick<CapturedImage, 'phenomenonDescription' | 'ocrText' | 'annotations' | 'shapes'>,
    captureMetadata?: CaptureMetadata
): MultimodalDiagnosisContext => {
    const phenomenon = compact(image.phenomenonDescription);
    const ocrText = compact(image.ocrText, MAX_OCR_TEXT);
    const annotations = image.annotations
        .map(annotation => compact(annotation.text, 160))
        .filter(Boolean);
    const annotationText = compact(annotations.join(' / '), MAX_ANNOTATION_TEXT);
    const roiSummary = (image.shapes || [])
        .slice(0, MAX_ROI_ITEMS)
        .map(summarizeShape)
        .join('\n');
    const captureViewLabels = new Map(
        CAPTURE_VIEW_OPTIONS.map(option => [option.value, option.label])
    );
    const currentViewLabels = (captureMetadata?.capture_view_tags || [])
        .map(view => captureViewLabels.get(view) || view);
    const availableViewLabels = (captureMetadata?.capture_available_views || [])
        .map(view => captureViewLabels.get(view) || view);
    const captureSummary = captureMetadata?.capture_session_id
        ? [
            `촬영 세션: ${captureMetadata.capture_session_id}`,
            `현재 이미지 시점: ${currentViewLabels.join(', ') || '미지정'}`,
            `세션 확보 시점: ${availableViewLabels.join(', ') || '없음'}`,
            `기본 촬영 프로토콜: ${captureMetadata.capture_protocol_ready ? '충족' : '미충족'}`
        ].join('\n')
        : '';

    const evidenceSections = [
        phenomenon ? `현장 현상 설명:\n${phenomenon}` : '',
        annotationText ? `이미지 주석:\n${annotationText}` : '',
        ocrText ? `이미지 OCR 텍스트:\n${ocrText}` : '',
        roiSummary ? `사용자 지정 ROI:\n${roiSummary}` : '',
        captureSummary ? `촬영 프로토콜:\n${captureSummary}` : ''
    ].filter(Boolean);

    const question = [
        '사출성형 품질 문제를 멀티모달로 진단해 주세요.',
        '이미지를 1차 관찰 근거로 사용하고 아래 현장 정보는 보조 근거로 교차 검증하세요.',
        ...evidenceSections,
        '요구사항:',
        `- 불량명은 다음 표준 taxonomy에서 선택하세요: ${CANONICAL_DEFECT_TAXONOMY.join(', ')}.`,
        `- 혼동하기 쉬운 형상은 다음 기준으로 구분하세요: ${VISUAL_DISCRIMINATION_GUIDE}.`,
        '- ROI 안에 여러 흔적이 있으면 금형 기능 형상과 직접 연관된 지배 결함을 우선 분류하세요.',
        '- 영상 근거로 표준 불량을 구분할 수 없으면 "판정 불가"로 답하고 필요한 추가 촬영 조건을 제시하세요.',
        '- 관찰된 사실과 추론을 구분하고, 판별 불가능한 내용은 추측하지 마세요.',
        '- 가장 가능성 높은 불량명, 발생 위치와 외관, 원인 후보, 확인 항목을 제시하세요.',
        '- 원인과 대책은 승인된 Graph DB 근거를 우선 사용하고 부족한 부분만 LLM 지식으로 보조하세요.',
        '- 시방서에 바로 사용할 수 있도록 문제점은 관찰 사실 1문장, 원인과 대책은 각각 핵심 3개 이내로 간결하게 작성하세요.',
        '- 추론 과정, Graph 경로, 검색 과정, 근거 설명과 중복 문장은 문제점·원인·대책 본문에 포함하지 마세요.'
    ].join('\n\n');

    return {
        question,
        metadata: {
            context_provided: evidenceSections.length > 0,
            phenomenon_description_length: phenomenon.length,
            annotation_count: annotations.length,
            roi_count: image.shapes?.length || 0,
            ocr_provided: Boolean(ocrText),
            ...captureMetadata
        }
    };
};
