
import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { Drawing, Project } from '../types';
import Button from './ui/Button';
import Icon from './Icon';
import Modal from './ui/Modal';
import Input from './ui/Input';

interface DrawingPadProps {
    project: Project;
}

const colors = ['#000000', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#FFFFFF'];
type Tool = 'pencil' | 'marker' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';

const DrawingPad: React.FC<DrawingPadProps> = ({ project }) => {
    const { t } = useTranslation();
    const { updateProject, isDrawingPadFullScreen, setDrawingPadFullScreen } = useContext(AppContext);
    
    const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(project.drawings[0] || null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [color, setColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [tool, setTool] = useState<Tool>('pencil');
    
    const [isTextModalOpen, setTextModalOpen] = useState(false);
    const [textInput, setTextInput] = useState('');
    const [textPos, setTextPos] = useState<{x: number, y: number} | null>(null);
    
    const saveTimeoutRef = useRef<number | null>(null);
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef<number>(-1);
    const isDrawingRef = useRef(false);
    const startPosRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const isMobile = window.innerWidth < 768;

    useEffect(() => {
        const newSelected = project.drawings.find(d => d.id === selectedDrawing?.id) || project.drawings[0] || null;
        setSelectedDrawing(newSelected);
    }, [project.drawings, selectedDrawing?.id]);

    const handleUpdateDrawing = useCallback((id: string, updates: Partial<Drawing>) => {
        const updatedDrawings = project.drawings.map(d => d.id === id ? { ...d, ...updates } : d);
        updateProject(project.id, { drawings: updatedDrawings });
    }, [project.drawings, project.id, updateProject]);

    const saveDrawingToProject = useCallback(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            const canvas = canvasRef.current;
            if (!canvas || !selectedDrawing) return;
            const dataUrl = canvas.toDataURL('image/png');
            handleUpdateDrawing(selectedDrawing.id, { dataUrl });
        }, 1500);
    }, [selectedDrawing, handleUpdateDrawing]);

    const updateUndoRedoState = useCallback(() => {
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
    }, []);

    const saveState = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL();
        const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        newHistory.push(dataUrl);
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;
        updateUndoRedoState();
    }, [updateUndoRedoState]);

    const restoreState = useCallback((index: number) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const dataUrl = historyRef.current[index];
        if (!ctx || !canvas || !dataUrl) return;
        const image = new Image();
        image.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
        };
        image.src = dataUrl;
        updateUndoRedoState();
    }, [updateUndoRedoState]);

    const initCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        
        const { width, height } = container.getBoundingClientRect();
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (selectedDrawing?.dataUrl) {
                const image = new Image();
                image.onload = () => {
                    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                    if (historyRef.current.length === 0) {
                        historyRef.current = [canvas.toDataURL()];
                        historyIndexRef.current = 0;
                    }
                    updateUndoRedoState();
                };
                image.src = selectedDrawing.dataUrl;
            }
        }
    }, [selectedDrawing?.id, updateUndoRedoState]);

    useEffect(() => {
        initCanvas();
        window.addEventListener('resize', initCanvas);
        return () => window.removeEventListener('resize', initCanvas);
    }, [initCanvas, isDrawingPadFullScreen]);

    const getContextSettings = useCallback((ctx: CanvasRenderingContext2D) => {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
        ctx.lineWidth = brushSize;
        ctx.globalAlpha = tool === 'marker' ? 0.3 : 1;
        ctx.globalCompositeOperation = 'source-over';
        return ctx;
    }, [tool, color, brushSize]);

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        let x, y;
        if ('touches' in e.nativeEvent) {
            const touch = (e as React.TouchEvent).touches[0];
            x = touch.clientX - rect.left;
            y = touch.clientY - rect.top;
        } else {
            const mouseEvent = e as React.MouseEvent;
            x = mouseEvent.clientX - rect.left;
            y = mouseEvent.clientY - rect.top;
        }
        
        if (tool === 'text') {
            setTextPos({ x, y });
            setTextModalOpen(true);
            return;
        }

        isDrawingRef.current = true;
        startPosRef.current = { x, y };
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
            getContextSettings(ctx);
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawingRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        let x, y;
        if ('touches' in e.nativeEvent) {
            const touch = (e as React.TouchEvent).touches[0];
            x = touch.clientX - rect.left;
            y = touch.clientY - rect.top;
        } else {
            const mouseEvent = e as React.MouseEvent;
            x = mouseEvent.clientX - rect.left;
            y = mouseEvent.clientY - rect.top;
        }

        if (['pencil', 'marker', 'eraser'].includes(tool)) {
            ctx.lineTo(x, y);
            ctx.stroke();
        } else {
            const dataUrl = historyRef.current[historyIndexRef.current];
            if (dataUrl) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    
                    getContextSettings(ctx);
                    ctx.beginPath();
                    const sx = startPosRef.current.x;
                    const sy = startPosRef.current.y;
                    
                    if (tool === 'line') {
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(x, y);
                    } else if (tool === 'rectangle') {
                        ctx.rect(sx, sy, x - sx, y - sy);
                    } else if (tool === 'circle') {
                        const radius = Math.sqrt(Math.pow(x - sx, 2) + Math.pow(y - sy, 2));
                        ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
                    }
                    ctx.stroke();
                };
                img.src = dataUrl;
            }
        }
    };

    const finishDrawing = () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        saveState();
        saveDrawingToProject();
    };

    const handleNewDrawing = () => {
        const newDrawing: Drawing = { id: `drawing-${Date.now()}`, title: t('untitledDrawing'), dataUrl: '', createdAt: new Date().toISOString() };
        updateProject(project.id, { drawings: [newDrawing, ...project.drawings] });
        setSelectedDrawing(newDrawing);
        historyRef.current = [];
        historyIndexRef.current = -1;
    };

    const handleDeleteDrawing = () => {
        if (!selectedDrawing) return;
        if (window.confirm("¿Eliminar este dibujo permanentemente?")) {
            const updated = project.drawings.filter(d => d.id !== selectedDrawing.id);
            updateProject(project.id, { drawings: updated });
            setSelectedDrawing(updated[0] || null);
            historyRef.current = [];
            historyIndexRef.current = -1;
        }
    };

    const handleUndo = () => {
        if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            restoreState(historyIndexRef.current);
            saveDrawingToProject();
        }
    };

    const handleRedo = () => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            restoreState(historyIndexRef.current);
            saveDrawingToProject();
        }
    };

    const placeText = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && textPos && textInput.trim()) {
            ctx.font = `${brushSize * 4}px Inter, sans-serif`;
            ctx.fillStyle = color;
            ctx.fillText(textInput, textPos.x, textPos.y);
            saveState();
            saveDrawingToProject();
            setTextInput('');
            setTextPos(null);
            setTextModalOpen(false);
        }
    };

    return (
        <div className={`flex flex-col md:flex-row gap-6 ${!isDrawingPadFullScreen ? 'animate-fade-in' : ''} ${isDrawingPadFullScreen ? 'fixed inset-0 !z-[9999999] bg-white dark:bg-black p-4' : 'h-full bg-neutral-100 dark:bg-neutral-900 p-4 rounded-lg'}`}>
            <Modal isOpen={isTextModalOpen} onClose={() => setTextModalOpen(false)} title="Agregar Texto">
                <div className="space-y-4">
                    <Input value={textInput} onChange={e => setTextInput(e.target.value)} placeholder="Escribe algo..." autoFocus onKeyDown={e => e.key === 'Enter' && placeText()}/>
                    <div className="flex justify-end mt-4"><Button onClick={placeText}>Insertar</Button></div>
                </div>
            </Modal>

            <div className={`w-full md:w-1/3 md:max-w-xs flex-col flex bg-light-surface dark:bg-dark-surface rounded-xl shadow-sm p-0 overflow-hidden h-48 md:h-full border border-neutral-200 dark:border-neutral-800 ${isDrawingPadFullScreen ? 'hidden lg:flex' : ''}`}>
                <div className="p-4 border-b border-light-border dark:border-dark-border"><Button onClick={handleNewDrawing} variant="primary" className="w-full"><Icon name="plus" className="w-4 h-4"/> Nuevo Dibujo</Button></div>
                <ul className="flex-1 overflow-y-auto custom-scrollbar">
                    {project.drawings.map(d => (
                        <li key={d.id}>
                            <button onClick={() => setSelectedDrawing(d)} className={`w-full text-left p-4 hover:bg-black/5 dark:hover:bg-white/5 border-b dark:border-neutral-800 last:border-0 ${selectedDrawing?.id === d.id ? 'bg-brand-accent/20 border-l-4 border-brand-primary font-bold' : ''}`}>
                                <p className="truncate text-sm">{d.title}</p>
                                <p className="text-[10px] text-neutral-400 mt-1 uppercase font-bold">{new Date(d.createdAt).toLocaleDateString()}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="flex-1 flex flex-col gap-3 relative h-full min-h-[300px]">
                {selectedDrawing ? (
                    <>
                        <div className="flex-shrink-0 z-10 flex justify-center">
                            <div className="bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md p-2 rounded-2xl shadow-xl flex items-center gap-2 px-4 border border-neutral-200 dark:border-neutral-700 overflow-x-auto no-scrollbar max-w-full">
                                <div className="min-w-[140px] flex-shrink-0 border-r dark:border-neutral-700 pr-2">
                                    <input value={selectedDrawing.title} onChange={(e) => handleUpdateDrawing(selectedDrawing.id, { title: e.target.value })} className="bg-transparent border-none focus:ring-0 text-sm font-black w-full text-brand-primary" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" className="!p-2" onClick={handleUndo} disabled={!canUndo} title="Deshacer"><Icon name="undo" className="w-4 h-4"/></Button>
                                    <Button variant="ghost" size="sm" className="!p-2" onClick={handleRedo} disabled={!canRedo} title="Redo"><Icon name="redo" className="w-4 h-4"/></Button>
                                    <Button variant="ghost" size="sm" className="!p-2 text-red-500 hover:bg-red-50" onClick={handleDeleteDrawing} title="Eliminar"><Icon name="trash" className="w-4 h-4"/></Button>
                                </div>
                                <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-700 mx-1"></div>
                                <Button variant="ghost" size="sm" className="!p-2" onClick={() => setDrawingPadFullScreen(!isDrawingPadFullScreen)} title="Full Screen">
                                    <Icon name={isDrawingPadFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                                </Button>
                            </div>
                        </div>

                        <div ref={containerRef} className="flex-1 relative bg-white shadow-2xl rounded-3xl overflow-hidden touch-none h-full border border-neutral-200 cursor-crosshair">
                             <canvas 
                                ref={canvasRef} 
                                onMouseDown={startDrawing} 
                                onMouseUp={finishDrawing} 
                                onMouseMove={draw} 
                                onTouchStart={startDrawing} 
                                onTouchEnd={finishDrawing} 
                                onTouchMove={draw} 
                                className="w-full h-full" 
                                style={{ touchAction: 'none' }}
                            />
                        </div>

                        <div className="flex-shrink-0 z-10 flex justify-center pb-2">
                            <div className="bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md p-2 rounded-[2rem] shadow-xl flex items-center gap-3 px-6 border border-neutral-200 dark:border-neutral-700 overflow-x-auto no-scrollbar max-w-full">
                                <div className="flex gap-1">
                                    {['pencil','marker','eraser','line','rectangle','circle','text'].map(tId => (
                                        <button key={tId} onClick={() => setTool(tId as Tool)} className={`p-2.5 rounded-full transition-all ${tool === tId ? 'bg-brand-primary text-white shadow-lg scale-110' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}>
                                            <Icon name={tId as any} className="w-5 h-5"/>
                                        </button>
                                    ))}
                                </div>
                                <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-700 mx-1"></div>
                                <div className="flex items-center gap-2">
                                    {colors.slice(0, isMobile ? 6 : colors.length).map(c => (
                                        <button key={c} onClick={() => setColor(c)} style={{backgroundColor: c}} className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-125 ${color === c ? 'border-brand-primary ring-2 ring-brand-primary/30 scale-110' : 'border-white dark:border-neutral-800'}`}/>
                                    ))}
                                </div>
                                <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-700 mx-1"></div>
                                <div className="flex items-center gap-2">
                                    <input type="range" min="1" max="50" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-20 accent-brand-primary" title="Tamaño del pincel" />
                                </div>
                            </div>
                        </div>
                    </>
                 ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 text-center p-8 bg-white dark:bg-dark-surface rounded-3xl border border-dashed border-neutral-300">
                        <Icon name="drawingpad" className="w-20 h-20 mb-4 opacity-20" />
                        <p className="text-lg font-black mb-4">No hay dibujos seleccionados.</p>
                        <Button onClick={handleNewDrawing} variant="primary" className="px-10 py-3 shadow-xl">Crear Primer Dibujo</Button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrawingPad;
