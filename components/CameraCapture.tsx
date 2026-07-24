import React, { useEffect, useRef, useState } from 'react';
import { CameraIcon, CloseIcon } from './Icons';
import {
    CaptureImageKind,
    CaptureSource,
    CaptureViewTag
} from '../types';
import {
    CAPTURE_VIEW_OPTIONS,
    CaptureSessionSummary
} from '../captureSessionProtocol';

export interface CameraCaptureMetadata {
    captureSessionId: string;
    captureViewTag: CaptureViewTag;
    captureImageKind: CaptureImageKind;
    captureSource: CaptureSource;
}

interface CameraCaptureProps {
    sessionId: string;
    sessionSummary: CaptureSessionSummary;
    onCapture: (dataUrl: string, metadata: CameraCaptureMetadata) => void;
    onNewSession: () => void;
    onClose: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({
    sessionId,
    sessionSummary,
    onCapture,
    onNewSession,
    onClose
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
    const [selectedViewTag, setSelectedViewTag] = useState<CaptureViewTag>('full_part_context');
    const [cameraError, setCameraError] = useState('');
    const [lastCaptureMessage, setLastCaptureMessage] = useState('');

    const stopStream = () => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startStream = async (deviceId: string) => {
        stopStream();
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (error) {
            console.error('Camera Error:', error);
            setCameraError('카메라를 시작할 수 없습니다. 장치 연결과 카메라 권한을 확인하세요.');
        }
    };

    useEffect(() => {
        navigator.mediaDevices.enumerateDevices()
            .then(mediaDevices => {
                const videoDevices = mediaDevices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                if (videoDevices.length > 0) {
                    setSelectedDeviceId(videoDevices[0].deviceId);
                } else {
                    setCameraError('사용 가능한 카메라가 없습니다.');
                }
            })
            .catch(error => {
                console.error('Camera enumeration error:', error);
                setCameraError('카메라 목록을 읽을 수 없습니다.');
            });

        return stopStream;
    }, []);

    useEffect(() => {
        if (selectedDeviceId) void startStream(selectedDeviceId);
    }, [selectedDeviceId]);

    useEffect(() => {
        const nextRequiredView = sessionSummary.missingViews[0];
        if (nextRequiredView) setSelectedViewTag(nextRequiredView);
        setLastCaptureMessage('');
    }, [sessionId, sessionSummary.missingViews.join('|')]);

    const captureFrame = (): string | null => {
        if (!videoRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            setCameraError('카메라 영상이 준비된 후 다시 촬영하세요.');
            return null;
        }

        const width = resolution === '1080p' ? 1920 : 1280;
        const height = resolution === '1080p' ? 1080 : 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) {
            setCameraError('촬영 프레임을 생성할 수 없습니다.');
            return null;
        }

        context.drawImage(videoRef.current, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.95);
    };

    const handleSnapshot = () => {
        const dataUrl = captureFrame();
        if (!dataUrl) return;

        const view = CAPTURE_VIEW_OPTIONS.find(option => option.value === selectedViewTag);
        onCapture(dataUrl, {
            captureSessionId: sessionId,
            captureViewTag: selectedViewTag,
            captureImageKind: 'physical_product',
            captureSource: 'camera'
        });
        setLastCaptureMessage(`${view?.label || selectedViewTag} 촬영 완료`);
    };

    const handleClose = () => {
        stopStream();
        onClose();
    };

    const handleNewSession = () => {
        onNewSession();
        setSelectedViewTag('full_part_context');
        setLastCaptureMessage('');
    };

    return (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
            <div className="p-4 bg-gray-900 flex flex-wrap gap-4 justify-between items-center border-b border-gray-800 shadow-xl z-50">
                <div className="flex flex-wrap gap-3 items-center">
                    <h2 className="text-white font-bold text-xl flex items-center gap-2 whitespace-nowrap mr-2">
                        <CameraIcon className="w-6 h-6 text-cyan-400" />
                        다중 시점 촬영
                    </h2>

                    <span className="rounded-full border border-cyan-700/70 bg-cyan-950/40 px-3 py-1 text-xs text-cyan-200">
                        세션 {sessionId.slice(-12)}
                    </span>

                    <select
                        aria-label="카메라 장치"
                        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm focus:border-cyan-500 outline-none"
                        value={selectedDeviceId}
                        onChange={event => setSelectedDeviceId(event.target.value)}
                    >
                        {devices.length === 0 && <option value="">카메라 검색 중</option>}
                        {devices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                            </option>
                        ))}
                    </select>

                    <select
                        aria-label="카메라 해상도"
                        value={resolution}
                        onChange={event => setResolution(event.target.value as '1080p' | '720p')}
                        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm focus:border-cyan-500 outline-none"
                    >
                        <option value="1080p">FHD (1920x1080)</option>
                        <option value="720p">HD (1280x720)</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleNewSession}
                        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-bold text-gray-200 hover:border-cyan-600 hover:text-white"
                    >
                        새 촬영 세션
                    </button>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-full transition-colors"
                        aria-label="카메라 닫기"
                    >
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            <div className="grid flex-grow min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="bg-black relative flex items-center justify-center overflow-hidden">
                    <div className={`relative transition-all duration-300 ${resolution === '1080p' ? 'max-w-full' : 'max-w-[80%]'}`}>
                        <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[76vh] object-contain shadow-2xl" />
                        <div className="absolute bottom-4 left-4 text-xs font-mono text-gray-300 bg-black/75 px-2 py-1 rounded border border-gray-800">
                            {resolution === '1080p' ? '1920x1080' : '1280x720'} · JPEG 95%
                        </div>
                    </div>
                    {cameraError && (
                        <div className="absolute inset-x-6 top-6 rounded-lg border border-red-700 bg-red-950/90 px-4 py-3 text-sm text-red-100">
                            {cameraError}
                        </div>
                    )}
                </div>

                <aside className="overflow-y-auto border-l border-gray-800 bg-gray-950 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">촬영 프로토콜</p>
                    <h3 className="mt-2 text-lg font-bold text-white">
                        {sessionSummary.ready ? '기본 시점 충족' : '필수 시점 촬영 필요'}
                    </h3>
                    <p className={`mt-2 text-sm ${sessionSummary.ready ? 'text-emerald-300' : 'text-amber-200'}`}>
                        {sessionSummary.message}
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {(['full_part_context', 'defect_closeup'] as CaptureViewTag[]).map(viewTag => {
                            const option = CAPTURE_VIEW_OPTIONS.find(item => item.value === viewTag);
                            const captured = sessionSummary.availableViews.includes(viewTag);
                            return (
                                <div
                                    key={viewTag}
                                    className={`rounded-lg border px-3 py-3 text-xs ${
                                        captured
                                            ? 'border-emerald-700 bg-emerald-950/30 text-emerald-200'
                                            : 'border-amber-700 bg-amber-950/20 text-amber-100'
                                    }`}
                                >
                                    <span className="block font-bold">{option?.label}</span>
                                    <span className="mt-1 block opacity-80">{captured ? '촬영 완료' : '미촬영'}</span>
                                </div>
                            );
                        })}
                    </div>

                    <label className="mt-6 block">
                        <span className="mb-2 block text-xs font-bold text-gray-300">이번 사진의 촬영 시점</span>
                        <select
                            aria-label="카메라 촬영 시점"
                            value={selectedViewTag}
                            onChange={event => setSelectedViewTag(event.target.value as CaptureViewTag)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                        >
                            {CAPTURE_VIEW_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <p className="mt-3 rounded-lg bg-gray-900 px-3 py-3 text-xs leading-5 text-gray-400">
                        {CAPTURE_VIEW_OPTIONS.find(option => option.value === selectedViewTag)?.instruction}
                    </p>

                    <div className="mt-6 text-xs text-gray-500">
                        현재 세션 {sessionSummary.imageCount}장 · 유효 시점 {sessionSummary.uniqueViewCount}개
                    </div>
                    {lastCaptureMessage && (
                        <div className="mt-3 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
                            {lastCaptureMessage}
                        </div>
                    )}
                </aside>
            </div>

            <div className="bg-gray-900 p-5 border-t border-gray-800 z-50">
                <div className="flex flex-wrap items-center justify-center gap-6">
                    <button
                        onClick={handleSnapshot}
                        className="flex items-center gap-4 rounded-full border border-gray-700 bg-gray-950 px-6 py-3 text-white transition hover:border-cyan-500 hover:bg-gray-800 active:scale-95"
                        title="선택한 시점으로 촬영"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-gray-300 bg-white">
                            <span className="h-8 w-8 rounded-full border border-gray-300 bg-gray-100" />
                        </span>
                        <span className="text-left">
                            <span className="block text-sm font-bold">
                                {CAPTURE_VIEW_OPTIONS.find(option => option.value === selectedViewTag)?.label} 촬영
                            </span>
                            <span className="block text-xs text-gray-400">촬영 후 카메라는 계속 유지됩니다.</span>
                        </span>
                    </button>

                    <button
                        onClick={handleClose}
                        className={`rounded-xl px-6 py-3 text-sm font-bold ${
                            sessionSummary.ready
                                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                                : 'border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                    >
                        {sessionSummary.ready ? '촬영 완료' : '나중에 계속 촬영'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CameraCapture;
