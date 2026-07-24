import React, { useEffect, useRef, useState } from 'react';
import { CameraIcon, CloseIcon } from './Icons';

interface CameraCaptureProps {
    onCapture: (dataUrl: string) => void;
    onClose: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');

    const stopStream = () => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach(track => track.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
    };

    const startStream = async (deviceId: string) => {
        stopStream();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (error) {
            console.error('Camera Error:', error);
        }
    };

    useEffect(() => {
        navigator.mediaDevices.enumerateDevices()
            .then(mediaDevices => {
                const videoDevices = mediaDevices.filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                if (videoDevices.length > 0) setSelectedDeviceId(videoDevices[0].deviceId);
            })
            .catch(error => console.error('Camera enumeration error:', error));

        return stopStream;
    }, []);

    useEffect(() => {
        if (selectedDeviceId) void startStream(selectedDeviceId);
    }, [selectedDeviceId]);

    const captureFrame = (): string | null => {
        if (!videoRef.current) return null;

        const width = resolution === '1080p' ? 1920 : 1280;
        const height = resolution === '1080p' ? 1080 : 720;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return null;

        context.drawImage(videoRef.current, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.95);
    };

    const handleSnapshot = () => {
        const data = captureFrame();
        if (data) onCapture(data);
    };

    const handleClose = () => {
        stopStream();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col">
            <div className="p-4 bg-gray-900 flex flex-wrap gap-4 justify-between items-center border-b border-gray-800 shadow-xl z-50">
                <div className="flex gap-4 items-center overflow-x-auto pb-1 sm:pb-0">
                    <h2 className="text-white font-bold text-xl flex items-center gap-2 whitespace-nowrap mr-2">
                        <CameraIcon className="w-6 h-6 text-indigo-500" />
                        External Camera
                    </h2>

                    <div className="h-8 w-px bg-gray-700 mx-2 hidden md:block" />

                    <select
                        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm focus:border-indigo-500 outline-none transition-colors hover:border-gray-500"
                        value={selectedDeviceId}
                        onChange={event => setSelectedDeviceId(event.target.value)}
                    >
                        {devices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                            </option>
                        ))}
                    </select>

                    <select
                        value={resolution}
                        onChange={event => setResolution(event.target.value as '1080p' | '720p')}
                        className="bg-gray-800 text-white border border-gray-700 rounded px-2 py-1 text-sm focus:border-indigo-500 outline-none transition-colors hover:border-gray-500"
                    >
                        <option value="1080p">FHD (1920x1080)</option>
                        <option value="720p">HD (1280x720)</option>
                    </select>
                </div>

                <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-full transition-colors"
                    aria-label="Close camera"
                >
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-grow bg-black relative flex items-center justify-center overflow-hidden">
                <div className={`relative transition-all duration-300 ${resolution === '1080p' ? 'max-w-full' : 'max-w-[80%]'}`}>
                    <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[85vh] object-contain shadow-2xl" />
                    <div className="absolute bottom-4 left-4 text-xs font-mono text-gray-500 bg-black/70 px-2 py-1 rounded backdrop-blur-sm border border-gray-800">
                        Target: {resolution === '1080p' ? '1920x1080' : '1280x720'} | Format: JPEG(95%)
                    </div>
                </div>
            </div>

            <div className="bg-gray-900 p-6 border-t border-gray-800 z-50">
                <div className="flex items-center justify-center">
                    <button
                        onClick={handleSnapshot}
                        className="flex flex-col items-center gap-2 group transition-transform hover:scale-105 active:scale-95"
                        title="Capture Single Frame"
                    >
                        <div className="w-16 h-16 rounded-full bg-white border-4 border-gray-300 group-hover:border-indigo-500 transition-colors flex items-center justify-center shadow-lg">
                            <div className="w-12 h-12 bg-gray-100 rounded-full border border-gray-200" />
                        </div>
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white">Snapshot</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CameraCapture;
