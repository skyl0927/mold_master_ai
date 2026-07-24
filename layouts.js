/**
 * Report Layout Management Module
 * 리포트 레이아웃(좌표, 스타일)을 관리하고 제공하는 모듈
 */

const fs = require('fs');
const path = require('path');

let layouts = null;
let layoutsPath = null;

// 기본 레이아웃 정의 (파일이 없을 경우 사용)
const DEFAULT_LAYOUTS = [
    {
        id: "grid_2x2",
        name: "4분할 그리드 (기본)",
        description: "한 슬라이드에 4개의 이미지를 배치합니다. (단순 사진 대지)",
        type: "pptx",
        slideLayout: "LAYOUT_16x9",
        elements: [
            // Slide 1 Layout logic handled by code loop, providing base coordinates
            { type: "image", id: "img_1", x: 0.25, y: 0.25, w: 4.625, h: 2.4375, placeholder: "Top-Left" },
            { type: "image", id: "img_2", x: 5.125, y: 0.25, w: 4.625, h: 2.4375, placeholder: "Top-Right" },
            { type: "image", id: "img_3", x: 0.25, y: 2.9375, w: 4.625, h: 2.4375, placeholder: "Bottom-Left" },
            { type: "image", id: "img_4", x: 5.125, y: 2.9375, w: 4.625, h: 2.4375, placeholder: "Bottom-Right" }
        ],
        perSlideItems: 4
    },
    {
        id: "detail_1",
        name: "상세 분석 보고서 (1장/1건)",
        description: "이미지와 분석 결과(원인, 대책)를 상세히 기술합니다.",
        type: "pptx",
        slideLayout: "LAYOUT_16x9",
        elements: [
            // Header
            { type: "text", text: "불량 분석 보고서", x: 0.5, y: 0.2, w: 9.0, h: 0.5, fontSize: 24, bold: true, color: "363636" },
            // Image
            { type: "image", id: "main_img", x: 0.5, y: 1.0, w: 5.0, h: 3.75 },
            // Info Box
            { type: "shape", x: 5.8, y: 1.0, w: 4.0, h: 3.75, fill: "F5F5F5", line: "CCCCCC" },
            { type: "text", label: "불량 유형:", key: "defectType", x: 6.0, y: 1.2, w: 3.6, h: 0.3, fontSize: 14, bold: true },
            { type: "text", label: "심각도:", key: "severity", x: 6.0, y: 1.6, w: 3.6, h: 0.3, fontSize: 14 },
            { type: "text", label: "발생 원인:", key: "possibleCauses", x: 6.0, y: 2.1, w: 3.6, h: 0.8, fontSize: 12 },
            { type: "text", label: "대책:", key: "countermeasures", x: 6.0, y: 3.1, w: 3.6, h: 1.0, fontSize: 12, color: "0055FF" }
        ],
        perSlideItems: 1
    },
    {
        id: "mold_spec",
        name: "금형개조용접시방서 (A-TECH) - 가로 A4",
        description: "가로 A4 (300mm x 190mm) 용지에 최적화된 시방서입니다. (1페이지 1항목, 2페이지부터 2항목)",
        type: "pptx",
        slideLayout: "A4",
        // Step 2: 기초 정보 입력 필드 정의
        fields: [
            { key: "jobNo", label: "작업번호", type: "text" },
            { key: "customer", label: "고객사", type: "text" },
            { key: "model", label: "모델", type: "text" },
            { key: "partName", label: "품 명", type: "text" },
            { key: "author", label: "작성자", type: "text" },
            { key: "assembler", label: "조립자", type: "text" },
            { key: "tryStep", label: "TRY단계", type: "text" },
            { key: "reqDate", label: "요청일정", type: "text" },
            { key: "writeDate", label: "작성일", type: "date" },
            { key: "maker", label: "제작처", type: "text" },
            { key: "injector", label: "사출처", type: "text" },
            { key: "massProd", label: "양산처", type: "text" }
        ],
        // 실제 요소 배치는 reportService.ts의 A4 로직에서 처리됨 (elements는 참조용 또는 커스텀 렌더러용)
        elements: [],
        perSlideItems: 2
    },
    {
        id: "feasibility_report",
        name: "제품 검토서 (Feasibility Report)",
        description: "제품 모델링 및 사출 금형 검토서 - 사용자 정의 섹션 지원",
        type: "pptx",
        slideLayout: "LAYOUT_16x9",
        // Step 2: 기초 정보 입력 필드 정의
        fields: [
            { key: "modelName", label: "모델명", type: "text" },
            { key: "partName", label: "품명", type: "text" },
            { key: "designer", label: "설계자", type: "text" },
            { key: "reviewDate", label: "작성 날짜", type: "date" },
            { key: "reviewContent", label: "검토 내용", type: "textarea" }
        ],
        // 섹션 타입 옵션 (STEP3에서 사용)
        sectionTypes: [
            { value: "spec", label: "제품 SPEC" },
            { value: "undercut", label: "제품 언더컷" },
            { value: "problem", label: "문제점 및 대책" },
            { value: "custom", label: "사용자 정의" }
        ],
        elements: [],
        perSlideItems: 1
    }
];

function initLayouts(userDataPath) {
    layoutsPath = path.join(userDataPath, 'report-layouts.json');
    if (!fs.existsSync(layoutsPath)) {
        saveLayouts(DEFAULT_LAYOUTS);
    }
    loadLayouts();
}

function loadLayouts() {
    try {
        if (fs.existsSync(layoutsPath)) {
            const data = fs.readFileSync(layoutsPath, 'utf-8');
            let savedLayouts = JSON.parse(data);

            // 시스템 기본 레이아웃과 병합 (새로운 템플릿 추가 및 기존 기본 템플릿 갱신)
            let changed = false;
            DEFAULT_LAYOUTS.forEach(def => {
                const index = savedLayouts.findIndex(l => l.id === def.id);
                if (index === -1) {
                    // 없으면 추가
                    savedLayouts.push(def);
                    changed = true;
                } else {
                    // 있으면 갱신 (시스템 정의 레이아웃의 구조 변경 반영을 위해 덮어쓰기)
                    // 주의: 사용자가 커스텀한 내용이 사라질 수 있으나, 현재 단계에서는 구조 변경 반영이 우선
                    // 실제로는 사용자 정의 필드와 병합해야 하나, 여기선 전체 덮어쓰기로 처리 (시스템 템플릿에 한해)
                    if (JSON.stringify(savedLayouts[index]) !== JSON.stringify(def)) {
                        savedLayouts[index] = def;
                        changed = true;
                    }
                }
            });

            layouts = savedLayouts;
            if (changed) {
                console.log("Layouts updated automatically.");
                saveLayouts(layouts);
            }
        } else {
            layouts = DEFAULT_LAYOUTS;
            saveLayouts(layouts);
        }
    } catch (e) {
        console.error("Failed to load layouts:", e);
        layouts = DEFAULT_LAYOUTS;
    }
    return layouts;
}

function saveLayouts(data) {
    try {
        fs.writeFileSync(layoutsPath, JSON.stringify(data, null, 2), 'utf-8');
        layouts = data;
        return true;
    } catch (e) {
        console.error("Failed to save layouts:", e);
        return false;
    }
}

function getLayouts() {
    if (!layouts) loadLayouts();
    return layouts;
}

module.exports = {
    initLayouts,
    getLayouts,
    saveLayouts
};
