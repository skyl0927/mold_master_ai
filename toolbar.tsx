
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';

const CaptureToolbar: React.FC = () => {

  const handleCapture = () => {
    window.electronAPI.initiateRegionCapture();
  };

  const handleCancel = () => {
    window.electronAPI.cancelCapture();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        handleCapture();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="w-full h-full bg-gray-900 bg-opacity-80 rounded-lg flex items-center justify-center p-2 gap-2 shadow-2xl border border-gray-700">
        <style>{`
          .draggable {
            -webkit-app-region: drag;
          }
          .no-drag {
            -webkit-app-region: no-drag;
          }
        `}</style>
        <div className="flex-grow draggable"></div>
        <button
            onClick={handleCapture}
            className="no-drag bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-4 rounded text-sm transition-colors"
        >
            영역 캡처 (s)
        </button>
        <button
            onClick={handleCancel}
            className="no-drag bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-4 rounded text-sm transition-colors"
        >
            취소 (Esc)
        </button>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <CaptureToolbar />
        </React.StrictMode>
    );
}
