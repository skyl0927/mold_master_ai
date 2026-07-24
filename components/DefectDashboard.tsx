import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, SpinnerIcon } from './Icons';

interface DefectStats {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    recentTrend: Array<{ date: string; count: number }>;
}

interface DefectRecord {
    id: number;
    imageId: string;
    analysis: {
        defectType?: string;
        severity?: string;
        description?: string;
        possibleCauses?: string;
        countermeasures?: string;
    };
    timestamp: string;
    status: string;
}

interface DefectDashboardProps {
    isOpen: boolean;
    onClose: () => void;
}

const COLORS = {
    primary: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'],
    severity: { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' },
    status: { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444' }
};

const DefectDashboard: React.FC<DefectDashboardProps> = ({ isOpen, onClose }) => {
    const [stats, setStats] = useState<DefectStats | null>(null);
    const [records, setRecords] = useState<DefectRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<DefectRecord[] | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'list' | 'search'>('overview');

    const typeChartRef = useRef<HTMLCanvasElement>(null);
    const severityChartRef = useRef<HTMLCanvasElement>(null);
    const trendChartRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [statsData, feedbackData] = await Promise.all([
                window.electronAPI.getDefectStats(),
                window.electronAPI.getUserFeedback()
            ]);
            setStats(statsData);
            setRecords(feedbackData);
        } catch (e) {
            console.error('Failed to load dashboard data:', e);
        } finally {
            setLoading(false);
        }
    };

    // 차트 그리기
    useEffect(() => {
        if (!stats || loading) return;
        drawTypeChart();
        drawSeverityChart();
        drawTrendChart();
    }, [stats, loading, activeTab]);

    const drawTypeChart = () => {
        const canvas = typeChartRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const entries = Object.entries(stats?.byType || {});
        if (entries.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#6b7280';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('데이터 없음', canvas.width / 2, canvas.height / 2);
            return;
        }

        const total = entries.reduce((sum, [, count]) => sum + count, 0);
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 40;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let startAngle = -Math.PI / 2;
        entries.forEach(([type, count], index) => {
            const sliceAngle = (count / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
            ctx.closePath();
            ctx.fillStyle = COLORS.primary[index % COLORS.primary.length];
            ctx.fill();
            startAngle += sliceAngle;
        });

        // 범례
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        entries.forEach(([type, count], index) => {
            const y = 15 + index * 18;
            ctx.fillStyle = COLORS.primary[index % COLORS.primary.length];
            ctx.fillRect(5, y - 10, 12, 12);
            ctx.fillStyle = '#e5e7eb';
            ctx.fillText(`${type}: ${count}`, 22, y);
        });
    };

    const drawSeverityChart = () => {
        const canvas = severityChartRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const entries = Object.entries(stats?.bySeverity || {});
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (entries.length === 0) {
            ctx.fillStyle = '#6b7280';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('데이터 없음', canvas.width / 2, canvas.height / 2);
            return;
        }

        const maxCount = Math.max(...entries.map(([, c]) => c), 1);
        const barWidth = 50;
        const gap = 30;
        const chartHeight = canvas.height - 50;
        const startX = (canvas.width - (entries.length * (barWidth + gap) - gap)) / 2;

        entries.forEach(([severity, count], index) => {
            const barHeight = (count / maxCount) * (chartHeight - 20);
            const x = startX + index * (barWidth + gap);
            const y = chartHeight - barHeight;

            ctx.fillStyle = COLORS.severity[severity as keyof typeof COLORS.severity] || '#6b7280';
            ctx.fillRect(x, y, barWidth, barHeight);

            ctx.fillStyle = '#e5e7eb';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(severity, x + barWidth / 2, chartHeight + 15);
            ctx.fillText(count.toString(), x + barWidth / 2, y - 5);
        });
    };

    const drawTrendChart = () => {
        const canvas = trendChartRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const data = stats?.recentTrend || [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (data.length === 0) {
            ctx.fillStyle = '#6b7280';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('최근 7일 데이터 없음', canvas.width / 2, canvas.height / 2);
            return;
        }

        const padding = 40;
        const chartWidth = canvas.width - padding * 2;
        const chartHeight = canvas.height - padding * 2;
        const maxCount = Math.max(...data.map(d => d.count), 1);

        // 그리드
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(canvas.width - padding, y);
            ctx.stroke();
        }

        // 라인 차트
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.forEach((d, index) => {
            const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
            const y = padding + chartHeight - (d.count / maxCount) * chartHeight;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 포인트
        data.forEach((d, index) => {
            const x = padding + (chartWidth / (data.length - 1 || 1)) * index;
            const y = padding + chartHeight - (d.count / maxCount) * chartHeight;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f1';
            ctx.fill();

            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(d.date.slice(5), x, canvas.height - 10);
        });
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }
        try {
            const results = await window.electronAPI.searchDefects(searchQuery);
            setSearchResults(results.map((r: any) => ({
                id: r.id,
                imageId: r.image_id,
                analysis: {
                    defectType: r.defect_type,
                    severity: r.severity,
                    description: r.description,
                    possibleCauses: r.possible_causes,
                    countermeasures: r.countermeasures
                },
                timestamp: r.created_at,
                status: r.status
            })));
            setActiveTab('search');
        } catch (e) {
            console.error('Search failed:', e);
        }
    };

    const [exportLoading, setExportLoading] = useState(false);

    const handleExport = async () => {
        if (exportLoading) return;
        if (!confirm("검증된 모든 데이터를 ZIP 파일로 내보내시겠습니까?")) return;

        setExportLoading(true);
        try {
            const result = await window.electronAPI.exportVerifiedData();
            if (result.success) {
                alert(result.message);
            } else {
                alert(result.message || '내보내기 실패');
            }
        } catch (e) {
            console.error(e);
            alert('내보내기 중 오류 발생');
        } finally {
            setExportLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-white">📊 불량 데이터 대시보드</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-300 hover:text-white hover:bg-red-600 px-3 py-1 rounded text-xl font-bold transition-colors"
                        title="닫기"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs & Actions */}
                <div className="flex border-b border-gray-700 px-6 bg-gray-800/50">
                    {[
                        { id: 'overview', label: '📊 개요' },
                        { id: 'list', label: '📋 목록' },
                        { id: 'search', label: '🔍 검색' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-3 font-medium transition-colors ${activeTab === tab.id
                                ? 'text-indigo-400 border-b-2 border-indigo-400'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}

                    {/* Search bar & Export */}
                    <div className="ml-auto flex items-center gap-2 py-2">
                        <button
                            onClick={handleExport}
                            disabled={exportLoading}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1 ${exportLoading ? 'bg-gray-600 cursor-not-allowed text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'}`}
                        >
                            {exportLoading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <span>📥</span>}
                            검증 데이터 내보내기
                        </button>
                        <div className="w-px h-6 bg-gray-600 mx-2"></div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="결함 검색..."
                            className="bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                            onClick={handleSearch}
                            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                        >
                            검색
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <SpinnerIcon className="w-8 h-8 animate-spin text-indigo-500" />
                        </div>
                    ) : activeTab === 'overview' ? (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl p-4 text-white">
                                    <div className="text-3xl font-bold">{stats?.total || 0}</div>
                                    <div className="text-indigo-200 text-sm">전체 결함</div>
                                </div>
                                <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-xl p-4 text-white">
                                    <div className="text-3xl font-bold">{stats?.bySeverity?.High || 0}</div>
                                    <div className="text-red-200 text-sm">고위험</div>
                                </div>
                                <div className="bg-gradient-to-br from-amber-600 to-amber-800 rounded-xl p-4 text-white">
                                    <div className="text-3xl font-bold">{stats?.byStatus?.pending || 0}</div>
                                    <div className="text-amber-200 text-sm">검토 대기</div>
                                </div>
                                <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-4 text-white">
                                    <div className="text-3xl font-bold">{stats?.byStatus?.approved || 0}</div>
                                    <div className="text-green-200 text-sm">승인됨</div>
                                </div>
                            </div>

                            {/* Charts */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-gray-800 rounded-xl p-4">
                                    <h3 className="text-white font-medium mb-3">결함 유형별</h3>
                                    <canvas ref={typeChartRef} width={250} height={200} />
                                </div>
                                <div className="bg-gray-800 rounded-xl p-4">
                                    <h3 className="text-white font-medium mb-3">심각도별</h3>
                                    <canvas ref={severityChartRef} width={250} height={200} />
                                </div>
                                <div className="bg-gray-800 rounded-xl p-4">
                                    <h3 className="text-white font-medium mb-3">최근 7일 추이</h3>
                                    <canvas ref={trendChartRef} width={250} height={200} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* List / Search Results */
                        <div className="space-y-3">
                            {(activeTab === 'search' && searchResults !== null ? searchResults : records).length === 0 ? (
                                <div className="text-center text-gray-400 py-12">
                                    {activeTab === 'search' ? '검색 결과가 없습니다.' : '결함 기록이 없습니다.'}
                                </div>
                            ) : (
                                (activeTab === 'search' && searchResults !== null ? searchResults : records).map(record => (
                                    <div key={record.id} className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${record.analysis?.severity === 'High' ? 'bg-red-500/20 text-red-400' :
                                                        record.analysis?.severity === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-green-500/20 text-green-400'
                                                        }`}>
                                                        {record.analysis?.severity || 'N/A'}
                                                    </span>
                                                    <span className="text-white font-medium">
                                                        {record.analysis?.defectType || '미분류'}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs ${record.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                                        record.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-amber-500/20 text-amber-400'
                                                        }`}>
                                                        {record.status}
                                                    </span>
                                                </div>
                                                <p className="text-gray-300 text-sm line-clamp-2">
                                                    {record.analysis?.description || '설명 없음'}
                                                </p>
                                            </div>
                                            <div className="text-gray-500 text-xs">
                                                {new Date(record.timestamp).toLocaleDateString('ko-KR')}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DefectDashboard;
