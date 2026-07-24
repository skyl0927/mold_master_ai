import React, { useState, useEffect } from 'react';
import { CloseIcon, PptIcon, SpinnerIcon } from './Icons';

interface ReportLayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (layoutId: string, isVerified: boolean) => void;
}

interface Layout {
    id: string;
    name: string;
    description: string;
    type: string;
    perSlideItems: number;
}

const ReportLayoutModal: React.FC<ReportLayoutModalProps> = ({ isOpen, onClose, onGenerate }) => {
    const [layouts, setLayouts] = useState<Layout[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isVerified, setIsVerified] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadLayouts();
        }
    }, [isOpen]);

    const loadLayouts = async () => {
        setLoading(true);
        try {
            const data = await window.electronAPI.getReportLayouts();
            setLayouts(data);
            if (data.length > 0 && !selectedId) {
                setSelectedId(data[0].id);
            }
        } catch (e) {
            console.error("Failed to load layouts", e);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-xl w-full max-w-2xl shadow-2xl border border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center">
                            <PptIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">리포트 생성 마법사</h2>
                            <p className="text-sm text-gray-400">원하는 리포트 양식을 선택하세요.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                        <CloseIcon className="w-6 h-6 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <SpinnerIcon className="w-8 h-8 animate-spin text-orange-500" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {layouts.map(layout => (
                                <div
                                    key={layout.id}
                                    onClick={() => setSelectedId(layout.id)}
                                    className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedId === layout.id
                                        ? 'border-orange-500 bg-orange-900/10'
                                        : 'border-gray-700 hover:border-gray-500 bg-gray-750'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-white">{layout.name}</h3>
                                        {selectedId === layout.id && (
                                            <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">선택됨</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-400 mb-3 min-h-[40px]">{layout.description}</p>
                                    <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-gray-700 pt-3">
                                        <span className="flex items-center gap-1">
                                            📄 슬라이드당 {layout.perSlideItems}개 항목
                                        </span>
                                        <span className="flex items-center gap-1 uppercase">
                                            Format: {layout.type}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-750 border-t border-gray-700">
                    <div className="flex items-center mb-4 p-3 bg-gray-800 rounded-lg border border-gray-600">
                        <input
                            type="checkbox"
                            id="quality-verify"
                            className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 bg-gray-700 border-gray-500"
                            checked={isVerified}
                            onChange={(e) => setIsVerified(e.target.checked)}
                        />
                        <label htmlFor="quality-verify" className="ml-3 text-sm text-gray-300 select-none cursor-pointer">
                            <span className="font-bold text-white">AI 학습 데이터 품질 승인</span>
                            <span className="block text-xs text-gray-500 mt-0.5">
                                이 리포트의 검토 내용을 향후 AI 학습 데이터로 사용하는 것에 동의합니다. (검증된 데이터)
                            </span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white transition-colors">
                            취소
                        </button>
                        <button
                            onClick={() => selectedId && onGenerate(selectedId, isVerified)}
                            disabled={!selectedId}
                            className={`px-5 py-2 rounded-lg font-bold text-white flex items-center gap-2 transition-colors ${selectedId ? 'bg-orange-600 hover:bg-orange-500' : 'bg-gray-600 cursor-not-allowed'
                                }`}
                        >
                            <PptIcon className="w-5 h-5" />
                            리포트 생성
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReportLayoutModal;
