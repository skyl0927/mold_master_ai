import React from 'react';
import {
    buildReportPreviewPages,
    getPreviewSectionTitle,
    PreviewReportItem,
    ReportPreviewPage
} from '../services/reportPreviewModel';

interface ReportPreviewProps {
    layoutId: string;
    layoutName: string;
    basicInfo: Record<string, string>;
    items: PreviewReportItem[];
    verified: boolean;
}

const safeText = (value?: string) => value?.trim() || '-';

const PreviewImage = ({ src, alt }: { src?: string; alt: string }) => (
    <div className="flex min-h-28 items-center justify-center overflow-hidden rounded border border-slate-300 bg-slate-100">
        {src
            ? <img src={src} alt={alt} className="h-full max-h-52 w-full object-contain" />
            : <span className="text-xs text-slate-400">첨부 이미지 없음</span>}
    </div>
);

const InfoCell = ({ label, value }: { label: string; value?: string }) => (
    <div className="grid grid-cols-[72px_1fr] border-r border-b border-slate-300 text-[10px]">
        <strong className="bg-slate-100 px-2 py-1.5 text-center text-slate-700">{label}</strong>
        <span className="px-2 py-1.5 text-slate-800">{safeText(value)}</span>
    </div>
);

const MoldSpecPage = ({ page, basicInfo }: { page: ReportPreviewPage; basicInfo: Record<string, string> }) => (
    <div className="relative aspect-[1.58/1] w-full overflow-hidden bg-white p-5 text-slate-900 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-blue-900" />
        <div className="absolute inset-x-0 top-1.5 h-0.5 bg-red-600" />
        <header className="mb-3 flex items-center justify-between">
            <h3 className="text-xl font-black tracking-tight">{page.pageNumber === 1 ? '금형개조용접시방서' : '금형개조용접시방서 (계속)'}</h3>
            <span className="text-[10px] font-bold text-blue-900">A-TECH SOLUTION</span>
        </header>
        {page.pageNumber === 1 && (
            <div className="mb-3 grid grid-cols-3 border-l border-t border-slate-300">
                <InfoCell label="작업번호" value={basicInfo.jobNo} />
                <InfoCell label="작성자" value={basicInfo.author} />
                <InfoCell label="작성일" value={basicInfo.writeDate} />
                <InfoCell label="고객사" value={basicInfo.customer} />
                <InfoCell label="모델" value={basicInfo.model} />
                <InfoCell label="품명" value={basicInfo.partName} />
            </div>
        )}
        <div className={`grid gap-3 ${page.items.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {page.items.map((item, index) => (
                <section key={item.id} className="overflow-hidden rounded border border-slate-300">
                    <div className="grid grid-cols-[36px_1fr_1fr_1fr] bg-slate-100 text-[10px] font-bold text-slate-700">
                        <span className="border-r border-slate-300 p-1.5 text-center">{index + 1}</span>
                        <span className="border-r border-slate-300 p-1.5 text-center">문제점</span>
                        <span className="border-r border-slate-300 p-1.5 text-center">원인</span>
                        <span className="p-1.5 text-center">대책수립</span>
                    </div>
                    <div className="grid min-h-20 grid-cols-[36px_1fr_1fr_1fr] text-[9px] leading-relaxed">
                        <span className="border-r border-t border-slate-300 p-1.5 text-center">{page.pageNumber}</span>
                        <p className="whitespace-pre-wrap border-r border-t border-slate-300 p-2">{safeText(item.analysis.problem)}</p>
                        <p className="whitespace-pre-wrap border-r border-t border-slate-300 p-2">{safeText(item.analysis.cause)}</p>
                        <p className="whitespace-pre-wrap border-t border-slate-300 p-2 text-blue-800">{safeText(item.analysis.countermeasures)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t border-slate-300 p-2">
                        <PreviewImage src={item.images[0]?.dataUrl} alt="문제 이미지" />
                        <PreviewImage src={item.images[1]?.dataUrl} alt="대책 이미지" />
                    </div>
                </section>
            ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-blue-900" />
        <span className="absolute bottom-2 right-5 text-[9px] text-slate-500">{page.pageNumber}</span>
    </div>
);

const FeasibilityCover = ({ basicInfo }: { basicInfo: Record<string, string> }) => (
    <div className="relative aspect-[1.43/1] w-full overflow-hidden bg-white p-10 text-slate-900 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-2 bg-blue-900" />
        <div className="flex h-full flex-col justify-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-blue-800">A-TECH SOLUTION</p>
            <h3 className="text-4xl font-black tracking-tight">제품 모델링 및<br />사출 금형 검토서</h3>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-x-8 gap-y-3 border-y border-slate-300 py-5 text-sm">
                <span className="text-slate-500">프로젝트</span><strong>{safeText(basicInfo.modelName)}</strong>
                <span className="text-slate-500">부품명</span><strong>{safeText(basicInfo.partName)}</strong>
                <span className="text-slate-500">작성자 / 검토일</span><strong>{safeText(basicInfo.designer)} / {safeText(basicInfo.reviewDate)}</strong>
            </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-3"><span className="w-2/3 bg-blue-900" /><span className="flex-1 bg-red-600" /></div>
    </div>
);

const FeasibilityPage = ({ page, basicInfo, itemIndex }: { page: ReportPreviewPage; basicInfo: Record<string, string>; itemIndex: number }) => {
    const item = page.items[0];
    const isProblem = item.sectionType === 'problem';
    return (
        <div className="relative aspect-[1.43/1] w-full overflow-hidden bg-white p-5 text-slate-900 shadow-2xl">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-blue-900" />
            <h3 className="mb-3 text-xl font-black">{getPreviewSectionTitle(item, itemIndex)}</h3>
            <div className="mb-3 grid grid-cols-4 border-l border-t border-slate-300">
                <InfoCell label="PJT명" value={basicInfo.modelName} />
                <InfoCell label="부품명" value={basicInfo.partName} />
                <InfoCell label="작성자" value={basicInfo.designer} />
                <InfoCell label="검토일" value={basicInfo.reviewDate} />
            </div>
            {isProblem ? (
                <div className="grid grid-cols-2 gap-3">
                    <section className="rounded border border-slate-300">
                        <h4 className="bg-slate-100 p-2 text-center text-xs font-bold">문제점 및 원인</h4>
                        <div className="p-2"><PreviewImage src={item.images[0]?.dataUrl} alt="문제 이미지" /></div>
                        <p className="whitespace-pre-wrap border-t border-slate-300 p-3 text-[10px] leading-relaxed">{safeText(item.analysis.problem)}{item.analysis.cause ? `\n\n[원인]\n${item.analysis.cause}` : ''}</p>
                    </section>
                    <section className="rounded border border-slate-300">
                        <h4 className="bg-slate-100 p-2 text-center text-xs font-bold">검토 내용</h4>
                        <div className="p-2"><PreviewImage src={item.images[1]?.dataUrl} alt="검토 이미지" /></div>
                        <p className="whitespace-pre-wrap border-t border-slate-300 p-3 text-[10px] leading-relaxed text-blue-800">{safeText(item.analysis.countermeasures)}</p>
                    </section>
                </div>
            ) : (
                <section className="rounded border border-slate-300 p-3">
                    <PreviewImage src={item.images[0]?.dataUrl} alt="제품 검토 이미지" />
                    {(item.analysis.problem || item.analysis.countermeasures) && (
                        <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed">{safeText(item.analysis.problem || item.analysis.countermeasures)}</p>
                    )}
                </section>
            )}
            <div className="absolute inset-x-0 bottom-0 flex h-2"><span className="w-2/3 bg-blue-900" /><span className="flex-1 bg-red-600" /></div>
            <span className="absolute bottom-2 right-5 text-[9px] text-slate-500">{page.pageNumber}</span>
        </div>
    );
};

export const ReportPreview: React.FC<ReportPreviewProps> = ({ layoutId, layoutName, basicInfo, items, verified }) => {
    const pages = buildReportPreviewPages(layoutId, items);
    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-5 py-3">
                <div>
                    <p className="text-sm font-bold text-white">{layoutName}</p>
                    <p className="text-xs text-slate-400">출력 예정 {pages.length}페이지 · 내용과 이미지 배치를 최종 확인하세요.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${verified ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                    {verified ? '학습 데이터 승인' : '일반 문서'}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-5xl space-y-8">
                    {pages.map((page, index) => (
                        <article key={page.id}>
                            <div className="mb-2 flex items-center gap-3 text-xs font-semibold text-slate-400">
                                <span className="rounded bg-slate-800 px-2 py-1">PAGE {page.pageNumber}</span>
                                <span>{page.kind === 'cover' ? '표지' : '본문'}</span>
                            </div>
                            {page.kind === 'cover' && <FeasibilityCover basicInfo={basicInfo} />}
                            {page.kind === 'mold-spec' && <MoldSpecPage page={page} basicInfo={basicInfo} />}
                            {page.kind === 'feasibility' && <FeasibilityPage page={page} basicInfo={basicInfo} itemIndex={index - 1} />}
                            {page.kind === 'generic' && (
                                <div className="grid aspect-video w-full grid-cols-2 gap-4 bg-white p-6 shadow-2xl">
                                    {page.items.map(item => <PreviewImage key={item.id} src={item.images[0]?.dataUrl} alt="보고서 이미지" />)}
                                </div>
                            )}
                        </article>
                    ))}
                    {pages.length === 0 && <div className="rounded-xl border border-dashed border-slate-700 p-12 text-center text-slate-400">미리 볼 보고서 항목이 없습니다.</div>}
                </div>
            </div>
        </div>
    );
};
