export interface PreviewReportItem {
    id: string;
    images: Array<{ id?: string; dataUrl: string }>;
    analysis: {
        problem: string;
        cause: string;
        countermeasures: string;
    };
    sectionType?: string;
    customTitle?: string;
}

export interface ReportPreviewPage {
    id: string;
    kind: 'cover' | 'mold-spec' | 'feasibility' | 'generic';
    pageNumber: number;
    items: PreviewReportItem[];
}

export function buildReportPreviewPages(layoutId: string, items: PreviewReportItem[]): ReportPreviewPage[] {
    if (layoutId === 'feasibility_report') {
        return [
            { id: 'cover', kind: 'cover', pageNumber: 1, items: [] },
            ...items.map((item, index) => ({
                id: `feasibility-${item.id}`,
                kind: 'feasibility' as const,
                pageNumber: index + 2,
                items: [item]
            }))
        ];
    }

    if (layoutId === 'mold_spec') {
        if (items.length === 0) return [];

        const pages: ReportPreviewPage[] = [{
            id: `mold-${items[0].id}`,
            kind: 'mold-spec',
            pageNumber: 1,
            items: [items[0]]
        }];

        for (let index = 1; index < items.length; index += 2) {
            pages.push({
                id: `mold-${items[index].id}`,
                kind: 'mold-spec',
                pageNumber: pages.length + 1,
                items: items.slice(index, index + 2)
            });
        }
        return pages;
    }

    const perPage = layoutId === 'grid_2x2' ? 4 : 1;
    const pages: ReportPreviewPage[] = [];
    for (let index = 0; index < items.length; index += perPage) {
        pages.push({
            id: `generic-${items[index].id}`,
            kind: 'generic',
            pageNumber: pages.length + 1,
            items: items.slice(index, index + perPage)
        });
    }
    return pages;
}

export function getPreviewSectionTitle(item: PreviewReportItem, index: number): string {
    if (item.sectionType === 'spec') return `${index + 1}. 제품 Modeling 검토`;
    if (item.sectionType === 'undercut') return `${index + 1}. 제품 언더컷`;
    if (item.sectionType === 'problem') return `${index + 1}. 제품 모델링 검토 (문제점 및 대책)`;
    if (item.sectionType === 'custom' && item.customTitle) return `${index + 1}. ${item.customTitle}`;
    return `${index + 1}. 검토 항목`;
}
