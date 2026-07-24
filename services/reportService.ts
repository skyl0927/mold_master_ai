import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { CapturedImage } from '../types';

const getFormattedDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Design Constants
const BRAND_BLUE = "0F4C81";
const BRAND_RED = "ED1C24";
const FONT_FACE = "Malgun Gothic";
const TABLE_HEADER_BG = "E6F0FF"; // 연한 파랑
const TABLE_BORDER_COLOR = "0F4C81";
const TEXT_COLOR = "000000";

// ReportWizard와 동일한 구조
export interface ReportItem {
  id: string;
  images: CapturedImage[];
  analysis: {
    problem: string;
    cause?: string;
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

interface ReportLayout {
  id: string;
  elements: any[];
  perSlideItems: number;
  fields?: any[];
}

export const generatePptxReport = async (items: ReportItem[] | CapturedImage[], layout?: ReportLayout, basicInfo?: any, isVerified: boolean = false): Promise<void> => {
  const pptx = new PptxGenJS();

  // A4 Landscape Layout 정의 (300mm x 190mm)
  pptx.defineLayout({ name: 'A4_LANDSCAPE', width: 11.81, height: 7.48 });
  // Feasibility Report Layout (사용자 정의 크기)
  pptx.defineLayout({ name: 'FEASIBILITY', width: 10.83, height: 7.50 });

  pptx.layout = 'A4_LANDSCAPE';

  // 디자인 상수
  // const FONT_FACE = "Malgun Gothic"; // 전역 상수로 이동됨
  const HEADER_FILL = { color: "E2F0D9" }; // 연한 녹색
  const HEADER_COLOR = "000000";
  const BORDER_COLOR = "000000";
  const TITLE_BAR_COLOR = "0F4C81"; // 진한 파랑
  const BOTTOM_BAR_RED = "ED1C24";

  // 호환성 처리: items가 CapturedImage[]인 경우
  let reportItems: ReportItem[] = [];
  if (items.length > 0 && 'dataUrl' in items[0]) {
    reportItems = (items as CapturedImage[]).map((img, idx) => ({
      id: `legacy-${idx}`,
      images: [img],
      analysis: {
        problem: img.analysis?.description || img.analysis?.possibleCauses || '',
        countermeasures: img.analysis?.countermeasures || ''
      }
    }));
  } else {
    reportItems = items as ReportItem[];
  }

  // --- [New] 품질 승인 시 DB에 저장 ---
  if (isVerified) {
    for (const item of reportItems) {
      if (item.images.length === 0) continue;
      const mainImg = item.images[0];
      const analysisData = {
        defectType: mainImg.analysis?.defectType || item.analysis.problem || 'Verified Review Artifact',
        severity: mainImg.analysis?.severity || 'Medium',
        description: item.analysis.problem,
        possibleCauses: item.analysis.cause || '',
        countermeasures: item.analysis.countermeasures,
        rawOutput: mainImg.analysis?.rawOutput || ''
      };
      await window.electronAPI.saveUserFeedback(
        analysisData,
        mainImg.id,
        'approved',
        true,
        mainImg.dataUrl,
        { knowledgeScope: mainImg.analysis?.defectType ? 'diagnostic' : 'review_event' }
      );
    }
  }

  // Legacy direct-RAG synchronization is intentionally disabled. Common Agent owns remote persistence.
  if (false && isVerified) {
    try {
      console.log("Saving verified defects to DB...");
      for (const item of reportItems) {
        // 이미지가 여러 개일 경우 첫 번째 이미지를 대표로 저장하거나, 모든 이미지에 대해 저장
        // 여기서는 편의상 첫 번째 분석 내용이 유효하다고 가정
        if (item.images.length > 0) {
          const mainImg = item.images[0];
          const derivedDefectType = mainImg.analysis?.defectType || item.analysis.problem || 'Verified Review Artifact';
          const knowledgeScope = mainImg.analysis?.defectType ? 'diagnostic' : 'review_event';
          // 분석 내용을 DefectAnalysis 형태로 변환
          const analysisData = {
            defectType: derivedDefectType,
            severity: 'Medium',
            description: item.analysis.problem,
            possibleCauses: item.analysis.cause || '',
            countermeasures: item.analysis.countermeasures,
            rawOutput: ''
          };
          console.log(`[reportService] Saving verified result. MainImgID: ${mainImg.id}, Analysis:`, analysisData);

          // 1. Local DB 저장
          const result: any = await window.electronAPI.saveUserFeedback(
            analysisData,
            mainImg.id,
            'approved', // Status
            true,       // isVerified
            mainImg.dataUrl, // [Fix] 이미지 파일 저장을 위해 dataUrl 전달
            { knowledgeScope }
          );
          console.log(`[reportService] saveUserFeedback result:`, result);

          if (result && result.success && result.id) {
            alert(`✅ 검증된 데이터가 로컬 큐레이션 DB에 저장되었습니다.\n(ID: ${result.id})`);
          } else {
            console.warn("⚠️ saveUserFeedback result invalid:", result);
          }
        }
      }
      console.log("Verified defects processed.");
    } catch (e) {
      console.error("Failed to save/send verified defects:", e);
      alert("데이터 저장/전송 중 예외가 발생했습니다. 개발자 도구의 콘솔을 확인해주세요.");
    }
  }

  if (layout?.id === 'mold_spec') {
    // === 금형개조용접시방서 (A4 가로, 300x190) ===

    // --- 1페이지: 표지 및 첫번째 항목 ---
    if (reportItems.length > 0) {
      const slide1 = pptx.addSlide();
      renderBackground(slide1, pptx);

      // 헤더(기본정보) 그리기 (Y: 0.3 ~)
      renderHeaderTable(slide1, basicInfo);

      // 첫 번째 항목 배치 (Y: 2.3 ~), 사용 가능 높이: 7.2 - 2.3 = 4.9
      renderItem(slide1, pptx, reportItems[0], 1, 2.3, 4.9);

      // 페이지 번호
      slide1.addText("1", { x: 11.2, y: 7.2, fontSize: 10, align: 'right', color: TEXT_COLOR, fontFace: FONT_FACE });
    }

    // --- 2페이지부터: 동적 배치 (텍스트 양에 따라 1~2개/페이지) ---
    const remainingItems = reportItems.slice(1);
    const PAGE_H = 7.2;       // 페이지 유효 높이 (인치)
    const TITLE_Y = 0.35;
    const TITLE_H = 0.45;
    const CONTENT_START_Y = TITLE_Y + TITLE_H; // 0.8
    const GAP_BETWEEN_ITEMS = 0.3;
    const MIN_ITEM_H = 2.0;   // 한 항목의 최소 높이 (테이블 0.8 + 이미지 0.5 + gap)

    let pageIdx = 0;
    let itemIdx = 0;

    while (itemIdx < remainingItems.length) {
      const slide = pptx.addSlide();
      renderBackground(slide, pptx);
      const pageNum = pageIdx + 2;

      // 타이틀 (간소화)
      slide.addText("금형개조용접시방서 (계속)", { x: 0.2, y: TITLE_Y, w: 4.0, h: 0.4, fontSize: 18, bold: true, color: BRAND_BLUE, fontFace: FONT_FACE });

      // 상단 항목 배치
      const availH_first = PAGE_H - CONTENT_START_Y;
      const result1 = renderItem(slide, pptx, remainingItems[itemIdx], itemIdx + 2, CONTENT_START_Y, availH_first);
      itemIdx++;

      // 하단 항목: 남은 공간이 충분한 경우에만 배치
      if (itemIdx < remainingItems.length) {
        const nextY = CONTENT_START_Y + result1.totalHeight + GAP_BETWEEN_ITEMS;
        const remainingH = PAGE_H - nextY;

        if (remainingH >= MIN_ITEM_H) {
          // 충분한 공간 → 같은 페이지에 2번째 항목 배치
          renderItem(slide, pptx, remainingItems[itemIdx], itemIdx + 2, nextY, remainingH);
          itemIdx++;
        }
        // 공간 부족 → 2번째 항목은 다음 페이지로 (itemIdx 증가 안 함)
      }

      // 페이지 번호
      slide.addText(`${pageNum}`, { x: 11.2, y: 7.2, fontSize: 10, align: 'right', color: TEXT_COLOR, fontFace: FONT_FACE });
      pageIdx++;
    }

  } else if (layout?.id === 'feasibility_report') {
    // === 제품 모델링 및 사출 금형 검토서 (16:9, A4 유사) ===
    pptx.layout = 'FEASIBILITY';

    // --- 표지 슬라이드 ---
    const coverSlide = pptx.addSlide();
    renderFeasibilityCover(coverSlide, pptx, basicInfo);

    // --- 각 아이템별 슬라이드 ---
    reportItems.forEach((item, index) => {
      const slide = pptx.addSlide();
      renderFeasibilityItem(slide, pptx, item, index, basicInfo);
    });

  } else if (layout?.id === 'grid_2x2') {
    // === 4분할 그리드 (16:9) ===
    pptx.layout = 'LAYOUT_16x9';

    // 4개씩 그룹화하여 2x2 그리드로 배치
    for (let i = 0; i < reportItems.length; i += 4) {
      const slide = pptx.addSlide();
      const batch = reportItems.slice(i, i + 4);

      // 2x2 그리드 좌표 (layouts.js 참조)
      const positions = [
        { x: 0.25, y: 0.25 },   // Top-Left
        { x: 5.125, y: 0.25 },  // Top-Right
        { x: 0.25, y: 2.9375 }, // Bottom-Left
        { x: 5.125, y: 2.9375 } // Bottom-Right
      ];

      batch.forEach((item, idx) => {
        if (item.images && item.images[0]) {
          const pos = positions[idx];
          slide.addImage({
            data: item.images[0].dataUrl,
            x: pos.x,
            y: pos.y,
            w: 4.625,
            h: 2.4375,
            sizing: { type: 'contain', w: 4.625, h: 2.4375 }
          });
        }
      });

      // 페이지 번호
      const pageNum = Math.floor(i / 4) + 1;
      slide.addText(`${pageNum}`, { x: 9.0, y: 5.2, fontSize: 10, align: 'right', color: '666666', fontFace: FONT_FACE });
    }

  } else if (layout?.id === 'detail_1') {
    // === 상세 분석 보고서 (16:9, 1장/1건) ===
    pptx.layout = 'LAYOUT_16x9';

    reportItems.forEach((item, index) => {
      const slide = pptx.addSlide();

      // 타이틀
      slide.addText("불량 분석 보고서", {
        x: 0.5, y: 0.2, w: 9.0, h: 0.5,
        fontSize: 24, bold: true, color: '363636', fontFace: FONT_FACE
      });

      // 좌측: 이미지
      if (item.images && item.images[0]) {
        slide.addImage({
          data: item.images[0].dataUrl,
          x: 0.5,
          y: 1.0,
          w: 5.0,
          h: 3.75,
          sizing: { type: 'contain', w: 5.0, h: 3.75 }
        });
      }

      // 우측: 정보 박스 배경
      slide.addShape(pptx.ShapeType.rect, {
        x: 5.8, y: 1.0, w: 4.0, h: 3.75,
        fill: { color: 'F5F5F5' },
        line: { color: 'CCCCCC', width: 1 }
      });

      // 불량 유형
      slide.addText(`불량 유형: ${item.analysis?.problem?.split('\\n')[0] || item.analysis?.cause || '미분류'}`, {
        x: 6.0, y: 1.2, w: 3.6, h: 0.3,
        fontSize: 14, bold: true, color: '000000', fontFace: FONT_FACE
      });

      // 심각도 (분석 데이터에 없으면 기본값)
      slide.addText(`심각도: Medium`, {
        x: 6.0, y: 1.6, w: 3.6, h: 0.3,
        fontSize: 14, color: '000000', fontFace: FONT_FACE
      });

      // 발생 원인
      const causes = (item.analysis?.problem || item.analysis?.cause || '분석 중').replace(/\\\\n/g, '\n');
      slide.addText(`발생 원인:\n${causes}`, {
        x: 6.0, y: 2.1, w: 3.6, h: 0.8,
        fontSize: 11, color: '333333', valign: 'top', fontFace: FONT_FACE
      });

      // 대책
      const countermeasures = (item.analysis?.countermeasures || '검토 중').replace(/\\\\n/g, '\n');
      slide.addText(`대책:\n${countermeasures}`, {
        x: 6.0, y: 3.1, w: 3.6, h: 1.0,
        fontSize: 11, color: '0055FF', valign: 'top', fontFace: FONT_FACE
      });

      // 페이지 번호
      slide.addText(`${index + 1}`, { x: 9.0, y: 5.2, fontSize: 10, align: 'right', color: '666666', fontFace: FONT_FACE });
    });

  } else {
    // === Fallback: 알 수 없는 레이아웃은 grid_2x2 방식으로 처리 ===
    pptx.layout = 'LAYOUT_16x9';

    for (let i = 0; i < reportItems.length; i += 4) {
      const slide = pptx.addSlide();
      const batch = reportItems.slice(i, i + 4);

      const positions = [
        { x: 0.25, y: 0.25 }, { x: 5.125, y: 0.25 },
        { x: 0.25, y: 2.9375 }, { x: 5.125, y: 2.9375 }
      ];

      batch.forEach((item, idx) => {
        if (item.images && item.images[0]) {
          const pos = positions[idx];
          slide.addImage({
            data: item.images[0].dataUrl,
            x: pos.x, y: pos.y, w: 4.625, h: 2.4375,
            sizing: { type: 'contain', w: 4.625, h: 2.4375 }
          });
        }
      });
    }
  }

  await pptx.writeFile({ fileName: `Report-${getFormattedDate()}.pptx` });
};

// --- Helper Functions ---

function renderBackground(slide: PptxGenJS.Slide, pptx: PptxGenJS) {
  // Top Bar (Blue & Red strip)
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 11.81, h: 0.15, fill: { color: BRAND_BLUE } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.15, w: 11.81, h: 0.05, fill: { color: BRAND_RED } });

  // Bottom Bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.3, w: 11.81, h: 0.18, fill: { color: BRAND_BLUE } });
  slide.addShape(pptx.ShapeType.rect, { x: 8.0, y: 7.3, w: 3.81, h: 0.18, fill: { color: BRAND_RED } }); // Accent

  // Logo (Text substitute)
  slide.addText("A-TECH SOLUTION", { x: 9.6, y: 0.25, w: 2.0, h: 0.4, fontSize: 14, align: 'right', color: BRAND_BLUE, bold: true, fontFace: FONT_FACE });
}

function renderHeaderTable(slide: PptxGenJS.Slide, basicInfo: any) {
  // Main Title
  slide.addText("금형개조용접시방서", { x: 0.2, y: 0.35, w: 4.0, h: 0.5, fontSize: 24, bold: true, color: TEXT_COLOR, underline: { style: 'sng', color: TEXT_COLOR }, fontFace: FONT_FACE });

  // Table Options
  const headerOpts: any = { fill: { color: TABLE_HEADER_BG }, bold: true, align: 'center', valign: 'middle', border: { pt: 1, color: TABLE_BORDER_COLOR }, fontSize: 10, color: TEXT_COLOR, fontFace: FONT_FACE };
  const valOpts: any = { align: 'center', valign: 'middle', border: { pt: 1, color: TABLE_BORDER_COLOR }, fontSize: 10, color: TEXT_COLOR, fontFace: FONT_FACE };

  // Header Table (Width: 11.41)
  const headerRows = [
    [
      { text: "작업번호", options: headerOpts }, { text: basicInfo?.jobNo || "", options: valOpts },
      { text: "작성자", options: headerOpts }, { text: basicInfo?.author || "", options: valOpts },
      { text: "작성일", options: headerOpts }, { text: basicInfo?.writeDate || "", options: valOpts }
    ],
    [
      { text: "고객사", options: headerOpts }, { text: basicInfo?.customer || "", options: valOpts },
      { text: "조립자", options: headerOpts }, { text: basicInfo?.assembler || "", options: valOpts },
      { text: "제작처", options: headerOpts }, { text: basicInfo?.maker || "", options: valOpts }
    ],
    [
      { text: "모델", options: headerOpts }, { text: basicInfo?.model || "", options: valOpts },
      { text: "TRY단계", options: headerOpts }, { text: basicInfo?.tryStep || "", options: valOpts },
      { text: "사출처", options: headerOpts }, { text: basicInfo?.injector || "", options: valOpts }
    ],
    [
      { text: "품 명", options: headerOpts }, { text: basicInfo?.partName || "", options: valOpts },
      { text: "요청일정", options: headerOpts }, { text: basicInfo?.reqDate || "", options: valOpts },
      { text: "양산처", options: headerOpts }, { text: basicInfo?.massProd || "", options: valOpts }
    ]
  ];

  slide.addTable(headerRows, {
    x: 0.2, y: 0.95, w: 11.41,
    colW: [1.2, 2.6, 1.2, 2.6, 1.2, 2.61],
    rowH: 0.3,
    align: "center"
  });
}

/**
 * 텍스트 높이 추정: 한글 기준 컬럼 폭과 폰트 크기로 줄 수 계산
 * @returns 추정 높이 (인치)
 */
function estimateTextHeight(text: string, colWidthInch: number, fontSize: number = 10): number {
  if (!text || text === '-') return 0.3;
  const charsPerLine = Math.floor(colWidthInch * 7.5 * (10 / fontSize)); // 한글 기준
  const lines = text.split('\n').reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil((line.length || 1) / Math.max(1, charsPerLine)));
  }, 0);
  const lineHeight = 0.2; // 인치/줄
  return Math.max(0.4, lines * lineHeight + 0.15); // 패딩 포함, 최소 0.4
}

function renderItem(slide: PptxGenJS.Slide, pptx: PptxGenJS, item: ReportItem, index: number, startY: number, availableHeight?: number): { totalHeight: number } {
  // 1. Defect Info Table
  const headOpts: any = { fill: { color: TABLE_HEADER_BG }, bold: true, align: 'center', valign: 'middle', border: { pt: 1, color: TABLE_BORDER_COLOR }, fontSize: 11, color: TEXT_COLOR, fontFace: FONT_FACE };
  const bodyOpts: any = { align: 'left', valign: 'top', fontFace: FONT_FACE, fontSize: 10, border: { pt: 1, color: TABLE_BORDER_COLOR }, color: TEXT_COLOR };
  const centerOpts: any = { ...bodyOpts, align: 'center', valign: 'middle' };

  // 텍스트 내용 준비
  const problemText = (item.analysis.problem || "-").replace(/\\\\n/g, '\n');
  const causeText = (item.analysis.cause || "-").replace(/\\\\n/g, '\n');
  const counterText = (item.analysis.countermeasures || "-").replace(/\\\\n/g, '\n');

  // 동적 테이블 높이 계산: 가장 긴 컬럼 기준
  const colWidths = [0.6, 1.3, 3.5, 3.0, 2.91];
  const headerH = 0.4;
  const problemH = estimateTextHeight(problemText, colWidths[2]);
  const causeH = estimateTextHeight(causeText, colWidths[3]);
  const counterH = estimateTextHeight(counterText, colWidths[4]);
  const bodyRowH = Math.min(2.5, Math.max(problemH, causeH, counterH)); // 최대 2.5인치로 제한

  // Table Header & Body
  const tableRows: any[] = [
    [
      { text: "항목", options: { ...headOpts, w: 0.6 } },
      { text: "품명/품번", options: { ...headOpts, w: 1.3 } },
      { text: "문제점", options: { ...headOpts, w: 3.5 } },
      { text: "원인", options: { ...headOpts, w: 3.0 } },
      { text: "대책수립", options: { ...headOpts, w: 2.91 } }
    ],
    [
      { text: index.toString(), options: centerOpts },
      { text: "", options: centerOpts },
      { text: problemText, options: bodyOpts },
      { text: causeText, options: bodyOpts },
      { text: counterText, options: bodyOpts }
    ]
  ];

  slide.addTable(tableRows, {
    x: 0.2, y: startY, w: 11.41,
    rowH: [headerH, bodyRowH],
    colW: colWidths
  });

  // 2. Images: 테이블 하단에 동적 배치
  const tableBottom = startY + headerH + bodyRowH;
  const imgGap = 0.15; // 테이블과 이미지 사이 간격
  const imgY = tableBottom + imgGap;

  // 사용 가능한 이미지 영역 높이 계산
  const pageBottom = availableHeight ? (startY + availableHeight) : 7.2; // 페이지 하단 여백
  const maxImgH = Math.max(0.5, pageBottom - imgY - 0.1); // 하단 여백 0.1

  // 기본 이미지 크기 (7.45cm x 4.66cm = 2.93in x 1.83in)
  const baseImgW = 2.93;
  const baseImgH = 1.83;

  // 이미지 크기: 사용 가능한 높이에 맞춰 축소 (비율 유지)
  const imgH = Math.min(baseImgH, maxImgH);
  const scale = imgH / baseImgH;
  const imgW = baseImgW * scale;

  // 중앙 정렬
  const gap = 0.5 * scale;
  const totalImgWidth = (imgW * 2) + gap;
  const imgStartX = (11.81 - totalImgWidth) / 2;

  if (imgH >= 0.5) { // 최소 0.5인치일 때만 이미지 표시
    item.images.forEach((img, idx) => {
      if (idx < 2) {
        const x = imgStartX + (idx * (imgW + gap));

        // Image Container
        slide.addShape(pptx.ShapeType.rect, { x: x, y: imgY, w: imgW, h: imgH, line: { color: 'E0E0E0', width: 1 }, fill: { color: 'FFFFFF' } });

        // Image with Contain
        slide.addImage({
          data: img.dataUrl,
          x: x, y: imgY, w: imgW, h: imgH,
          sizing: { type: 'contain', w: imgW, h: imgH }
        });

        // 번호 마커
        slide.addText(`(${idx + 1})`, { x: x + 0.1, y: imgY + 0.1, w: 0.3, h: 0.3, fontSize: 12, color: 'FF0000', bold: true });
      }
    });
  }

  // 총 사용 높이 반환
  const totalHeight = (headerH + bodyRowH + imgGap + (imgH >= 0.5 ? imgH : 0));
  return { totalHeight };
}

// --- Feasibility Report 헬퍼 함수 ---

// 디자인 상수 (스코프 문제 해결을 위해 재정의하거나 위에서 정의한 것 사용)
// const FONT_FACE = "Malgun Gothic"; // 전역 상수 사용
const HEADER_FILL = { color: "E2F0D9" };
const HEADER_COLOR = "000000";
const BORDER_COLOR = "000000";
const TITLE_BAR_COLOR = "0F4C81";
const BOTTOM_BAR_RED = "ED1C24";

function renderFeasibilityCover(slide: PptxGenJS.Slide, pptx: PptxGenJS, basicInfo: any) {
  // 1. 상단 파란색 바 (이미지 참고: 상단 전체를 덮는 느낌보다는 헤더 바)
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 1.5,
    fill: { color: TITLE_BAR_COLOR }
  });

  // 2. 제목 (파란 바 위에 흰색 글씨로 가정하거나, 아래에 배치)
  // 이미지 2를 보면 파란 배경에 흰색 글씨일 가능성이 높음
  slide.addText(`품명 : ${basicInfo.modelName || ''} ${basicInfo.partName || ''}`, {
    x: 0.5, y: 0.3, w: 9.0, h: 0.5,
    fontSize: 20, bold: true, color: 'FFFFFF', fontFace: FONT_FACE
  });

  slide.addText("제품 모델링 및 사출 금형 검토서", {
    x: 0.5, y: 0.8, w: 9.0, h: 0.6,
    fontSize: 28, bold: true, color: 'FFFFFF', fontFace: FONT_FACE
  });

  // 3. 우측 상단 결재란 (이미지 대신 테이블로 구현)
  const historyRows: any[] = [
    [
      { text: "작성", options: { fill: HEADER_FILL, fontSize: 9, bold: true, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: "작성일", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 10, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: "검토내용", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 10, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } }
    ],
    [
      { text: "1", options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.reviewDate || '', options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.reviewContent || '', options: { fontSize: 9, align: 'left', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } }
    ],
    [{ text: "2", options: { fontSize: 9, border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }],
    [{ text: "3", options: { fontSize: 9, border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }],
    [{ text: "4", options: { fontSize: 9, border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }, { text: "", options: { border: { color: BORDER_COLOR, pt: 1 } } }]
  ];

  slide.addTable(historyRows, {
    x: 6.0, y: 2.0, w: 4.5, h: 2.0,
    colW: [0.5, 1.0, 3.0]
  });

  // 4. 하단 로고 (중앙)
  slide.addText("에이테크 솔루션㈜\n금 형 개 발 팀", {
    x: 3.4, y: 6.0, w: 4.0, h: 1.0,
    fontSize: 20, bold: true, color: '333333', align: 'center', valign: 'middle', fontFace: FONT_FACE
  });

  // 5. 하단 바 (빨간색)
  slide.addShape(pptx.ShapeType.rect, {
    x: 7.0, y: 7.2, w: '35%', h: 0.3,
    fill: { color: BOTTOM_BAR_RED }, line: { color: BOTTOM_BAR_RED }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.2, w: '65%', h: 0.3,
    fill: { color: TITLE_BAR_COLOR }, line: { color: TITLE_BAR_COLOR }
  });
}

function renderFeasibilityItem(slide: PptxGenJS.Slide, pptx: PptxGenJS, item: ReportItem, index: number, basicInfo: any) {
  // 1. 헤더 테이블 (공통)
  const headerRows: any[] = [
    [
      { text: "PJT명", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.modelName || '', options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: "부품 명", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.partName || '', options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: "작성자", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.designer || '', options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: "검토일", options: { fill: HEADER_FILL, color: HEADER_COLOR, bold: true, fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } },
      { text: basicInfo.reviewDate || '', options: { fontSize: 9, align: 'center', fontFace: FONT_FACE, border: { color: BORDER_COLOR, pt: 1 } } }
    ]
  ];

  // 2. 제목 바 (상단)
  const sectionTitle = getSectionTitle(item.sectionType, item.customTitle, index);

  // 파란색 상단 띠
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0.1, w: '100%', h: 0.15,
    fill: { color: TITLE_BAR_COLOR }, line: { color: TITLE_BAR_COLOR }
  });

  // 제목 텍스트 (굵게)
  slide.addText(sectionTitle, {
    x: 0.2, y: 0.3, w: 10.0, h: 0.5,
    fontSize: 24, bold: true, color: '000000', fontFace: FONT_FACE
  });

  // 헤더 테이블 배치
  slide.addTable(headerRows, {
    x: 0.2, y: 0.9, w: 10.43, h: 0.4,
    colW: [0.8, 2.0, 0.8, 2.0, 0.8, 1.2, 0.8, 2.03],
    align: 'center', valign: 'middle'
  });

  // 3. 본문 영역 (타입별 분기)
  const contentY = 1.3;
  const borderOpt = { color: BORDER_COLOR, pt: 1 };

  if (item.sectionType === 'problem') {
    // === 문제점 및 대책 레이아웃 (좌우 분할 + 테이블 기반) ===

    const colW = 5.12; // 13cm
    const gap = 0.19;
    const startX = 0.2;
    const rightX = startX + colW + gap;

    // 높이 배분 (총 5.8 inch 활용)
    const headerH = 0.4;
    const imgH = 3.54; // 9cm
    const labelH = 0.3;
    const textH = 1.56;

    // 1. 테이블 프레임 그리기
    const leftRows: any[] = [
      [{ text: "문제점 및 원인", options: { fill: HEADER_FILL, fontSize: 10, bold: true, fontFace: FONT_FACE, border: borderOpt, align: 'center', valign: 'middle' } }],
      [{ text: "", options: { border: borderOpt, valign: 'middle', align: 'center' } }], // 이미지 영역
      [{ text: "문제점", options: { fill: HEADER_FILL, fontSize: 10, bold: true, fontFace: FONT_FACE, border: borderOpt, align: 'center', valign: 'middle' } }],
      [{ text: ((item.analysis?.problem || '') + (item.analysis?.cause ? '\n\n[원인]\n' + item.analysis.cause : '')).replace(/\\\\n/g, '\n').trim() || '', options: { border: borderOpt, fontSize: 10, fontFace: FONT_FACE, align: 'left', valign: 'top', breakLine: true } }]
    ];

    slide.addTable(leftRows, {
      x: startX, y: contentY, w: colW,
      rowH: [headerH, imgH, labelH, textH],
      align: 'center'
    });

    // 우측 테이블
    const rightRows: any[] = [
      [{ text: "검토 내용", options: { fill: HEADER_FILL, fontSize: 10, bold: true, fontFace: FONT_FACE, border: borderOpt, align: 'center', valign: 'middle' } }],
      [{ text: "", options: { border: borderOpt, valign: 'middle', align: 'center' } }], // 이미지 영역
      [{ text: "대책 대안", options: { fill: HEADER_FILL, fontSize: 10, bold: true, fontFace: FONT_FACE, border: borderOpt, align: 'center', valign: 'middle' } }],
      [{ text: (item.analysis?.countermeasures || '').replace(/\\n/g, '\n'), options: { border: borderOpt, fontSize: 10, fontFace: FONT_FACE, color: '0055AA', align: 'left', valign: 'top', breakLine: true } }]
    ];

    slide.addTable(rightRows, {
      x: rightX, y: contentY, w: colW,
      rowH: [headerH, imgH, labelH, textH],
      align: 'center'
    });

    // 2. 이미지 배치 (테이블 위 좌표에)
    if (item.images && item.images.length > 0) {
      slide.addImage({
        data: item.images[0].dataUrl,
        x: startX + 0.05,
        y: contentY + headerH + 0.05,
        w: colW - 0.1,
        h: imgH - 0.1,
        sizing: { type: 'contain', w: colW - 0.1, h: imgH - 0.1 }
      });
    }

    if (item.images && item.images.length > 1) {
      slide.addImage({
        data: item.images[1].dataUrl,
        x: rightX + 0.05,
        y: contentY + headerH + 0.05,
        w: colW - 0.1,
        h: imgH - 0.1,
        sizing: { type: 'contain', w: colW - 0.1, h: imgH - 0.1 }
      });
    }

  } else {
    // === Spec / Undercut 레이아웃 (큰 이미지) ===

    // 헤더: NO | 제품 SPEC
    const subHeaderRows: any[] = [
      [
        { text: "NO", options: { fill: HEADER_FILL, fontSize: 9, bold: true, align: 'center', fontFace: FONT_FACE, border: borderOpt } },
        { text: item.sectionType === 'spec' ? '제품 SPEC' : '제품 언더컷', options: { fill: 'FFFFFF', fontSize: 9, bold: true, align: 'center', fontFace: FONT_FACE, border: borderOpt, colspan: 3 } },
        { text: "", options: { border: borderOpt } },
        { text: "", options: { border: borderOpt } }
      ]
    ];

    slide.addTable(subHeaderRows, {
      x: 0.2, y: 1.3, w: 10.43, h: 0.3,
      colW: [0.5, 9.93]
    });

    slide.addTable([
      [
        { text: `${index + 1}`, options: { fontSize: 12, bold: true, align: 'center', valign: 'middle', border: borderOpt } },
        { text: "", options: { border: borderOpt } }
      ]
    ], {
      x: 0.2, y: 1.6, w: 10.43, h: 5.5,
      colW: [0.5, 9.93]
    });

    if (item.images && item.images.length > 0) {
      slide.addImage({
        data: item.images[0].dataUrl,
        x: 0.8, y: 1.7, w: 9.7, h: 5.3,
        sizing: { type: 'contain', w: 9.7, h: 5.3 }
      });
    }
  }

  // 4. 하단 바
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 7.2, w: '65%', h: 0.3,
    fill: { color: TITLE_BAR_COLOR }, line: { color: TITLE_BAR_COLOR }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 7.0, y: 7.2, w: '35%', h: 0.3,
    fill: { color: BOTTOM_BAR_RED }, line: { color: BOTTOM_BAR_RED }
  });
}

function getSectionTitle(sectionType: string | undefined, customTitle: string | undefined, index: number): string {
  if (sectionType === 'spec') return `${index + 1}. 제품 Modeling 검토`;
  if (sectionType === 'undercut') return `${index + 1}. 제품 언더컷`;
  if (sectionType === 'problem') return `${index + 1}. 제품 모델링 검토 (문제점 및 대책)`;
  if (sectionType === 'custom' && customTitle) return `${index + 1}. ${customTitle}`;
  return `${index + 1}. 검토 항목`;
}

export const generateXlsxReport = async (images: CapturedImage[]): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Captures');

  // Implementation remains same for XLSX for now
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Capture', key: 'image', width: 80 },
  ];

  const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.src = dataUrl;
    });
  };

  const ROW_HEIGHT_POINTS = 260;
  const TARGET_IMAGE_HEIGHT_PX = ROW_HEIGHT_POINTS * 0.75;

  for (const [index, image] of images.entries()) {
    const { width: originalWidth, height: originalHeight } = await getImageDimensions(image.dataUrl);
    const aspectRatio = originalWidth / originalHeight;
    const newHeight = TARGET_IMAGE_HEIGHT_PX;
    const newWidth = newHeight * aspectRatio;

    const imageId = workbook.addImage({
      base64: image.dataUrl,
      extension: 'png',
    });

    const row = worksheet.addRow({ id: index + 1 });
    row.height = ROW_HEIGHT_POINTS;

    worksheet.addImage(imageId, {
      tl: { col: 1.05, row: row.number - 0.95 },
      ext: { width: newWidth, height: newHeight },
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Report-${getFormattedDate()}.xlsx`);
};
