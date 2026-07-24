
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Point, TextAnnotation, Shape, ShapeTool } from '../types';
import { SaveIcon, TextIcon, PenIcon, RectangleIcon, CircleIcon, BlurIcon, NumberIcon, CursorArrowIcon, RulerIcon, TrashIcon, ScissorIcon, CopyIcon, EyeDropperIcon, PaletteIcon, SquareOutlineIcon, SquareFillIcon, LineSolidIcon, LineDashedIcon, DiagonalLineIcon, CalloutIcon } from './Icons';
import { translateText } from '../services/aiService';

// Add type definition for the experimental EyeDropper API
declare global {
    interface Window {
        EyeDropper: new () => {
            open: (options?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
        };
    }
}

interface EditingImage {
    id?: string;
    baseImageUrl: string;
    annotations: TextAnnotation[];
    shapes?: Shape[];
}

interface AnnotationCanvasProps {
    editingImage: EditingImage;
    onSave: (savedData: { id?: string; baseImageUrl: string; dataUrl: string; annotations: TextAnnotation[], shapes: Shape[] }) => void;
    onCancel: () => void;
}

// Arrow is now handled as a ShapeTool inside 'arrow'
type Tool = 'select' | 'text' | ShapeTool | 'circle' | 'crop';

// Inline Input State Interface
interface EditTextState {
    id: string; // Shape ID or Annotation ID
    type: 'annotation' | 'dimension';
    text: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot';

// Predefined Palette Colors (MS Paint style)
const DEFAULT_PALETTE = [
    '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
    '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7'
];

// ----- Image Layer Cache & Resize Handle helpers -----
const IMAGE_CACHE = new Map<string, HTMLImageElement>();
const HANDLE_SIZE = 8; // px, half-size of resize handle
type ResizeHandle = 'tl' | 'tc' | 'tr' | 'ml' | 'mr' | 'bl' | 'bc' | 'br' | 'rot';

function getImageElement(url: string): HTMLImageElement | null {
    if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url)!;
    const img = new Image();
    img.src = url;
    img.onload = () => { IMAGE_CACHE.set(url, img); };
    if (img.complete && img.naturalWidth > 0) { IMAGE_CACHE.set(url, img); return img; }
    return null;
}

function rotatePoint(p: Point, cx: number, cy: number, angle: number): Point {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    p.x -= cx;
    p.y -= cy;
    const xnew = p.x * c - p.y * s;
    const ynew = p.x * s + p.y * c;
    return { x: xnew + cx, y: ynew + cy };
}

function getResizeHandles(p0: Point, p1: Point): { handle: ResizeHandle; x: number; y: number }[] {
    const x0 = Math.min(p0.x, p1.x), y0 = Math.min(p0.y, p1.y);
    const x1 = Math.max(p0.x, p1.x), y1 = Math.max(p0.y, p1.y);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    return [
        { handle: 'tl', x: x0, y: y0 }, { handle: 'tc', x: mx, y: y0 }, { handle: 'tr', x: x1, y: y0 },
        { handle: 'ml', x: x0, y: my }, { handle: 'mr', x: x1, y: my },
        { handle: 'bl', x: x0, y: y1 }, { handle: 'bc', x: mx, y: y1 }, { handle: 'br', x: x1, y: y1 },
        { handle: 'rot', x: mx, y: y0 - 30 } // Rotation handle above top-center
    ];
}

function hitTestHandle(point: Point, p0: Point, p1: Point): ResizeHandle | null {
    const handles = getResizeHandles(p0, p1);
    for (const h of handles) {
        if (Math.abs(point.x - h.x) <= HANDLE_SIZE + 2 && Math.abs(point.y - h.y) <= HANDLE_SIZE + 2) return h.handle;
    }
    return null;
}

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({ editingImage, onSave, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Data State
    const [annotations, setAnnotations] = useState<TextAnnotation[]>(editingImage.annotations);
    const [shapes, setShapes] = useState<Shape[]>(editingImage.shapes || []);

    // UI State
    const [tool, setTool] = useState<Tool>('select');
    const [currentText, setCurrentText] = useState('');

    const [isDrawing, setIsDrawing] = useState(false);
    const [isErasing, setIsErasing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [nextStepNumber, setNextStepNumber] = useState(1);
    const [mousePos, setMousePos] = useState<Point | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Selection & Dragging
    const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [draggingPart, setDraggingPart] = useState<'body' | 'text' | null>(null);
    const [dragStartPos, setDragStartPos] = useState<Point | null>(null);

    // Image resize handle state
    const [resizingHandle, setResizingHandle] = useState<ResizeHandle | null>(null);
    const dragStartShapeRef = useRef<Shape | null>(null);

    // In-Place Editing State
    const [editTextState, setEditTextState] = useState<EditTextState | null>(null);

    // Styles
    const [fontSize, setFontSize] = useState(24);
    const [lineWidth, setLineWidth] = useState(4);
    const [color, setColor] = useState('#FF4500');          // 선색/도형색
    const [bgColor, setBgColor] = useState('rgba(0,0,0,0.7)'); // 배경색
    const [textColor, setTextColor] = useState('#FFFFFF');     // 글자색
    const [colorMode, setColorMode] = useState<'line' | 'bg' | 'text'>('line'); // 현재 색상 편집 모드
    const [opacity, setOpacity] = useState(1);
    const [fillStyle, setFillStyle] = useState<'outline' | 'fill'>('outline');
    const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
    const [arrowHeadStyle, setArrowHeadStyle] = useState<'arrow' | 'circle' | 'none'>('arrow');
    const [paletteColors, setPaletteColors] = useState<string[]>(DEFAULT_PALETTE);

    useEffect(() => {
        const savedPalette = localStorage.getItem('moldMasterPalette');
        if (savedPalette) {
            try {
                setPaletteColors(JSON.parse(savedPalette));
            } catch (e) { }
        }
    }, []);

    const updateColorAndPalette = (newColor: string) => {
        if (colorMode === 'line') setColor(newColor);
        else if (colorMode === 'bg') setBgColor(newColor);
        else if (colorMode === 'text') setTextColor(newColor);

        // If color is not in palette, replace the last color (or a history slot)
        if (!paletteColors.includes(newColor)) {
            const newPalette = [...paletteColors];
            newPalette.pop(); // Remove the last color
            newPalette.unshift(newColor); // Add new color to the beginning
            setPaletteColors(newPalette);
            localStorage.setItem('moldMasterPalette', JSON.stringify(newPalette));
        }
    };

    // Translation State
    const [targetLang, setTargetLang] = useState('en');
    const [isTranslating, setIsTranslating] = useState(false);
    const [translationMessage, setTranslationMessage] = useState('');

    // ----- Image Layer insertion helper -----
    const insertImageLayer = useCallback((dataUrl: string) => {
        const img = new Image();
        img.onload = () => {
            IMAGE_CACHE.set(dataUrl, img);
            const canvas = canvasRef.current;
            if (!canvas) return;
            // Keep original size, only scale DOWN if exceeds canvas
            const maxW = canvas.width * 0.9;
            const maxH = canvas.height * 0.9;
            const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            // Place in center of canvas
            const x = (canvas.width - w) / 2;
            const y = (canvas.height - h) / 2;
            const newShape: Shape = {
                id: Date.now().toString(),
                tool: 'image',
                color: 'transparent',
                lineWidth: 2,
                points: [{ x, y }, { x: x + w, y: y + h }],
                opacity: 1,
                style: 'outline',
                imageUrl: dataUrl,
            };
            setShapes(prev => [...prev, newShape]);
            setSelectedShapeId(newShape.id);
            setSelectedAnnotationId(null);
            setTool('select');
        };
        img.src = dataUrl;
    }, []);

    // ----- WhiteBoard background creation -----
    const createWhiteBoard = useCallback((width: number = 2900, height: number = 1800) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Create blank white canvas at full resolution
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d');
        if (!tCtx) return;
        tCtx.fillStyle = '#FFFFFF';
        tCtx.fillRect(0, 0, width, height);
        const whiteBase = temp.toDataURL('image/png');
        const newImg = new Image();
        newImg.src = whiteBase;
        newImg.onload = () => {
            imageRef.current = newImg;
            // Display canvas scaled to fit viewport (never upscale)
            const maxWidth = window.innerWidth * 0.9;
            const maxHeight = window.innerHeight * 0.7;
            const displayRatio = Math.min(1, maxWidth / width, maxHeight / height);
            canvas.width = width * displayRatio;
            canvas.height = height * displayRatio;
            // Clear existing shapes and annotations for fresh whiteboard
            setShapes([]);
            setAnnotations([]);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        };
    }, []);

    // Clipboard paste handler (Ctrl+V)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    if (!blob) continue;
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (typeof reader.result === 'string') insertImageLayer(reader.result);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [insertImageLayer]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if focus is in an input or textarea
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                return;
            }

            if (e.key === 'a' || e.key === 'A') {
                setTool('select');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    // File input handler
    const handleImageFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') insertImageLayer(reader.result);
        };
        reader.readAsDataURL(file);
        if (e.target) e.target.value = ''; // reset for re-select
    }, [insertImageLayer]);

    useEffect(() => {
        // Auto-increment step number
        const existingSteps = shapes.filter(s => s.tool === 'step').length;
        if (existingSteps > 0) {
            const maxStep = Math.max(...shapes.filter(s => s.tool === 'step').map(s => s.stepNumber || 0));
            setNextStepNumber(maxStep + 1);
        } else {
            setNextStepNumber(1);
        }
    }, []);

    // --- IMMEDIATE STYLE UPDATE EFFECT ---
    // When toolbar properties change, update the currently selected object immediately
    useEffect(() => {
        if (selectedShapeId) {
            setShapes(prev => prev.map(s => {
                if (s.id === selectedShapeId) {
                    // 순번(step)인 경우 color는 bgColor를 사용
                    const updatedColor = s.tool === 'step' ? bgColor : color;
                    return {
                        ...s,
                        color: updatedColor,
                        lineWidth: lineWidth,
                        style: fillStyle,
                        fontSize: fontSize,
                        lineStyle: lineStyle,
                        textColor: textColor
                    };
                }
                return s;
            }));
        }
        if (selectedAnnotationId) {
            setAnnotations(prev => prev.map(a => {
                if (a.id === selectedAnnotationId) {
                    return {
                        ...a,
                        textColor: textColor,  // 글자색
                        backgroundColor: bgColor, // 배경색
                        fontSize: fontSize
                    };
                }
                return a;
            }));
        }
    }, [color, bgColor, textColor, lineWidth, fillStyle, lineStyle, fontSize, selectedShapeId, selectedAnnotationId]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (editTextState) return;

            if (e.key.toLowerCase() === 'a') {
                e.preventDefault();
                setTool('select');
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                handleDeleteSelected();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shapes, annotations, selectedShapeId, selectedAnnotationId, editTextState]);

    // Focus input when editing starts
    useEffect(() => {
        if (editTextState && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editTextState]);

    const handleDeleteSelected = () => {
        if (selectedShapeId) {
            setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
            setSelectedShapeId(null);
        }
        if (selectedAnnotationId) {
            setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
            setSelectedAnnotationId(null);
        }
    };

    const handleUndo = () => {
        if (shapes.length > 0) {
            const lastShape = shapes[shapes.length - 1];
            if (lastShape.tool === 'step') {
                setNextStepNumber(prev => Math.max(1, prev - 1));
            }
            setShapes(prev => prev.slice(0, -1));
        } else if (annotations.length > 0) {
            setAnnotations(prev => prev.slice(0, -1));
        } else {
            setErrorMessage("더 이상 실행 취소할 작업이 없습니다.");
            setTimeout(() => setErrorMessage(''), 2000);
        }
    };

    const getDistanceToLineSegment = (p: Point, v: Point, w: Point) => {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projectionX = v.x + t * (w.x - v.x);
        const projectionY = v.y + t * (w.y - v.y);
        return Math.sqrt((p.x - projectionX) ** 2 + (p.y - projectionY) ** 2);
    };

    const handleEyedropper = async () => {
        if (!window.EyeDropper) {
            alert('이 브라우저는 스포이드 기능을 지원하지 않습니다.');
            return;
        }
        try {
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            updateColorAndPalette(result.sRGBHex);
        } catch (e) {
            console.log('Eyedropper cancelled');
        }
    };

    // --- Drawing Helpers ---

    const setCtxLineStyle = (ctx: CanvasRenderingContext2D, style: LineStyle) => {
        switch (style) {
            case 'dashed': ctx.setLineDash([10, 5]); break;
            case 'dotted': ctx.setLineDash([2, 4]); break;
            case 'dash-dot': ctx.setLineDash([10, 5, 2, 5]); break;
            case 'solid': default: ctx.setLineDash([]); break;
        }
    };

    const drawArrowShape = useCallback((ctx: CanvasRenderingContext2D, from: Point, to: Point, arrowColor: string, arrowWidth: number, style: LineStyle) => {
        const headlen = 15 + (arrowWidth * 3); // Scale arrowhead with thickness
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);

        // Calculate arrowhead base point (where the shaft should stop)
        const baseX = to.x - headlen * Math.cos(angle);
        const baseY = to.y - headlen * Math.sin(angle);

        ctx.save();
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = arrowWidth;
        ctx.lineCap = 'round';

        setCtxLineStyle(ctx, style);

        // Draw Line (Shaft) — stop at arrowhead base, not at tip
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();

        // Draw Head (Solid Triangle)
        ctx.setLineDash([]);
        ctx.fillStyle = arrowColor;
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(to.x, to.y); // Tip
        ctx.lineTo(
            to.x - headlen * Math.cos(angle - Math.PI / 6),
            to.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            to.x - headlen * Math.cos(angle + Math.PI / 6),
            to.y - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }, []);

    const drawDimension = useCallback((ctx: CanvasRenderingContext2D, shape: Shape, isSelected: boolean, isSaving: boolean) => {
        const start = shape.points[0];
        const end = shape.points[1];
        if (!start || !end) return;

        ctx.save();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.lineWidth;
        ctx.fillStyle = shape.color;

        setCtxLineStyle(ctx, shape.lineStyle || 'solid');

        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headlen = 10;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw Arrows for Dimension
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + headlen * Math.cos(angle + Math.PI / 6), start.y + headlen * Math.sin(angle + Math.PI / 6));
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + headlen * Math.cos(angle - Math.PI / 6), start.y + headlen * Math.sin(angle - Math.PI / 6));

        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headlen * Math.cos(angle + Math.PI / 6), end.y - headlen * Math.sin(angle + Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headlen * Math.cos(angle - Math.PI / 6), end.y - headlen * Math.sin(angle - Math.PI / 6));
        ctx.stroke();

        const capLen = 10;
        ctx.beginPath();
        ctx.moveTo(start.x + capLen * Math.cos(angle + Math.PI / 2), start.y + capLen * Math.sin(angle + Math.PI / 2));
        ctx.lineTo(start.x + capLen * Math.cos(angle - Math.PI / 2), start.y + capLen * Math.sin(angle - Math.PI / 2));
        ctx.moveTo(end.x + capLen * Math.cos(angle + Math.PI / 2), end.y + capLen * Math.sin(angle + Math.PI / 2));
        ctx.lineTo(end.x + capLen * Math.cos(angle - Math.PI / 2), end.y + capLen * Math.sin(angle - Math.PI / 2));
        ctx.stroke();

        let tx = shape.textPos ? shape.textPos.x : (start.x + end.x) / 2;
        let ty = shape.textPos ? shape.textPos.y : (start.y + end.y) / 2 - 15;

        if (shape.text && editTextState?.id !== shape.id) {
            const textSize = shape.fontSize || 16;
            ctx.font = `bold ${textSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const metrics = ctx.measureText(shape.text);
            const padding = 4;
            const bx = tx - metrics.width / 2 - padding;
            const by = ty - (textSize / 2) - padding;
            const bw = metrics.width + padding * 2;
            const bh = textSize + padding * 2;

            ctx.fillStyle = 'white';
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, bw, bh);

            ctx.fillStyle = 'black';
            ctx.fillText(shape.text, tx, ty);

            if (isSelected && draggingPart === 'text' && !isSaving) {
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, bw, bh);
            }
        }
        ctx.restore();
    }, [editTextState, draggingPart]);

    const drawShape = useCallback((ctx: CanvasRenderingContext2D, shape: Shape, isSelected: boolean, isSaving: boolean) => {
        ctx.save();
        ctx.globalAlpha = shape.opacity ?? 1;

        if (isSelected && draggingPart === 'body' && !isSaving) {
            ctx.shadowColor = 'cyan';
            ctx.shadowBlur = 10;
        }

        // Apply rotation if any
        if (shape.rotation && shape.points.length >= 2) {
            const lastIdx = shape.points.length - 1;
            const cx = (shape.points[0].x + shape.points[lastIdx].x) / 2;
            const cy = (shape.points[0].y + shape.points[lastIdx].y) / 2;
            ctx.translate(cx, cy);
            ctx.rotate(shape.rotation);
            ctx.translate(-cx, -cy);
        }

        // ===== IMAGE LAYER RENDERING =====
        if (shape.tool === 'image' && shape.imageUrl) {
            const img = getImageElement(shape.imageUrl);
            if (img && img.complete && img.naturalWidth > 0) {
                const p0 = shape.points[0];
                const p1 = shape.points[1] || { x: p0.x + 200, y: p0.y + 150 };
                const x = Math.min(p0.x, p1.x);
                const y = Math.min(p0.y, p1.y);
                const w = Math.abs(p1.x - p0.x);
                const h = Math.abs(p1.y - p0.y);

                ctx.drawImage(img, x, y, w, h);

                // Borders and Handles moved to the end of drawShape to apply to all resizeable shapes reliably
            } else {
                // Image not loaded yet — draw placeholder
                const p0 = shape.points[0];
                const p1 = shape.points[1] || { x: p0.x + 200, y: p0.y + 150 };
                const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
                const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = '#64748b';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🖼️ Loading...', x + w / 2, y + h / 2);
            }
            ctx.restore();
            return;
        }

        if (shape.tool === 'arrow') {
            const start = shape.points[0];
            const end = shape.points[1];
            if (start && end) {
                drawArrowShape(ctx, start, end, shape.color, shape.lineWidth, shape.lineStyle || 'solid');
                if (isSelected && !isSaving) {
                    // Highlight box for arrow
                    ctx.save();
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.5;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.restore();
            return;
        }

        if (shape.tool === 'dimension') {
            drawDimension(ctx, shape, isSelected, isSaving);
            ctx.restore();
            return;
        }

        if (shape.tool === 'blur') {
            const start = shape.points[0];
            const end = shape.points[shape.points.length - 1];
            if (start && end && imageRef.current) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
                ctx.clip();
                ctx.filter = 'blur(8px)';
                ctx.drawImage(imageRef.current, 0, 0, ctx.canvas.width, ctx.canvas.height);
                ctx.filter = 'none';
                ctx.restore();

                if (isSelected && !isSaving) {
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
                }
            }
            ctx.restore();
            return;
        }

        if (shape.tool === 'step' && shape.stepNumber) {
            const point = shape.points[0];
            if (point) {
                const fontSize = shape.fontSize || 24;
                const radius = (fontSize / 2) + 8;

                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = shape.color; // 배경색
                ctx.fill();
                ctx.strokeStyle = shape.textColor || 'white'; // 테두리는 글자색과 동일
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.fillStyle = shape.textColor || 'white'; // 글자색
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(shape.stepNumber.toString(), point.x, point.y + 1);
            }
            ctx.restore();
            return;
        }

        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = shape.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        setCtxLineStyle(ctx, shape.lineStyle || 'solid');

        const start = shape.points[0];
        const end = shape.points[shape.points.length - 1];

        switch (shape.tool) {
            case 'callout':
                if (start && end) {
                    const xMin = Math.min(start.x, end.x);
                    const xMax = Math.max(start.x, end.x);
                    const yMin = Math.min(start.y, end.y);
                    const yMax = Math.max(start.y, end.y);
                    const w = xMax - xMin;
                    const h = yMax - yMin;

                    const ah = Math.min(h * 0.4, 60); // Total arrow height (neck + head)
                    const headH = ah * 0.6; // Arrow head height

                    const aw = Math.min(w * 0.5, 60); // Arrow head width
                    const nw = aw * 0.4; // Arrow neck width

                    const yBoxTop = yMin + ah;
                    const cx = xMin + w / 2;

                    ctx.beginPath();
                    // Start from box top-left
                    ctx.moveTo(xMin, yBoxTop);
                    // Go right to the left side of the neck
                    ctx.lineTo(cx - nw / 2, yBoxTop);
                    // Go up the neck
                    ctx.lineTo(cx - nw / 2, yMin + headH);
                    // Go left for the arrow head base
                    ctx.lineTo(cx - aw / 2, yMin + headH);
                    // Go up to the apex
                    ctx.lineTo(cx, yMin);
                    // Go down to the right arrow head base
                    ctx.lineTo(cx + aw / 2, yMin + headH);
                    // Go left to the right side of the neck
                    ctx.lineTo(cx + nw / 2, yMin + headH);
                    // Go down the neck
                    ctx.lineTo(cx + nw / 2, yBoxTop);
                    // Go right to the box top-right
                    ctx.lineTo(xMax, yBoxTop);
                    // Go down to the box bottom-right
                    ctx.lineTo(xMax, yMax);
                    // Go left to the box bottom-left
                    ctx.lineTo(xMin, yMax);
                    // Close path goes back to box top-left
                    ctx.closePath();

                    if (shape.style === 'fill') {
                        ctx.fill();
                    } else {
                        ctx.stroke();
                    }
                }
                break;
            case 'pen':
                if (shape.points.length < 1) break;
                ctx.beginPath();
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                for (let i = 1; i < shape.points.length; i++) {
                    ctx.lineTo(shape.points[i].x, shape.points[i].y);
                }
                ctx.stroke();
                break;
            case 'line':
                if (start && end) {
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                }
                break;
            case 'rect':
                if (start && end) {
                    const w = end.x - start.x;
                    const h = end.y - start.y;
                    if (shape.style === 'fill') {
                        ctx.fillRect(start.x, start.y, w, h);
                    } else {
                        ctx.strokeRect(start.x, start.y, w, h);
                    }
                }
                break;
            case 'ellipse':
                if (start && end) {
                    ctx.beginPath();
                    const centerX = (start.x + end.x) / 2;
                    const centerY = (start.y + end.y) / 2;
                    const radiusX = Math.abs(end.x - start.x) / 2;
                    const radiusY = Math.abs(end.y - start.y) / 2;
                    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                    if (shape.style === 'fill') {
                        ctx.fill();
                    } else {
                        ctx.stroke();
                    }
                }
                break;
        }

        // Draw resize handles for resizeable shapes
        const isResizeableTool = ['image', 'rect', 'ellipse', 'callout', 'arrow', 'line'].includes(shape.tool);
        if (isSelected && !isSaving && isResizeableTool && start && end) {
            ctx.shadowBlur = 0; // disable shadow for handles

            // Draw connection line to rot handle
            const handles = getResizeHandles(start, end);
            const rotHandle = handles.find(h => h.handle === 'rot');
            const topCenterHandle = handles.find(h => h.handle === 'tc');

            if (rotHandle && topCenterHandle) {
                ctx.beginPath();
                ctx.moveTo(topCenterHandle.x, topCenterHandle.y);
                ctx.lineTo(rotHandle.x, rotHandle.y);
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
            }

            // Draw bounding box if not an image (images draw their bounds via fill/stroke implicitly, but let's outline them too)
            if (shape.tool === 'image') {
                const w = Math.abs(end.x - start.x);
                const h = Math.abs(end.y - start.y);
                const x = Math.min(start.x, end.x);
                const y = Math.min(start.y, end.y);
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 3]);
                ctx.strokeRect(x, y, w, h);
            }

            handles.forEach(h => {
                ctx.beginPath();
                if (h.handle === 'rot') {
                    ctx.arc(h.x, h.y, HANDLE_SIZE, 0, Math.PI * 2);
                } else {
                    ctx.rect(h.x - HANDLE_SIZE, h.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
                }
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'cyan';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.fill();
                ctx.stroke();
            });
        }

        ctx.restore();
    }, [draggingPart, drawDimension, drawArrowShape]);

    // Main Draw Function
    const draw = useCallback((ctx: CanvasRenderingContext2D, isSaving: boolean = false) => {
        const canvas = ctx.canvas;
        const image = imageRef.current;
        if (!canvas || !image) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        shapes.forEach(shape => {
            const isSelected = selectedShapeId === shape.id;
            drawShape(ctx, shape, isSelected, isSaving);
        });

        annotations.forEach(ann => {
            const isEditing = editTextState?.id === ann.id;

            // Note: Arrows are now Shapes, so 'ann.arrow' logic is removed or ignored for new drawings.
            // Keeping legacy rendering support if needed, but for "Arrow Tool" specifically we use Shapes.
            // If legacy annotations exist with arrows, they can be kept here or migrated.
            // Given user request is to fix the tool behavior, we focus on the Tool logic.

            if (ann.text && !isEditing) {
                ctx.save();
                const isSelected = selectedAnnotationId === ann.id;

                if (isSelected && draggingPart === 'text' && !isSaving) {
                    ctx.shadowColor = 'cyan';
                    ctx.shadowBlur = 10;
                }

                ctx.font = `bold ${ann.fontSize}px Arial`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom'; // 기준선은 바텀

                const lines = ann.text.split('\n');
                const lineHeight = ann.fontSize * 1.2; // 줄 간격
                const padding = ann.fontSize / 2;

                // 최대 너비 계산
                let maxLineWidth = 0;
                lines.forEach(line => {
                    const metrics = ctx.measureText(line);
                    if (metrics.width > maxLineWidth) maxLineWidth = metrics.width;
                });

                const totalWidth = maxLineWidth + padding;
                const totalHeight = (lineHeight * lines.length) + (padding / 2); // 높이 보정

                // 배경 박스 그리기
                // 첫 줄의 baseline(ann.textPos.y)을 기준으로 박스 위치 계산
                // 박스 Top = y - (fontSize) - padding/2
                // (ctx.textBaseline='bottom'이므로 y는 글자 하단. 글자 상단은 y - fontSize)
                const boxTop = ann.textPos.y - ann.fontSize - (padding / 2);
                const boxLeft = ann.textPos.x - (padding / 2);

                ctx.fillStyle = ann.backgroundColor || 'rgba(0, 0, 0, 0.7)'; // 배경색
                ctx.fillRect(boxLeft, boxTop, totalWidth, totalHeight);

                // 텍스트 그리기
                ctx.fillStyle = ann.textColor || 'white'; // 글자색

                lines.forEach((line, index) => {
                    // 각 줄의 Y 좌표: 첫 줄은 y, 그 다음부터 lineHeight만큼 추가
                    const lineY = ann.textPos.y + (index * lineHeight);
                    ctx.fillText(line, ann.textPos.x, lineY);
                });

                // 선택 테두리
                if (isSelected && draggingPart === 'text' && !isSaving) {
                    ctx.strokeStyle = 'cyan';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(boxLeft, boxTop, totalWidth, totalHeight);
                }
                ctx.restore();
            }
        });

        // Draw Preview
        if (isDrawing && currentPoints.length > 0) {
            const previewShape: Shape = {
                id: 'preview',
                tool: tool === 'circle' ? 'ellipse' : (tool as ShapeTool),
                color,
                lineWidth,
                points: currentPoints,
                opacity,
                style: fillStyle,
                lineStyle: lineStyle,
                text: tool === 'dimension' ? '0px' : undefined,
                fontSize: fontSize
            };

            if (tool === 'dimension' && currentPoints.length >= 2) {
                const dist = Math.sqrt((currentPoints[1].x - currentPoints[0].x) ** 2 + (currentPoints[1].y - currentPoints[0].y) ** 2);
                previewShape.text = `${Math.round(dist)}px`;
            }
            if (tool === 'arrow' && currentPoints.length >= 2) {
                // Arrow preview uses start and current mouse pos
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                previewShape.points = [start, end];
            }

            if (tool === 'circle' && currentPoints.length > 0) {
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                const w = end.x - start.x;
                const h = end.y - start.y;
                const dim = Math.max(Math.abs(w), Math.abs(h));
                const newEnd = {
                    x: start.x + (w < 0 ? -dim : dim),
                    y: start.y + (h < 0 ? -dim : dim)
                };
                previewShape.points = [start, newEnd];
            }

            drawShape(ctx, previewShape, false, false);
        }
        // Crop Preview
        else if (isDrawing && tool === 'crop' && currentPoints.length > 0) {
            const start = currentPoints[0];
            const end = currentPoints[currentPoints.length - 1];
            const cropX = Math.min(start.x, end.x);
            const cropY = Math.min(start.y, end.y);
            const cropW = Math.abs(end.x - start.x);
            const cropH = Math.abs(end.y - start.y);

            ctx.save();

            // Dark overlay outside crop area
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, ctx.canvas.width, cropY);
            ctx.fillRect(0, cropY + cropH, ctx.canvas.width, ctx.canvas.height - cropY - cropH);
            ctx.fillRect(0, cropY, cropX, cropH);
            ctx.fillRect(cropX + cropW, cropY, ctx.canvas.width - cropX - cropW, cropH);

            // Double border for visibility: black outer + white inner dashed
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.strokeRect(cropX, cropY, cropW, cropH);

            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(cropX, cropY, cropW, cropH);

            // Corner handles (small squares)
            const hs = 5;
            ctx.fillStyle = 'white';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            [[cropX, cropY], [cropX + cropW, cropY], [cropX, cropY + cropH], [cropX + cropW, cropY + cropH]].forEach(([cx, cy]) => {
                ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
                ctx.strokeRect(cx - hs, cy - hs, hs * 2, hs * 2);
            });

            // Size label
            if (cropW > 30 && cropH > 15) {
                const origImg = imageRef.current;
                let labelW = Math.round(cropW), labelH = Math.round(cropH);
                if (origImg && ctx.canvas.width > 0) {
                    const scaleX = origImg.naturalWidth / ctx.canvas.width;
                    const scaleY = origImg.naturalHeight / ctx.canvas.height;
                    labelW = Math.round(cropW * scaleX);
                    labelH = Math.round(cropH * scaleY);
                }
                const label = `${labelW} × ${labelH}`;
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                const tw = ctx.measureText(label).width + 12;
                const lx = cropX + cropW / 2;
                const ly = cropY + cropH + 4;
                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fillRect(lx - tw / 2, ly, tw, 18);
                ctx.fillStyle = 'white';
                ctx.fillText(label, lx, ly + 3);
            }

            ctx.restore();
        }

    }, [annotations, shapes, drawArrowShape, color, lineWidth, lineStyle, arrowHeadStyle, tool, isDrawing, currentPoints, drawShape, opacity, fillStyle, selectedAnnotationId, selectedShapeId, draggingPart, editTextState, fontSize]);

    // Initial Load & Resize
    useEffect(() => {
        const image = new Image();
        image.src = editingImage.baseImageUrl;
        image.onload = () => {
            const canvas = canvasRef.current;
            if (canvas) {
                const maxWidth = window.innerWidth * 0.9;
                const maxHeight = window.innerHeight * 0.7;
                let { width, height } = image;
                // Never upscale beyond original resolution (Math.min with 1)
                const ratio = Math.min(1, maxWidth / width, maxHeight / height);
                canvas.width = width * ratio;
                canvas.height = height * ratio;
                imageRef.current = image;

                const ctx = canvas.getContext('2d');
                if (ctx) draw(ctx, false);
            }
        };
    }, [editingImage.baseImageUrl]);

    // Redraw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) draw(ctx, false);
        }
    }, [draw]);

    // --- Interaction Handlers ---

    const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const isPointInText = (p: Point, ann: TextAnnotation): boolean => {
        if (!ann.text) return false;

        // Multi-line hit test estimation
        const lines = ann.text.split('\n');
        // Width estimation (rough) or better using canvas measure if possible,
        // but here we estimate based on char length to avoid canvas context dep if not passed.
        // Better: assume max char length * font size * 0.6 (avg char width)
        const maxLineLen = Math.max(...lines.map(l => l.length));
        const width = maxLineLen * ann.fontSize * 0.8; // 0.8 factor from original code

        const lineHeight = ann.fontSize * 1.2;
        const totalHeight = (lines.length * lineHeight) + 10;

        // Box coordinates estimation matching draw logic roughly
        // Box Left = textPos.x - 5
        // Box Top = textPos.y - fontSize - 5
        const x = ann.textPos.x - 5;
        const y = ann.textPos.y - ann.fontSize - 5;

        return (p.x >= x && p.x <= x + width + 10 && p.y >= y && p.y <= y + totalHeight);
    };

    const isPointInShape = (p: Point, shape: Shape): boolean => {
        let testPoint = { ...p };
        const lastIdx = shape.points.length - 1;
        if (shape.rotation && shape.points.length >= 2) {
            const cx = (shape.points[0].x + shape.points[lastIdx].x) / 2;
            const cy = (shape.points[0].y + shape.points[lastIdx].y) / 2;
            testPoint = rotatePoint(p, cx, cy, -shape.rotation);
        }

        if (shape.tool === 'arrow') {
            if (shape.points.length >= 2) {
                const dist = getDistanceToLineSegment(testPoint, shape.points[0], shape.points[lastIdx]);
                return dist < (shape.lineWidth + 10);
            }
        }
        if (shape.tool === 'dimension') {
            const lastIdx = shape.points.length - 1;
            if (shape.points.length >= 2) {
                const dist = getDistanceToLineSegment(testPoint, shape.points[0], shape.points[lastIdx]);
                if (dist < 10) return true;
            }
            if (shape.text && shape.points.length >= 2) {
                const start = shape.points[0];
                const end = shape.points[lastIdx];
                let tx = shape.textPos ? shape.textPos.x : (start.x + end.x) / 2;
                let ty = shape.textPos ? shape.textPos.y : (start.y + end.y) / 2 - 15;
                if (Math.abs(testPoint.x - tx) < 40 && Math.abs(testPoint.y - ty) < 20) return true;
            }
            return false;
        }
        if (shape.tool === 'image' || shape.tool === 'rect' || shape.tool === 'ellipse' || shape.tool === 'callout') {
            if (shape.points.length < 2) return false;
            const start = shape.points[0];
            const end = shape.points[shape.points.length - 1]; // using last point handles multi-point shapes softly
            const xMin = Math.min(start.x, end.x);
            const xMax = Math.max(start.x, end.x);
            const yMin = Math.min(start.y, end.y);
            const yMax = Math.max(start.y, end.y);
            return (testPoint.x >= xMin && testPoint.x <= xMax && testPoint.y >= yMin && testPoint.y <= yMax);
        }
        if (shape.tool === 'step' && shape.stepNumber) {
            const center = shape.points[0];
            const dist = Math.sqrt((testPoint.x - center.x) ** 2 + (testPoint.y - center.y) ** 2);
            const r = ((shape.fontSize || 24) / 2) + 8 + shape.lineWidth;
            return dist <= r;
        }
        if (shape.tool === 'pen') {
            for (let i = 0; i < shape.points.length - 1; i++) {
                if (getDistanceToLineSegment(testPoint, shape.points[i], shape.points[i + 1]) < 10) return true;
            }
        }
        if (shape.tool === 'line') {
            const lastIdx = shape.points.length - 1;
            if (shape.points.length >= 2) {
                const dist = getDistanceToLineSegment(testPoint, shape.points[0], shape.points[lastIdx]);
                return dist < (shape.lineWidth + 10);
            }
        }
        return false;
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const point = getCanvasPoint(e);
        const clickedDim = shapes.find(s => s.tool === 'dimension' && s.text && isPointInShape(point, s));
        if (clickedDim && clickedDim.text) {
            const start = clickedDim.points[0];
            const lastIdx = clickedDim.points.length - 1;
            const end = clickedDim.points[lastIdx];
            let tx = clickedDim.textPos ? clickedDim.textPos.x : (start.x + end.x) / 2;
            let ty = clickedDim.textPos ? clickedDim.textPos.y : (start.y + end.y) / 2 - 15;
            if (Math.abs(point.x - tx) < 40 && Math.abs(point.y - ty) < 20) {
                setEditTextState({ id: clickedDim.id, type: 'dimension', text: clickedDim.text, x: tx, y: ty });
                return;
            }
        }
        const clickedAnn = annotations.find(ann => isPointInText(point, ann));
        if (clickedAnn) {
            setEditTextState({ id: clickedAnn.id, type: 'annotation', text: clickedAnn.text, x: clickedAnn.textPos.x, y: clickedAnn.textPos.y });
        }
    };

    const handleInputCommit = () => {
        if (!editTextState) return;
        if (editTextState.text.trim() === '') {
            if (editTextState.type === 'annotation') {
                setAnnotations(prev => prev.filter(a => a.id !== editTextState.id));
            }
        } else {
            if (editTextState.type === 'dimension') {
                setShapes(prev => prev.map(s => s.id === editTextState.id ? { ...s, text: editTextState.text } : s));
            } else {
                setAnnotations(prev => prev.map(a => a.id === editTextState.id ? { ...a, text: editTextState.text } : a));
            }
        }
        setEditTextState(null);
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (draggingPart) return;
        if (e.button !== 0) return;

        if (editTextState) {
            handleInputCommit();
            return;
        }

        const point = getCanvasPoint(e);
        if (tool === 'select') return;

        if (tool === 'step') {
            const newShape: Shape = {
                id: Date.now().toString(),
                tool: 'step',
                color: bgColor, // 순번 배경색은 bgColor 사용
                lineWidth,
                points: [point],
                stepNumber: nextStepNumber,
                opacity: 1,
                style: 'fill',
                fontSize: fontSize,
                textColor: textColor
            };
            setShapes(prev => [...prev, newShape]);
            setNextStepNumber(prev => prev + 1);
            return;
        }

        if (tool === 'text') {
            const newId = Date.now().toString();
            setAnnotations(prev => [...prev, {
                id: newId,
                text: "Text",
                textPos: point,
                fontSize: fontSize,
                fontFamily: 'Arial',
                textColor: textColor,      // 글자색 적용
                backgroundColor: bgColor   // 배경색 적용
            }]);
            setEditTextState({
                id: newId,
                type: 'annotation',
                text: "",
                x: point.x,
                y: point.y
            });
            return;
        }
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (editTextState) return;
        const point = getCanvasPoint(e);
        if (e.button === 1) { setIsErasing(true); return; }

        if (tool === 'text') return;

        if (tool === 'select') {
            // --- Check resize handles on selected image shapes FIRST ---
            if (selectedShapeId) {
                const selShape = shapes.find(s => s.id === selectedShapeId);
                const isResizeableTool = ['image', 'rect', 'ellipse', 'callout', 'arrow', 'line'].includes(selShape?.tool || '');
                if (selShape && isResizeableTool && selShape.points.length >= 2) {
                    let testPoint = { ...point };
                    const lastIdx = selShape.points.length - 1;
                    if (selShape.rotation) {
                        const cx = (selShape.points[0].x + selShape.points[lastIdx].x) / 2;
                        const cy = (selShape.points[0].y + selShape.points[lastIdx].y) / 2;
                        testPoint = rotatePoint(point, cx, cy, -selShape.rotation);
                    }
                    const handle = hitTestHandle(testPoint, selShape.points[0], selShape.points[lastIdx]);
                    if (handle) {
                        setResizingHandle(handle);
                        setDragStartPos(point);
                        dragStartShapeRef.current = selShape;
                        return;
                    }
                }
            }

            // Select / Drag Logic ...
            if (e.ctrlKey || e.metaKey) {
                const hitAnn = annotations.find(a => isPointInText(point, a));
                if (hitAnn) {
                    const newId = Date.now().toString();
                    const clone = { ...hitAnn, id: newId };
                    setAnnotations(prev => [...prev, clone]);
                    setSelectedAnnotationId(newId);
                    setSelectedShapeId(null);
                    setDraggingPart('text');
                    setDragStartPos(point);
                    return;
                }

                const hitShape = shapes.find(s => isPointInShape(point, s));
                if (hitShape) {
                    const newId = Date.now().toString();
                    const clone = { ...hitShape, id: newId };
                    setShapes(prev => [...prev, clone]);
                    setSelectedShapeId(newId);
                    setSelectedAnnotationId(null);
                    let part: 'body' | 'text' = 'body';
                    if (hitShape.tool === 'dimension' && hitShape.text) {
                        // Dimension text hit test simplified
                        part = 'body';
                    }
                    setDraggingPart(part);
                    setDragStartPos(point);
                    return;
                }
            }

            for (let i = annotations.length - 1; i >= 0; i--) {
                if (isPointInText(point, annotations[i])) {
                    setSelectedAnnotationId(annotations[i].id);
                    setSelectedShapeId(null);
                    setDraggingPart('text');
                    setDragStartPos(point);
                    return;
                }
            }
            for (let i = shapes.length - 1; i >= 0; i--) {
                if (isPointInShape(point, shapes[i])) {
                    setSelectedShapeId(shapes[i].id); setSelectedAnnotationId(null); setDraggingPart('body'); setDragStartPos(point); return;
                }
            }
            setSelectedShapeId(null); setSelectedAnnotationId(null); setDraggingPart(null);
            return;
        }

        if (tool === 'step' || tool === 'image') return;
        setIsDrawing(true); setCurrentPoints([point]);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        let point = getCanvasPoint(e);
        setMousePos(point);
        if (isErasing) {
            const hitAnn = annotations.find(a => isPointInText(point, a));
            if (hitAnn) setAnnotations(p => p.filter(x => x.id !== hitAnn.id));
            const hitShape = shapes.find(s => isPointInShape(point, s));
            if (hitShape) setShapes(p => p.filter(x => x.id !== hitShape.id));
            return;
        }
        // --- Resize handle dragging for shapes ---
        if (resizingHandle && selectedShapeId && dragStartPos && dragStartShapeRef.current) {
            const startShape = dragStartShapeRef.current;
            const dxGlobal = point.x - dragStartPos.x;
            const dyGlobal = point.y - dragStartPos.y;

            setShapes(prev => prev.map(s => {
                const isResizeableTool = ['image', 'rect', 'ellipse', 'callout', 'arrow', 'line'].includes(startShape.tool);
                if (s.id !== selectedShapeId || !isResizeableTool) return s;

                if (resizingHandle === 'rot') {
                    // Handle Rotation
                    const lastP = startShape.points.length - 1;
                    const cx = (startShape.points[0].x + startShape.points[lastP].x) / 2;
                    const cy = (startShape.points[0].y + startShape.points[lastP].y) / 2;
                    const angle = Math.atan2(point.y - cy, point.x - cx) + Math.PI / 2;
                    return { ...startShape, rotation: angle };
                }

                const lastIdx = startShape.points.length - 1;
                const cx = (startShape.points[0].x + startShape.points[lastIdx].x) / 2;
                const cy = (startShape.points[0].y + startShape.points[lastIdx].y) / 2;
                const rot = startShape.rotation || 0;

                // Convert mouse global delta to local delta by rotating backward around origin
                const localDelta = rotatePoint({ x: dxGlobal, y: dyGlobal }, 0, 0, -rot);
                const localDx = localDelta.x;
                const localDy = localDelta.y;

                const p0 = startShape.points[0];
                const p1 = startShape.points[lastIdx];
                let x0 = Math.min(p0.x, p1.x), y0 = Math.min(p0.y, p1.y);
                let x1 = Math.max(p0.x, p1.x), y1 = Math.max(p0.y, p1.y);

                // Identify invariant anchor local coordinate BEFORE drag
                let anchorLocalX = 0, anchorLocalY = 0;
                if (resizingHandle.includes('l')) anchorLocalX = x1;
                else if (resizingHandle.includes('r')) anchorLocalX = x0;
                else anchorLocalX = cx;

                if (resizingHandle.includes('t')) anchorLocalY = y1;
                else if (resizingHandle.includes('b')) anchorLocalY = y0;
                else anchorLocalY = cy;

                // Screen position of invariant anchor BEFORE drag
                const screenAnchor = rotatePoint({ x: anchorLocalX, y: anchorLocalY }, cx, cy, rot);

                // Apply drag to local bounds
                if (resizingHandle.includes('l')) x0 += localDx;
                if (resizingHandle.includes('r')) x1 += localDx;
                if (resizingHandle.includes('t')) y0 += localDy;
                if (resizingHandle.includes('b')) y1 += localDy;

                // Aspect ratio lock with shift key
                if (e.shiftKey && ['tl', 'tr', 'bl', 'br'].includes(resizingHandle)) {
                    let ratio = 1;
                    if (startShape.tool === 'image' && startShape.imageUrl) {
                        const img = getImageElement(startShape.imageUrl);
                        if (img && img.naturalWidth > 0) ratio = img.naturalWidth / img.naturalHeight;
                    } else {
                        const origW = Math.abs(p1.x - p0.x);
                        const origH = Math.abs(p1.y - p0.y);
                        ratio = origW / origH;
                        if (isNaN(ratio) || ratio === 0) ratio = 1;
                    }

                    const newW = x1 - x0;
                    const newH = y1 - y0;
                    // We adjust either x or y to maintain ratio based on which changed more relative to ratio
                    if (Math.abs(newW) / ratio > Math.abs(newH)) {
                        // adjust Y to match width
                        const targetH = Math.abs(newW) / ratio;
                        if (resizingHandle.includes('t')) y0 = y1 - targetH;
                        else y1 = y0 + targetH;
                    } else {
                        // adjust X to match height
                        const targetW = Math.abs(newH) * ratio;
                        if (resizingHandle.includes('l')) x0 = x1 - targetW;
                        else x1 = x0 + targetW;
                    }
                }

                // Enforce minimum size
                if (x1 - x0 < 10) {
                    if (resizingHandle.includes('l')) x0 = x1 - 10;
                    else x1 = x0 + 10;
                }
                if (y1 - y0 < 10) {
                    if (resizingHandle.includes('t')) y0 = y1 - 10;
                    else y1 = y0 + 10;
                }

                // New center
                const newCx = (x0 + x1) / 2;
                const newCy = (y0 + y1) / 2;

                // Screen position of invariant anchor AFTER drag (but before shift)
                let newAnchorLocalX = 0, newAnchorLocalY = 0;
                if (resizingHandle.includes('l')) newAnchorLocalX = x1;
                else if (resizingHandle.includes('r')) newAnchorLocalX = x0;
                else newAnchorLocalX = newCx;

                if (resizingHandle.includes('t')) newAnchorLocalY = y1;
                else if (resizingHandle.includes('b')) newAnchorLocalY = y0;
                else newAnchorLocalY = newCy;

                const newScreenAnchor = rotatePoint({ x: newAnchorLocalX, y: newAnchorLocalY }, newCx, newCy, rot);

                // Required shift to keep anchor pinned on screen
                const shiftX = screenAnchor.x - newScreenAnchor.x;
                const shiftY = screenAnchor.y - newScreenAnchor.y;

                x0 += shiftX; x1 += shiftX;
                y0 += shiftY; y1 += shiftY;

                const newPoints = [{ x: x0, y: y0 }, { x: x1, y: y1 }];
                return { ...startShape, points: newPoints };
            }));
            // DO NOT update dragStartPos(point) for resizing handle to maintain absolute bounding box delta
            return;
        }

        if (draggingPart && dragStartPos) {
            const dx = point.x - dragStartPos.x;
            const dy = point.y - dragStartPos.y;

            if (selectedAnnotationId) {
                setAnnotations(prev => prev.map(a => {
                    if (a.id !== selectedAnnotationId) return a;
                    return { ...a, textPos: { x: a.textPos.x + dx, y: a.textPos.y + dy } };
                }));
            } else if (selectedShapeId) {
                setShapes(prev => prev.map(s => {
                    if (s.id !== selectedShapeId) return s;
                    const newPoints = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    const newTextPos = s.textPos ? { x: s.textPos.x + dx, y: s.textPos.y + dy } : undefined;
                    return { ...s, points: newPoints, textPos: newTextPos };
                }));
            }
            setDragStartPos(point);
            return;
        }
        if (!isDrawing) return;

        if (e.shiftKey && (tool === 'dimension' || tool === 'line' || tool === 'arrow') && currentPoints.length > 0) {
            const start = currentPoints[0];
            const dx = Math.abs(point.x - start.x);
            const dy = Math.abs(point.y - start.y);
            if (dx > dy) point = { x: point.x, y: start.y };
            else point = { x: start.x, y: point.y };
        }

        setCurrentPoints(prev => [...prev, point]);
    };

    const handleMouseUp = () => {
        setIsDrawing(false); setIsErasing(false); setDraggingPart(null); setDragStartPos(null);
        setResizingHandle(null);
        dragStartShapeRef.current = null;
        if (currentPoints.length > 0) {
            if (tool === 'crop') {
                // Crop Logic ...
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                const w = Math.abs(end.x - start.x);
                const h = Math.abs(end.y - start.y);
                const x = Math.min(start.x, end.x);
                const y = Math.min(start.y, end.y);

                if (w > 10 && h > 10 && canvasRef.current) {
                    const origImg = imageRef.current;
                    if (origImg) {
                        // Calculate scale from canvas to original image
                        const canvas = canvasRef.current;
                        const scaleX = origImg.naturalWidth / canvas.width;
                        const scaleY = origImg.naturalHeight / canvas.height;

                        // Crop region in original image coordinates
                        const origX = Math.round(x * scaleX);
                        const origY = Math.round(y * scaleY);
                        const origW = Math.round(w * scaleX);
                        const origH = Math.round(h * scaleY);

                        // Draw original image crop + annotations at full resolution
                        const temp = document.createElement('canvas');
                        temp.width = origW;
                        temp.height = origH;
                        const tCtx = temp.getContext('2d');
                        if (tCtx) {
                            // First: base image at full resolution
                            tCtx.drawImage(origImg, origX, origY, origW, origH, 0, 0, origW, origH);

                            // Then: overlay shapes and annotations scaled to original resolution
                            tCtx.save();
                            tCtx.scale(scaleX, scaleY);
                            tCtx.translate(-x, -y);
                            // Draw shapes at canvas coordinates (will be scaled)
                            shapes.forEach(shape => {
                                drawShape(tCtx, shape, false, true);
                            });
                            annotations.forEach(ann => {
                                if (ann.text) {
                                    tCtx.font = `bold ${ann.fontSize}px Arial`;
                                    tCtx.textAlign = 'left';
                                    tCtx.textBaseline = 'bottom';
                                    const lines = ann.text.split('\n');
                                    const lineHeight = ann.fontSize * 1.2;
                                    const padding = ann.fontSize / 2;
                                    let maxLineWidth = 0;
                                    lines.forEach(line => {
                                        const metrics = tCtx.measureText(line);
                                        if (metrics.width > maxLineWidth) maxLineWidth = metrics.width;
                                    });
                                    const totalWidth = maxLineWidth + padding;
                                    const totalHeight = (lineHeight * lines.length) + (padding / 2);
                                    const boxTop = ann.textPos.y - ann.fontSize - (padding / 2);
                                    const boxLeft = ann.textPos.x - (padding / 2);
                                    tCtx.fillStyle = ann.backgroundColor || 'rgba(0, 0, 0, 0.7)';
                                    tCtx.fillRect(boxLeft, boxTop, totalWidth, totalHeight);
                                    tCtx.fillStyle = ann.textColor || 'white';
                                    lines.forEach((line, index) => {
                                        tCtx.fillText(line, ann.textPos.x, ann.textPos.y + (index * lineHeight));
                                    });
                                }
                            });
                            tCtx.restore();

                            const newBase = temp.toDataURL('image/png');

                            const shiftPoints = (pts: Point[]) => pts.map(p => ({ x: p.x - x, y: p.y - y }));
                            setShapes(prev => prev.map(s => ({
                                ...s,
                                points: shiftPoints(s.points),
                                textPos: s.textPos ? { x: s.textPos.x - x, y: s.textPos.y - y } : undefined
                            })));
                            setAnnotations(prev => prev.map(a => ({
                                ...a,
                                textPos: { x: a.textPos.x - x, y: a.textPos.y - y }
                            })));

                            const newImg = new Image();
                            newImg.src = newBase;
                            newImg.onload = () => {
                                imageRef.current = newImg;
                                const cvs = canvasRef.current;
                                if (cvs) {
                                    // Set canvas to display size (may be scaled down)
                                    const maxWidth = window.innerWidth * 0.9;
                                    const maxHeight = window.innerHeight * 0.7;
                                    const displayRatio = Math.min(1, maxWidth / origW, maxHeight / origH);
                                    cvs.width = origW * displayRatio;
                                    cvs.height = origH * displayRatio;
                                    draw(cvs.getContext('2d')!, false);
                                }
                            };
                        }
                    }
                }
                setCurrentPoints([]);
                setTool('select');
                return;
            }

            if (tool === 'dimension' && currentPoints.length >= 2) {
                const start = currentPoints[0]; const end = currentPoints[currentPoints.length - 1];
                const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
                setShapes(prev => [...prev, {
                    id: Date.now().toString(), tool: 'dimension', color, lineWidth, points: [start, end], opacity: 1, style: 'outline',
                    text: `${Math.round(dist)}px`, fontSize, lineStyle: 'solid'
                }]);
            } else if (tool === 'arrow' && currentPoints.length >= 2) {
                // Arrow creation logic - now a Shape
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                setShapes(prev => [...prev, {
                    id: Date.now().toString(), tool: 'arrow', color, lineWidth, points: [start, end], opacity, style: fillStyle, lineStyle
                }]);
            } else if (tool === 'line' && currentPoints.length >= 2) {
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                setShapes(prev => [...prev, {
                    id: Date.now().toString(), tool: 'line', color, lineWidth, points: [start, end], opacity, style: fillStyle, lineStyle
                }]);
            } else if (tool === 'circle') {
                const start = currentPoints[0];
                const end = currentPoints[currentPoints.length - 1];
                const w = end.x - start.x;
                const h = end.y - start.y;
                const dim = Math.max(Math.abs(w), Math.abs(h));
                const newEnd = { x: start.x + (w < 0 ? -dim : dim), y: start.y + (h < 0 ? -dim : dim) };
                setShapes(prev => [...prev, {
                    id: Date.now().toString(), tool: 'ellipse', color, lineWidth, points: [start, newEnd], opacity, style: fillStyle, lineStyle
                }]);
            } else if (tool !== 'dimension' && tool !== 'arrow' && tool !== 'text') {
                setShapes(prev => [...prev, {
                    id: Date.now().toString(), tool: tool as ShapeTool, color, lineWidth, points: currentPoints, opacity, style: fillStyle, lineStyle
                }]);
            }
            setCurrentPoints([]);
        }
    };

    const handleTranslate = async () => {
        setIsTranslating(true);
        setTranslationMessage('');
        try {
            // 번역할 항목이 있는지 확인
            if (annotations.length === 0 && shapes.length === 0) {
                setTranslationMessage('번역할 주석이 없습니다.');
                setIsTranslating(false);
                return;
            }

            let translatedCount = 0;
            let failedCount = 0;

            // Annotations 번역
            const updatedAnnotations = await Promise.all(
                annotations.map(async (ann) => {
                    if (ann.text) {
                        try {
                            const translated = await translateText(ann.text, targetLang);
                            translatedCount++;
                            return { ...ann, text: translated };
                        } catch (e) {
                            console.error('Annotation translation error:', e);
                            failedCount++;
                            return ann; // 실패 시 원본 유지
                        }
                    }
                    return ann;
                })
            );

            // Shapes 번역
            const updatedShapes = await Promise.all(
                shapes.map(async (shape) => {
                    let updated = { ...shape };
                    if (shape.text) {
                        try {
                            const translated = await translateText(shape.text, targetLang);
                            updated.text = translated;
                            translatedCount++;
                        } catch (e) {
                            console.error('Shape text translation error:', e);
                            failedCount++;
                        }
                    }
                    // Dimension text 번역
                    if (shape.tool === 'dimension' && 'dimensionText' in shape && shape.dimensionText) {
                        try {
                            const translated = await translateText(shape.dimensionText as string, targetLang);
                            updated = { ...updated, dimensionText: translated } as any;
                            translatedCount++;
                        } catch (e) {
                            console.error('Dimension text translation error:', e);
                            failedCount++;
                        }
                    }
                    return updated;
                })
            );

            // State 업데이트
            setAnnotations(updatedAnnotations);
            setShapes(updatedShapes);

            if (failedCount === 0) {
                setTranslationMessage(`✓ ${translatedCount}개 주석이 번역되었습니다.`);
            } else if (translatedCount > 0) {
                setTranslationMessage(`⚠ ${translatedCount}개 번역, ${failedCount}개 실패`);
            } else {
                setTranslationMessage(`❌ 번역 실패 (${failedCount}개). API 설정을 확인하세요.`);
            }
            setTimeout(() => setTranslationMessage(''), 3000);
        } catch (error) {
            console.error('Translation error:', error);
            setTranslationMessage('❌ 번역 중 오류가 발생했습니다.');
        }
        setIsTranslating(false);
    };

    const handleSave = () => {
        if (editTextState) handleInputCommit();
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                draw(ctx, true);
                const dataUrl = canvas.toDataURL('image/png');
                onSave({
                    id: editingImage.id,
                    baseImageUrl: editingImage.baseImageUrl,
                    dataUrl: dataUrl,
                    annotations: annotations,
                    shapes: shapes
                });
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col overflow-hidden">
            <div style={{ background: 'linear-gradient(135deg, #0D1B3E 0%, #162D5A 50%, #1B3F8B 100%)' }} className="border-b border-blue-900/50 shadow-lg flex items-center select-none h-auto min-h-[4rem] px-4 py-2 gap-2 overflow-x-auto flex-nowrap min-w-fit">

                {/* Atech Logo */}
                <div className="flex items-center gap-2 px-3 border-r border-blue-800/50 min-w-max">
                    <img src="./assets/icon.png" alt="Atech" className="w-8 h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="flex flex-col">
                        <span style={{ color: '#E31E24' }} className="text-xs font-bold leading-none">Atech</span>
                        <span className="text-[9px] text-blue-300/80 leading-none">SOLUTION</span>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="flex gap-1">
                        <button onClick={handleSave} className="flex flex-col items-center p-2 rounded hover:bg-blue-700/50 text-gray-200" title="저장">
                            <SaveIcon className="w-6 h-6" />
                            <span className="text-xs mt-1">저장</span>
                        </button>
                        <button onClick={onCancel} className="flex flex-col items-center p-2 rounded hover:bg-blue-700/50 text-gray-200" title="취소">
                            <TrashIcon className="w-6 h-6" />
                            <span className="text-xs mt-1">취소</span>
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">이미지</div>
                    <div className="flex gap-2">
                        <button onClick={() => setTool('select')} className={`flex flex-col items-center p-2 rounded w-16 ${tool === 'select' ? 'bg-red-700/40 text-red-200 ring-1 ring-red-400' : 'hover:bg-blue-700/50 text-gray-200'}`}>
                            <CursorArrowIcon className="w-6 h-6 mb-1" />
                            <span className="text-xs">선택</span>
                        </button>
                        <button onClick={() => setTool('crop')} className={`flex flex-col items-center p-2 rounded w-16 ${tool === 'crop' ? 'bg-red-700/40 text-red-200 ring-1 ring-red-400' : 'hover:bg-blue-700/50 text-gray-200'}`}>
                            <ScissorIcon className="w-6 h-6 mb-1" />
                            <span className="text-xs">자르기</span>
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className={`flex flex-col items-center p-2 rounded w-16 hover:bg-blue-700/50 text-gray-200`} title="이미지 삽입 (Ctrl+V 또는 파일 선택)">
                            <span className="text-lg mb-1">🖼️</span>
                            <span className="text-xs">삽입</span>
                        </button>
                        <button onClick={() => createWhiteBoard()} className={`flex flex-col items-center p-2 rounded w-16 hover:bg-blue-700/50 text-gray-200`} title="빈 화이트보드 배경 생성 (A4 기준 2900x1800)">
                            <span className="text-lg mb-1">📝</span>
                            <span className="text-xs">WhiteBoard</span>
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFileSelect} />
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">도구</div>
                    <div className="grid grid-cols-3 gap-1">
                        <button onClick={() => setTool('pen')} className={`p-1.5 rounded ${tool === 'pen' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="펜"><PenIcon /></button>
                        <button onClick={() => setTool('step')} className={`p-1.5 rounded ${tool === 'step' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="순번"><NumberIcon /></button>
                        <button onClick={() => setTool('blur')} className={`p-1.5 rounded ${tool === 'blur' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="블러"><BlurIcon /></button>

                        <button onClick={() => setTool('text')} className={`p-1.5 rounded ${tool === 'text' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="텍스트">
                            <TextIcon />
                        </button>

                        <button onClick={handleEyedropper} className="p-1.5 rounded hover:bg-blue-700/50" title="색상 추출"><EyeDropperIcon /></button>
                        <button onClick={handleUndo} className="p-1.5 rounded hover:bg-blue-700/50" title="실행 취소">↺</button>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">도형</div>
                    <div className="grid grid-cols-3 gap-1">
                        <button onClick={() => setTool('arrow')} className={`p-1.5 rounded ${tool === 'arrow' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="화살표">↗</button>
                        <button onClick={() => setTool('line')} className={`p-1.5 rounded ${tool === 'line' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="직선"><DiagonalLineIcon /></button>
                        <button onClick={() => setTool('rect')} className={`p-1.5 rounded ${tool === 'rect' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="사각형"><RectangleIcon /></button>
                        <button onClick={() => setTool('circle')} className={`p-1.5 rounded ${tool === 'circle' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="원"><CircleIcon /></button>
                        <button onClick={() => setTool('ellipse')} className={`p-1.5 rounded ${tool === 'ellipse' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="타원">⬭</button>
                        <button onClick={() => setTool('dimension')} className={`p-1.5 rounded ${tool === 'dimension' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="치수"><RulerIcon /></button>
                        <button onClick={() => setTool('callout')} className={`p-1.5 rounded ${tool === 'callout' ? 'bg-red-700/40 ring-1 ring-red-400' : 'hover:bg-blue-700/50'}`} title="표시 도형"><CalloutIcon /></button>
                    </div>
                    <div className="flex gap-2 mt-2">
                        <div className="flex bg-blue-900/40 rounded p-0.5">
                            <button onClick={() => setFillStyle('outline')} className={`p-1 rounded ${fillStyle === 'outline' ? 'bg-blue-700/60 text-white shadow' : 'text-blue-300/60 hover:text-white'}`} title="윤곽선"><SquareOutlineIcon /></button>
                            <button onClick={() => setFillStyle('fill')} className={`p-1 rounded ${fillStyle === 'fill' ? 'bg-blue-700/60 text-white shadow' : 'text-blue-300/60 hover:text-white'}`} title="채우기"><SquareFillIcon /></button>
                        </div>
                        <div className="flex bg-blue-900/40 rounded p-0.5">
                            <button onClick={() => setLineStyle('solid')} className={`p-1 rounded ${lineStyle === 'solid' ? 'bg-blue-700/60 text-white shadow' : 'text-blue-300/60 hover:text-white'}`} title="실선"><LineSolidIcon /></button>
                            <button onClick={() => setLineStyle('dashed')} className={`p-1 rounded ${lineStyle === 'dashed' ? 'bg-blue-700/60 text-white shadow' : 'text-blue-300/60 hover:text-white'}`} title="점선"><LineDashedIcon /></button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">크기</div>
                    <div className="flex flex-col items-center gap-1 w-full">
                        <div className="flex items-center justify-between w-full bg-blue-900/40 rounded px-2 py-1 gap-2">
                            <span className="text-xs text-blue-300/80 mr-1">선:</span>
                            <input type="number" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} className="w-12 bg-transparent text-white text-center text-sm focus:outline-none font-bold" min="1" max="50" />
                            <span className="text-[10px] text-blue-400/60">px</span>
                        </div>

                        <div className="flex items-center justify-between w-full bg-blue-900/40 rounded px-2 py-1 mt-1 gap-2">
                            <span className="text-xs text-blue-300/80 mr-1">글자:</span>
                            <input type="number" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} className="w-12 bg-transparent text-white text-center text-sm focus:outline-none font-bold" min="10" max="100" />
                            <span className="text-[10px] text-blue-400/60">px</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-center px-4 gap-1 flex-grow min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">색상</div>
                    <div className="flex gap-2 items-start flex-wrap">
                        {/* 색상 모드 선택 버튼들 */}
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => setColorMode('line')}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${colorMode === 'line' ? 'bg-red-700/50 text-white ring-1 ring-red-400' : 'bg-blue-900/40 text-blue-200/80 hover:bg-blue-800/50'}`}
                                title="선색/도형색"
                            >
                                <div className="w-4 h-4 rounded border border-white/50" style={{ backgroundColor: color }}></div>
                                <span>선색</span>
                            </button>
                            <button
                                onClick={() => setColorMode('bg')}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${colorMode === 'bg' ? 'bg-red-700/50 text-white ring-1 ring-red-400' : 'bg-blue-900/40 text-blue-200/80 hover:bg-blue-800/50'}`}
                                title="배경색"
                            >
                                <div className="w-4 h-4 rounded border border-white/50" style={{ backgroundColor: bgColor }}></div>
                                <span>배경</span>
                            </button>
                            <button
                                onClick={() => setColorMode('text')}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${colorMode === 'text' ? 'bg-red-700/50 text-white ring-1 ring-red-400' : 'bg-blue-900/40 text-blue-200/80 hover:bg-blue-800/50'}`}
                                title="글자색"
                            >
                                <div className="w-4 h-4 rounded border border-white/50" style={{ backgroundColor: textColor }}></div>
                                <span>글자</span>
                            </button>
                        </div>

                        {/* 팔레트 그리드 */}
                        <div className="grid grid-cols-10 gap-1">
                            {paletteColors.map((c, idx) => {
                                const isSelected = (colorMode === 'line' && color === c) ||
                                    (colorMode === 'bg' && bgColor === c) ||
                                    (colorMode === 'text' && textColor === c);
                                return (
                                    <button
                                        key={idx + '-' + c}
                                        className={`w-5 h-5 rounded-sm border border-blue-900/50 hover:scale-110 transition-transform ${isSelected ? 'ring-2 ring-red-400 z-10' : ''}`}
                                        style={{ backgroundColor: c }}
                                        onClick={() => {
                                            if (colorMode === 'line') setColor(c);
                                            else if (colorMode === 'bg') setBgColor(c);
                                            else if (colorMode === 'text') setTextColor(c);
                                        }}
                                        title={c}
                                    />
                                );
                            })}
                        </div>

                        {/* 컬러피커 */}
                        <div className="flex flex-col items-center ml-2">
                            <label className="flex flex-col items-center cursor-pointer p-1 hover:bg-blue-700/50 rounded group">
                                <PaletteIcon className="w-6 h-6 text-blue-300/60 group-hover:text-white" />
                                <span className="text-[10px] text-blue-300/60 mt-1">편집</span>
                                <input
                                    type="color"
                                    value={colorMode === 'line' ? color : colorMode === 'bg' ? (bgColor.startsWith('rgba') ? '#000000' : bgColor) : textColor}
                                    onChange={(e) => updateColorAndPalette(e.target.value)}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* 번역 섹션 추가 */}
                <div className="flex flex-col items-center justify-center px-4 border-r border-blue-800/50 gap-1 min-w-max">
                    <div className="text-xs text-blue-300/80 font-bold mb-1">번역</div>
                    <div className="flex flex-col gap-2">
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="bg-blue-900/40 text-white text-xs rounded px-2 py-1 border border-blue-800/50 focus:outline-none focus:ring-1 focus:ring-red-400"
                            title="목표 언어 선택"
                        >
                            <option value="ko">한국어</option>
                            <option value="en">English</option>
                            <option value="ja">日本語</option>
                            <option value="zh">中文</option>
                            <option value="th">ไทย</option>
                        </select>
                        <button
                            onClick={handleTranslate}
                            disabled={isTranslating}
                            className="flex items-center justify-center gap-1 px-3 py-1 bg-red-700/60 hover:bg-red-600/70 disabled:bg-blue-900/40 text-white text-xs rounded transition-colors"
                            title="주석을 선택한 언어로 직접 변환"
                        >
                            <span>🌐</span>
                            <span>{isTranslating ? '번역 중...' : '변환'}</span>
                        </button>
                        {translationMessage && (
                            <div className={`text-[10px] text-center px-2 py-1 rounded ${translationMessage.startsWith('✓') ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30'
                                }`}>
                                {translationMessage}
                            </div>
                        )}
                    </div>
                </div>

            </div>

            <div className="flex-grow relative overflow-auto flex items-center justify-center cursor-crosshair p-8" style={{ backgroundColor: '#1a2640' }}>
                <div className="relative shadow-2xl bg-white">
                    <canvas
                        ref={canvasRef}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onClick={handleCanvasClick}
                        onDoubleClick={handleDoubleClick}
                        onContextMenu={(e) => e.preventDefault()}
                        className="block"
                    />

                    {editTextState && (
                        <textarea
                            ref={inputRef}
                            value={editTextState.text}
                            onChange={(e) => setEditTextState({ ...editTextState, text: e.target.value })}
                            onKeyDown={(e) => {
                                // Enter: 입력 완료 (Shift 키가 눌리지 않았을 때)
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleInputCommit();
                                }
                                // Shift+Enter는 기본 동작(줄바꿈) 허용
                            }}
                            onBlur={handleInputCommit}
                            autoFocus
                            placeholder="입력... (Enter: 완료, Shift+Enter: 줄바꿈)"
                            style={{
                                position: 'absolute',
                                left: `${editTextState.x}px`,
                                top: `${editTextState.y - 15}px`,
                                transform: 'translate(-50%, 0)',
                                zIndex: 100,
                                minWidth: '200px',
                                minHeight: '40px',
                                fontSize: `${fontSize}px`,
                                resize: 'both'
                            }}
                            className="bg-white text-black border-2 border-indigo-500 rounded px-2 py-1 shadow-lg focus:outline-none"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnnotationCanvas;
