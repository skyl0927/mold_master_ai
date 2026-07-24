import React, { MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

type Point = { x: number; y: number };

const MIN_SELECTION_SIZE = 10;

const RegionSelector: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [statusText, setStatusText] = useState('캡처 화면을 준비하는 중입니다...');

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (backgroundImage) {
      ctx.drawImage(backgroundImage, 0, 0, width, height);
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, width, height);

    if (!startPoint || !endPoint) return;

    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);
    const selectionWidth = Math.abs(startPoint.x - endPoint.x);
    const selectionHeight = Math.abs(startPoint.y - endPoint.y);

    if (selectionWidth <= 0 || selectionHeight <= 0) return;

    if (backgroundImage) {
      const sourceScaleX = backgroundImage.naturalWidth / width;
      const sourceScaleY = backgroundImage.naturalHeight / height;
      ctx.drawImage(
        backgroundImage,
        x * sourceScaleX,
        y * sourceScaleY,
        selectionWidth * sourceScaleX,
        selectionHeight * sourceScaleY,
        x,
        y,
        selectionWidth,
        selectionHeight
      );
    } else {
      ctx.clearRect(x, y, selectionWidth, selectionHeight);
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, selectionWidth, selectionHeight);

    const label = `${Math.round(selectionWidth)} x ${Math.round(selectionHeight)} px`;
    ctx.font = '12px sans-serif';
    const textWidth = ctx.measureText(label).width;
    const labelX = x;
    const labelY = Math.max(18, y - 8);

    ctx.fillStyle = 'rgba(17, 24, 39, 0.95)';
    ctx.fillRect(labelX - 6, labelY - 14, textWidth + 12, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, labelX, labelY);
  }, [backgroundImage, endPoint, startPoint]);

  useEffect(() => {
    let cancelled = false;

    const loadBackground = async () => {
      try {
        const capture = await window.electronAPI.getCaptureData();
        if (cancelled) return;

        if (!capture?.dataUrl) {
          setStatusText('배경 화면을 불러오지 못했습니다. ESC로 취소 후 다시 시도해 주세요.');
          setIsPreparing(false);
          return;
        }

        const image = new Image();
        image.onload = () => {
          if (cancelled) return;
          setBackgroundImage(image);
          setStatusText('영역을 클릭한 뒤 드래그해서 선택하세요. ESC로 취소할 수 있습니다.');
          setIsPreparing(false);
        };
        image.onerror = () => {
          if (cancelled) return;
          setStatusText('캡처 배경을 표시하지 못했습니다. ESC로 취소 후 다시 시도해 주세요.');
          setIsPreparing(false);
        };
        image.src = capture.dataUrl;
      } catch (error) {
        console.error('Failed to load capture background', error);
        if (!cancelled) {
          setStatusText('캡처 화면 준비 중 오류가 발생했습니다. ESC로 취소 후 다시 시도해 주세요.');
          setIsPreparing(false);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.electronAPI.cancelCapture();
      }
    };

    const handleResize = () => draw();

    void loadBackground();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getCanvasPoint = (event: MouseEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? event.currentTarget.width / bounds.width : 1;
    const scaleY = bounds.height > 0 ? event.currentTarget.height / bounds.height : 1;

    return {
      x: Math.round((event.clientX - bounds.left) * scaleX),
      y: Math.round((event.clientY - bounds.top) * scaleY),
    };
  };

  const handleMouseDown = (event: MouseEvent<HTMLCanvasElement>) => {
    if (isPreparing || isCapturing) return;

    const point = getCanvasPoint(event);
    void window.electronAPI.debugCapturePointer({
      phase: 'down',
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      point,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
    });
    setIsSelecting(true);
    setStartPoint(point);
    setEndPoint(point);
  };

  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting || isPreparing || isCapturing) return;
    const point = getCanvasPoint(event);
    setEndPoint(point);
  };

  const resetSelection = () => {
    setStartPoint(null);
    setEndPoint(null);
    setIsSelecting(false);
  };

  const handleMouseUp = async () => {
    if (!isSelecting || !startPoint || !endPoint) {
      setIsSelecting(false);
      return;
    }

    void window.electronAPI.debugCapturePointer({
      phase: 'up',
      startPoint,
      endPoint,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
    });

    const logicalWidth = Math.abs(startPoint.x - endPoint.x);
    const logicalHeight = Math.abs(startPoint.y - endPoint.y);

    if (logicalWidth < MIN_SELECTION_SIZE || logicalHeight < MIN_SELECTION_SIZE) {
      resetSelection();
      return;
    }

    const logicalX = Math.min(startPoint.x, endPoint.x);
    const logicalY = Math.min(startPoint.y, endPoint.y);

    setIsSelecting(false);
    setIsCapturing(true);
    setStatusText('선택한 영역을 캡처하는 중입니다...');

    try {
      await window.electronAPI.performRegionCapture({
        x: logicalX,
        y: logicalY,
        width: logicalWidth,
        height: logicalHeight,
      });
    } catch (error) {
      console.error('Capture failed', error);
      setIsCapturing(false);
      setStatusText('캡처에 실패했습니다. 다시 시도해 주세요.');
      resetSelection();
    }
  };

  return (
    <div className="fixed inset-0 z-50 cursor-crosshair">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${isPreparing || isCapturing ? 'pointer-events-none' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="rounded-full border border-gray-600 bg-gray-900/90 px-6 py-3 font-medium text-white shadow-lg whitespace-nowrap">
          {statusText}
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RegionSelector />
    </React.StrictMode>
  );
}
