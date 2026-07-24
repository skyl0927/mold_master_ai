import React, { useEffect, useState } from 'react';
import {
    WebKnowledgeReviewQueue,
    WebKnowledgeReviewQueueItem
} from '../types';
import { nextPendingReviewCaseId } from '../webKnowledgeReviewNavigation';
import { translateText } from '../services/aiService';
import { translateWebKnowledgeDraft } from '../webKnowledgeKoreanTranslation';

const lines = (values: string[]) => values.join('\n');
const splitLines = (value: string) => [...new Set(
    value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
)];
const splitReviewLines = (value: string) => [...new Set(
    value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
)];

const decisionStyle = (decision: WebKnowledgeReviewQueueItem['decision'], isCurrent: boolean) => {
    if (!isCurrent) return 'border-red-700 bg-red-950/30 text-red-200';
    if (decision === 'approved') return 'border-emerald-700 bg-emerald-950/30 text-emerald-200';
    if (decision === 'rejected') return 'border-red-700 bg-red-950/30 text-red-200';
    if (decision === 'needs_changes') return 'border-orange-700 bg-orange-950/30 text-orange-200';
    return 'border-gray-700 bg-gray-900/60 text-gray-300';
};

const WebKnowledgeReviewPanel: React.FC = () => {
    const [dataset, setDataset] = useState<WebKnowledgeReviewQueue | null>(null);
    const [selectedCaseId, setSelectedCaseId] = useState('');
    const [filter, setFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending');
    const [isLoading, setIsLoading] = useState(false);
    const [busyAction, setBusyAction] = useState('');
    const [status, setStatus] = useState('');
    const [image, setImage] = useState<{ dataUrl: string; title: string; license: string; sourceUrl: string } | null>(null);
    const [defectName, setDefectName] = useState('');
    const [problem, setProblem] = useState('');
    const [phenomenon, setPhenomenon] = useState('');
    const [causeCandidates, setCauseCandidates] = useState('');
    const [causeLabels, setCauseLabels] = useState('');
    const [checkItems, setCheckItems] = useState('');
    const [actions, setActions] = useState('');
    const [reviewer, setReviewer] = useState('');
    const [reviewerComment, setReviewerComment] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [roundtripResult, setRoundtripResult] = useState<{
        passed: boolean;
        answer: string;
        confidence: number;
        evidence: Array<Record<string, any>>;
        reasoningTrace: string[];
        checks: Record<string, boolean>;
    } | null>(null);

    const loadQueue = async (keepSelection = true) => {
        setIsLoading(true);
        try {
            const result = await window.electronAPI.getWebKnowledgeReviewQueue();
            setDataset(result);
            const retained = keepSelection
                && result.queue.some(item => item.card.caseId === selectedCaseId);
            if (!retained) {
                const firstPending = result.queue.find(item =>
                    item.decision === 'pending' || !item.isCurrent
                );
                setSelectedCaseId(firstPending?.card.caseId || result.queue[0]?.card.caseId || '');
            }
            setStatus(
                `카드 ${result.integrity.cardCount}건 · 이미지 해시 ${result.integrity.verifiedImages}건 검증 완료`
            );
            return result;
        } catch (error) {
            setStatus(error instanceof Error ? error.message : '웹 지식 검토 큐를 열지 못했습니다.');
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadQueue(false);
    }, []);

    const selected = dataset?.queue.find(item => item.card.caseId === selectedCaseId) || null;

    useEffect(() => {
        if (!selected) return;
        setDefectName(selected.review?.defectName || selected.card.defectName);
        setProblem(selected.review?.problem || selected.card.problem);
        setPhenomenon(selected.review?.phenomenon || selected.card.phenomenon);
        setCauseCandidates(lines(
            selected.review?.causeCandidates?.length
                ? selected.review.causeCandidates
                : selected.card.causes.map(cause => cause.text)
        ));
        setCauseLabels(lines(
            selected.review?.causeLabels?.length
                ? selected.review.causeLabels
                : selected.suggestedCauseLabels
        ));
        setCheckItems(lines(
            selected.review?.checkItems?.length
                ? selected.review.checkItems
                : selected.suggestedCheckItems
        ));
        setActions(lines(
            selected.review?.actions?.length
                ? selected.review.actions
                : selected.suggestedActions
        ));
        setReviewer(current => selected.review?.reviewer || current);
        setReviewerComment(selected.review?.reviewerComment || '');
        setConfirmed(false);
        setRoundtripResult(null);
        setImage(null);
        if (selected.card.sourceKind === 'licensed_image') {
            void window.electronAPI.getWebKnowledgeCardImage(selected.card.caseId)
                .then(setImage)
                .catch(error => setStatus(
                    error instanceof Error ? error.message : '근거 이미지를 열지 못했습니다.'
                ));
        }
    }, [selectedCaseId, selected?.sourceContentSha256]);

    const visibleItems = (dataset?.queue || []).filter(item => {
        const needle = filter.trim().toLocaleLowerCase();
        const matchesText = !needle || [
            item.card.defectName,
            item.card.problem,
            item.card.defectClass,
            item.card.caseId
        ].some(value => String(value || '').toLocaleLowerCase().includes(needle));
        const matchesStatus = statusFilter === 'all'
            || (statusFilter === 'stale' ? !item.isCurrent : item.decision === statusFilter);
        return matchesText && matchesStatus;
    });
    const selectedVisibleIndex = visibleItems.findIndex(item =>
        item.card.caseId === selectedCaseId
    );

    const navigateVisible = (offset: number) => {
        if (visibleItems.length === 0) return;
        const currentIndex = selectedVisibleIndex >= 0 ? selectedVisibleIndex : 0;
        const nextIndex = Math.min(
            visibleItems.length - 1,
            Math.max(0, currentIndex + offset)
        );
        setSelectedCaseId(visibleItems[nextIndex].card.caseId);
    };

    const translateSelected = async () => {
        if (!selected) return;
        setBusyAction('translate');
        setStatus('선택 카드의 영문 서술을 한글로 번역하고 있습니다.');
        try {
            const translated = await translateWebKnowledgeDraft({
                defectName,
                problem,
                phenomenon,
                causeCandidates: splitReviewLines(causeCandidates),
                causeLabels: splitLines(causeLabels),
                checkItems: splitReviewLines(checkItems),
                actions: splitReviewLines(actions)
            }, (text: string) => translateText(text, 'ko'));
            setDefectName(translated.defectName);
            setProblem(translated.problem);
            setPhenomenon(translated.phenomenon);
            setCauseCandidates(lines(translated.causeCandidates));
            setCauseLabels(lines(translated.causeLabels));
            setCheckItems(lines(translated.checkItems));
            setActions(lines(translated.actions));
            setConfirmed(false);
            setStatus('한글 번역본을 검토 필드에 삽입했습니다. 내용을 확인한 후 HITL 판정을 저장하세요.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : '한글 번역에 실패했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    const saveReview = async (decision: 'approved' | 'needs_changes' | 'rejected' | 'clear') => {
        if (!selected) return;
        setBusyAction(decision);
        setStatus('');
        try {
            await window.electronAPI.setWebKnowledgeReview(selected.card.caseId, decision === 'clear'
                ? { decision }
                : {
                    decision,
                    confirmed,
                    sourceContentSha256: selected.sourceContentSha256,
                    reviewer,
                    reviewerComment,
                    defectName,
                    problem,
                    phenomenon,
                    causeCandidates: splitReviewLines(causeCandidates),
                    causeLabels: splitLines(causeLabels),
                    checkItems: splitReviewLines(checkItems),
                    actions: splitReviewLines(actions)
                });
            const refreshed = await loadQueue();
            setConfirmed(false);
            if (decision !== 'clear' && refreshed) {
                const nextCaseId = nextPendingReviewCaseId(
                    refreshed.queue,
                    selected.card.caseId
                );
                if (nextCaseId) setSelectedCaseId(nextCaseId);
            }
            setStatus(
                decision === 'approved'
                    ? '로컬 HITL 승인을 저장했습니다. Common Agent에는 아직 전송하지 않았습니다.'
                    : decision === 'clear'
                        ? '검토 판정을 초기화했습니다.'
                        : '검토 판정을 저장했습니다. Common Agent에는 전송하지 않았습니다.'
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : '검토 판정을 저장하지 못했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    const validateSelected = async () => {
        if (!selected) return;
        setBusyAction('validate');
        try {
            const result = await window.electronAPI.validateWebKnowledgeCard(selected.card.caseId);
            setStatus(
                `Common Agent 비저장 검증: ${result.ready_to_ingest ? '통과' : '미통과'}`
                + ` · 품질 ${result.quality_score} · 오류 ${result.error_count} · 경고 ${result.warning_count}`
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Common Agent 검증에 실패했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    const ingestSelected = async () => {
        if (!selected) return;
        setBusyAction('ingest');
        try {
            const result = await window.electronAPI.ingestWebKnowledgeCard(selected.card.caseId);
            await loadQueue();
            setStatus(
                result.alreadyIngested
                    ? `동일 해시가 이미 후보 적재되었습니다: ${result.ingestion.documentId}`
                    : `Common Agent 후보 적재 완료: ${result.ingestion.documentId}`
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Common Agent 후보 적재에 실패했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    const approveCentral = async () => {
        if (!selected) return;
        setBusyAction('central-approve');
        try {
            const result = await window.electronAPI.approveWebKnowledgeCard(
                selected.card.caseId,
                { confirmed, reviewer, reviewerComment }
            );
            await loadQueue();
            setConfirmed(false);
            setStatus(
                result.alreadyApproved
                    ? '이 카드의 현재 해시는 이미 Common Agent 중앙 승인이 완료되었습니다.'
                    : 'Common Agent 문서 승인과 Graph review 상태 동기화를 완료했습니다.'
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Common Agent 중앙 승인에 실패했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    const testRoundtrip = async () => {
        if (!selected) return;
        setBusyAction('roundtrip');
        try {
            const result = await window.electronAPI.testWebKnowledgeRoundtrip(selected.card.caseId);
            setRoundtripResult(result);
            setStatus(
                result.passed
                    ? `Graph 승인 근거 왕복 검증 통과 · 근거 ${result.evidence.length}건`
                    : `Graph 왕복 검증 미통과 · ${JSON.stringify(result.checks)}`
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Graph 왕복 검증에 실패했습니다.');
        } finally {
            setBusyAction('');
        }
    };

    if (!dataset && isLoading) {
        return <div className="flex min-h-[420px] items-center justify-center text-cyan-200">40건 카드 무결성 검증 중...</div>;
    }

    return (
        <div className="space-y-4">
            <section className="overflow-hidden rounded-xl border border-cyan-900/70 bg-[#071923]">
                <div className="grid gap-px bg-cyan-950/60 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        ['전체', dataset?.summary.total || 0, 'text-white'],
                        ['대기', dataset?.summary.pending || 0, 'text-amber-300'],
                        ['승인', dataset?.summary.approved || 0, 'text-emerald-300'],
                        ['수정 필요', dataset?.summary.needsChanges || 0, 'text-orange-300'],
                        ['반려', dataset?.summary.rejected || 0, 'text-red-300'],
                        ['원문 변경', dataset?.summary.stale || 0, 'text-fuchsia-300']
                    ].map(([label, value, color]) => (
                        <div key={String(label)} className="bg-gray-950/60 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
                            <p className={`mt-1 text-2xl font-black ${color}`}>{value}</p>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cyan-950 px-4 py-3">
                    <div>
                        <p className="font-bold text-cyan-100">Web Case HITL Pipeline</p>
                        <p className="mt-1 text-xs text-gray-400">
                            로컬 승인과 Common Agent 후보 적재를 분리합니다. 중앙 승인 전에는 Graph 검색 근거로 승격되지 않습니다.
                        </p>
                    </div>
                    <button
                        onClick={() => void loadQueue()}
                        disabled={isLoading}
                        className="rounded border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-950 disabled:opacity-50"
                    >
                        {isLoading ? '검증 중' : '무결성 재검증'}
                    </button>
                </div>
            </section>

            {status && (
                <p className="rounded border border-sky-800/70 bg-sky-950/30 px-4 py-3 text-xs text-sky-100">
                    {status}
                </p>
            )}

            <div className="grid min-h-[560px] overflow-hidden rounded-xl border border-gray-700 bg-gray-950/40 lg:grid-cols-[330px_minmax(0,1fr)]">
                <aside className="border-b border-gray-800 bg-gray-950/70 lg:border-b-0 lg:border-r">
                    <div className="space-y-2 border-b border-gray-800 p-3">
                        <input
                            value={filter}
                            onChange={event => setFilter(event.target.value)}
                            placeholder="결함명, 분류, 문제 검색"
                            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none focus:border-cyan-600"
                        />
                        <select
                            value={statusFilter}
                            onChange={event => setStatusFilter(event.target.value)}
                            aria-label="HITL 상태 필터"
                            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                        >
                            <option value="pending">검토 대기</option>
                            <option value="approved">승인</option>
                            <option value="needs_changes">수정 필요</option>
                            <option value="rejected">반려</option>
                            <option value="stale">원문 변경</option>
                            <option value="all">전체</option>
                        </select>
                    </div>
                    <div className="dataset-scrollbar max-h-[610px] overflow-y-auto p-2">
                        {visibleItems.map((item, index) => (
                            <button
                                key={item.card.caseId}
                                onClick={() => setSelectedCaseId(item.card.caseId)}
                                className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                                    selectedCaseId === item.card.caseId
                                        ? 'border-cyan-500 bg-cyan-950/50'
                                        : decisionStyle(item.decision, item.isCurrent)
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <strong className="text-sm text-white">{index + 1}. {item.card.defectName}</strong>
                                    <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] uppercase">
                                        {item.isCurrent ? item.decision : 'stale'}
                                    </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-400">{item.card.problem}</p>
                                <p className="mt-2 text-[9px] text-gray-600">{item.card.sourceKind} · {item.card.defectClass}</p>
                                {item.centralIngestion && (
                                    <p className="mt-2 text-[10px] font-bold text-emerald-400">
                                        {item.centralIngestion.centralReviewStatus === 'approved'
                                            ? 'Common Agent 승인 Graph'
                                            : 'Common Agent 후보 적재됨'}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                </aside>

                {selected ? (
                    <main className="dataset-scrollbar space-y-5 overflow-y-auto p-5">
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                            <section>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
                                        {selected.card.caseId}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={translateSelected}
                                            disabled={Boolean(busyAction)}
                                            className="rounded bg-cyan-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-cyan-600 disabled:opacity-40"
                                        >
                                            {busyAction === 'translate' ? '한글 번역 중' : '한글 번역 후 삽입'}
                                        </button>
                                        <span className="text-[10px] text-gray-500">
                                            {selectedVisibleIndex >= 0
                                                ? `${selectedVisibleIndex + 1} / ${visibleItems.length}`
                                                : `필터 외 선택 · ${visibleItems.length}건`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigateVisible(-1)}
                                            disabled={selectedVisibleIndex <= 0}
                                            className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:border-cyan-600 disabled:opacity-30"
                                        >
                                            이전
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigateVisible(1)}
                                            disabled={selectedVisibleIndex < 0 || selectedVisibleIndex >= visibleItems.length - 1}
                                            className="rounded border border-gray-700 px-2 py-1 text-[10px] text-gray-300 hover:border-cyan-600 disabled:opacity-30"
                                        >
                                            다음
                                        </button>
                                    </div>
                                </div>
                                <h3 className="mt-2 text-2xl font-black text-white">{defectName}</h3>
                                <p className="mt-3 rounded border border-gray-700 bg-gray-900/70 p-3 text-sm leading-6 text-gray-200">
                                    {phenomenon}
                                </p>
                                <div className="mt-4 space-y-2">
                                    {splitReviewLines(causeCandidates).map((cause, index) => (
                                        <div key={`${selected.card.caseId}-cause-${index}`} className="rounded border border-gray-800 bg-black/20 p-3">
                                            <p className="text-xs font-bold text-orange-300">원인 {index + 1}</p>
                                            <p className="mt-1 text-xs leading-5 text-gray-300">{cause}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                            <aside>
                                {image ? (
                                    <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="block">
                                        <img
                                            src={image.dataUrl}
                                            alt={image.title}
                                            className="max-h-64 w-full rounded-lg border border-gray-700 bg-black object-contain"
                                        />
                                        <p className="mt-2 text-[10px] text-gray-500">{image.title} · {image.license}</p>
                                    </a>
                                ) : (
                                    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-700 text-center text-xs text-gray-500">
                                        기술 문헌 기반 카드<br />이미지 근거 없음
                                    </div>
                                )}
                                <div className="mt-3 rounded border border-gray-800 bg-gray-950 p-3 text-[10px] text-gray-500">
                                    <p>SHA-256</p>
                                    <p className="mt-1 break-all font-mono">{selected.sourceContentSha256}</p>
                                </div>
                            </aside>
                        </div>

                        <section className="grid gap-4 border-t border-gray-800 pt-5 md:grid-cols-2">
                            <label className="text-xs text-gray-300 md:col-span-2">
                                검토 문제 정의
                                <textarea value={problem} onChange={event => setProblem(event.target.value)}
                                    rows={2} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300 md:col-span-2">
                                검토 현상 설명
                                <textarea value={phenomenon} onChange={event => setPhenomenon(event.target.value)}
                                    rows={4} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300 md:col-span-2">
                                상세 원인 후보 (원인별 줄바꿈)
                                <textarea value={causeCandidates} onChange={event => setCauseCandidates(event.target.value)}
                                    rows={4} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                검토 결함명
                                <input value={defectName} onChange={event => setDefectName(event.target.value)}
                                    className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                원인 라벨 (쉼표 또는 줄바꿈)
                                <textarea value={causeLabels} onChange={event => setCauseLabels(event.target.value)}
                                    rows={3} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                확인 항목
                                <textarea value={checkItems} onChange={event => setCheckItems(event.target.value)}
                                    rows={5} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                대책
                                <textarea value={actions} onChange={event => setActions(event.target.value)}
                                    rows={5} className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                검토자
                                <input value={reviewer} onChange={event => setReviewer(event.target.value)}
                                    placeholder="이름 또는 사번" className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                            <label className="text-xs text-gray-300">
                                검토 의견
                                <textarea value={reviewerComment} onChange={event => setReviewerComment(event.target.value)}
                                    rows={3} placeholder="근거 확인 내용 또는 수정/반려 사유"
                                    className="mt-1 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white" />
                            </label>
                        </section>

                        <label className="flex items-start gap-2 rounded border border-cyan-900 bg-cyan-950/25 p-3 text-xs text-cyan-100">
                            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5" />
                            <span>출처, 현상, 원인, 확인 항목과 대책을 직접 검토했으며 이 판정을 저장하는 데 동의합니다.</span>
                        </label>

                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => void saveReview('approved')} disabled={Boolean(busyAction)}
                                className="rounded bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
                                HITL 승인
                            </button>
                            <button onClick={() => void saveReview('needs_changes')} disabled={Boolean(busyAction)}
                                className="rounded bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                                수정 필요
                            </button>
                            <button onClick={() => void saveReview('rejected')} disabled={Boolean(busyAction)}
                                className="rounded bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                                반려
                            </button>
                            <button onClick={() => void saveReview('clear')} disabled={Boolean(busyAction)}
                                className="rounded border border-gray-700 px-4 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 disabled:opacity-50">
                                판정 초기화
                            </button>
                            <span className="mx-1 hidden h-8 border-l border-gray-700 sm:block" />
                            <button onClick={validateSelected}
                                disabled={Boolean(busyAction) || selected.decision !== 'approved' || !selected.isCurrent}
                                className="rounded border border-sky-600 px-4 py-2 text-xs font-bold text-sky-200 hover:bg-sky-950 disabled:opacity-35">
                                Common Agent 비저장 검증
                            </button>
                            <button onClick={ingestSelected}
                                disabled={Boolean(busyAction) || selected.decision !== 'approved' || !selected.isCurrent}
                                className="rounded bg-sky-700 px-4 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-35">
                                후보 적재
                            </button>
                            <button onClick={approveCentral}
                                disabled={Boolean(busyAction)
                                    || selected.decision !== 'approved'
                                    || !selected.isCurrent
                                    || !selected.centralIngestion
                                    || !confirmed
                                    || selected.centralIngestion.centralReviewStatus === 'approved'}
                                className="rounded bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-35">
                                중앙 승인 + Graph 활성화
                            </button>
                            <button onClick={testRoundtrip}
                                disabled={Boolean(busyAction)
                                    || selected.centralIngestion?.centralReviewStatus !== 'approved'}
                                className="rounded bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-600 disabled:opacity-35">
                                Graph 왕복 검증
                            </button>
                        </div>

                        {roundtripResult && (
                            <section className={`rounded-lg border p-4 ${
                                roundtripResult.passed
                                    ? 'border-emerald-800 bg-emerald-950/20'
                                    : 'border-red-800 bg-red-950/20'
                            }`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="font-bold text-white">
                                        승인 Graph 왕복 결과 · {roundtripResult.passed ? 'PASS' : 'FAIL'}
                                    </h4>
                                    <span className="text-xs text-gray-400">
                                        신뢰도 {Math.round((roundtripResult.confidence || 0) * 100)}%
                                        {' · '}근거 {roundtripResult.evidence.length}건
                                    </span>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">
                                    {roundtripResult.answer}
                                </p>
                                <div className="mt-3 space-y-1 border-t border-gray-800 pt-3">
                                    {roundtripResult.evidence.slice(0, 5).map((item, index) => (
                                        <p key={`${item.node_id || index}`} className="text-[10px] text-cyan-200">
                                            {index + 1}. [{item.review_status || 'unknown'}] {item.source_ref || item.node_id}
                                        </p>
                                    ))}
                                    {roundtripResult.reasoningTrace.slice(0, 8).map((trace, index) => (
                                        <p key={`trace-${index}`} className="font-mono text-[9px] text-gray-500">
                                            TRACE {index + 1}: {trace}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        )}
                    </main>
                ) : (
                    <div className="flex items-center justify-center text-gray-500">선택한 카드가 없습니다.</div>
                )}
            </div>
        </div>
    );
};

export default WebKnowledgeReviewPanel;
