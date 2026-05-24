
// Se preserva la integridad total de los otros módulos (Socios, Chat, Finanzas, etc.)
import React, { useState, useContext, useEffect, useRef, useMemo } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import { generatePresentationContent, generateImage, generatePresentationCode, regenerateSlideContent } from '../services/geminiService';
import { Presentation, PresentationSlide, PresentationVisualAsset, Project, Document, UserProfile } from '../types';
import Modal from './ui/Modal';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, deleteDoc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import jsPDF from 'jspdf';
import { getPlanConfig } from '../types';
import DriveFilePicker from './ui/DriveFilePicker';
import { consumeServerFeature } from '../services/usageService';

// Types for external library (pptxgenjs is loaded in index.html)
declare global {
    interface Window {
        html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
        PptxGenJS: any;
    }
}

const THEMES = {
    modern: { id: 'modern', name: 'Modern Blue', bg: 'bg-white dark:bg-neutral-950', text: 'text-neutral-900 dark:text-white', accent: 'text-blue-600', accentBg: 'bg-blue-600', gradient: 'bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-neutral-950 dark:via-neutral-900 dark:to-indigo-950', slideStyle: 'font-sans', 
        titleAnim: 'animate-pres-slide-right', contentAnim: 'animate-pres-zoom-up', visualAnim: 'animate-pres-blur-in' },
    cyberpunk: { id: 'cyberpunk', name: 'Neon Dark', bg: 'bg-black', text: 'text-cyan-400', accent: 'text-pink-500', accentBg: 'bg-pink-500', gradient: 'bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900 via-black to-black', slideStyle: 'font-mono tracking-widest', 
        titleAnim: 'animate-pres-scale-up', contentAnim: 'animate-pres-slide-left', visualAnim: 'animate-pulse-once' },
    elegant: { id: 'elegant', name: 'Luxury Serif', bg: 'bg-[#f8f5f2]', text: 'text-[#2c2c2c]', accent: 'text-[#c9a66b]', accentBg: 'bg-[#c9a66b]', gradient: 'bg-gradient-to-b from-[#fdfbf7] to-[#f2efe9]', slideStyle: 'font-serif', 
        titleAnim: 'animate-pres-blur-in', contentAnim: 'animate-subtle-slide-in-up', visualAnim: 'animate-pres-zoom-up' },
    minimal: { id: 'minimal', name: 'Stark Minimal', bg: 'bg-white', text: 'text-black', accent: 'text-black', accentBg: 'bg-black', gradient: 'bg-white', slideStyle: 'font-sans tracking-tight', 
        titleAnim: 'animate-fade-in', contentAnim: 'animate-pres-slide-right', visualAnim: 'animate-pres-blur-in' },
    masterpiece: { id: 'masterpiece', name: 'Masterpiece Élite', bg: 'bg-neutral-950', text: 'text-white', accent: 'text-indigo-400', accentBg: 'bg-indigo-600', gradient: 'bg-gradient-to-br from-neutral-950 via-indigo-950 to-black', slideStyle: 'font-sans italic', 
        titleAnim: 'animate-pres-zoom-up', contentAnim: 'animate-pres-slide-right', visualAnim: 'animate-pres-blur-in' },
};

const FONTS = [
    { id: 'font-sans', name: 'Inter Sans' },
    { id: 'font-serif', name: 'Playfair Display' },
    { id: 'font-mono', name: 'JetBrains Mono' },
    { id: 'font-poppins', name: 'Poppins Bold' }
];

const GRADIENTS = [
    'bg-white dark:bg-neutral-900',
    'bg-gradient-to-br from-blue-500 to-purple-600',
    'bg-gradient-to-br from-green-400 to-blue-500',
    'bg-gradient-to-br from-orange-400 to-red-500',
    'bg-gradient-to-br from-neutral-800 to-black',
    'bg-gradient-to-br from-pink-500 to-rose-600',
    'bg-gradient-to-br from-cyan-400 to-indigo-500'
];

const getYoutubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|\/shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

const getBase64FromUrl = async (url: string): Promise<string> => {
    try {
        const response = await fetch(url, { mode: 'cors' });
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("No se pudo convertir imagen a base64, se usará URL original", e);
        return url;
    }
};

const sanitizeExternalUrl = (url: string) => {
    if (!url) return "";
    let cleanUrl = url.trim();
    if (cleanUrl.includes('canva.com')) {
        if (cleanUrl.includes('/design/')) {
            if (!cleanUrl.includes('/view?embed')) {
                const baseUrl = cleanUrl.split('?')[0].replace(/\/edit.*$/, '').replace(/\/watch.*$/, '');
                if (baseUrl.endsWith('/view')) {
                    cleanUrl = baseUrl + '?embed';
                } else if (!baseUrl.endsWith('/view')) {
                    if (baseUrl.includes('/design/')) {
                        const parts = baseUrl.split('/');
                        if (parts.length >= 5) {
                            const designId = parts[4];
                            const name = parts[5] || 'view';
                            cleanUrl = `https://www.canva.com/design/${designId}/${name}/view?embed`;
                        }
                    }
                } else {
                    cleanUrl = baseUrl + '?embed';
                }
            }
        }
    }
    if (cleanUrl.includes('docs.google.com/presentation') && !cleanUrl.includes('/embed')) {
        cleanUrl = cleanUrl.replace(/\/edit.*$/, '/embed').replace(/\/pub.*$/, '/embed');
    }
    if (cleanUrl.includes('sharepoint.com') || cleanUrl.includes('live.com')) {
        if (!cleanUrl.includes('action=embedview')) {
            cleanUrl += (cleanUrl.includes('?') ? '&' : '?') + 'action=embedview';
        }
    }
    return cleanUrl;
};

const AssetRenderer: React.FC<{ 
    asset: PresentationVisualAsset; 
    isExporting?: boolean; 
    isPresentationMode?: boolean; 
    onUpdate: (field: string, value: any) => void;
    onDelete: () => void;
    slideIndex: number;
    slideTitle: string;
    transparentWrapper?: boolean;
    containerRef?: React.RefObject<HTMLDivElement>;
}> = ({ asset, isExporting, isPresentationMode, onUpdate, onDelete, slideIndex, slideTitle, transparentWrapper, containerRef }) => {
    const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(asset.url.startsWith('data:') ? 'loaded' : 'loading');
    const [currentUrl, setCurrentUrl] = useState(asset.url);
    const [triedFallback, setTriedFallback] = useState(false);

    const ytId = getYoutubeId(currentUrl);
    const isYoutube = asset.type === 'youtube' || !!ytId;
    const isVideo = asset.type === 'video' || currentUrl.toLowerCase().includes('.mp4') || currentUrl.startsWith('data:video');
    const scale = asset.scale || 1.0;
    const fit = asset.objectFit || 'contain';

    // RESET STATUS WHEN URL CHANGES
    useEffect(() => {
        if (asset.url.startsWith('data:')) {
            setStatus('loaded');
        } else {
            setStatus('loading');
        }
        setCurrentUrl(asset.url);
        setTriedFallback(false);
    }, [asset.url]);

    const assetContainerStyle = { 
        transform: `scale(${scale})`, 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
    };

    const handleLoad = () => setStatus('loaded');
    
    const handleError = () => {
        if (!triedFallback && !isYoutube && !isVideo && !currentUrl.startsWith('data:')) {
            setTriedFallback(true);
            const fallbackUrl = `https://picsum.photos/seed/${slideIndex + 120}/1024/768`;
            setCurrentUrl(fallbackUrl);
        } else {
            setStatus('error');
        }
    };

    return (
        <motion.div 
            drag={!isExporting && !isPresentationMode}
            dragConstraints={containerRef || { left: -2000, right: 2000, top: -1000, bottom: 1000 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
                if (containerRef?.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    // info.point is absolute screen coordinates. We need coordinates relative to the container.
                    const relativeX = info.point.x - rect.left;
                    const relativeY = info.point.y - rect.top;
                    
                    // Convert back to percentages (assuming 'right' is 100 - x%)
                    const topPct = (relativeY / rect.height) * 100;
                    const rightPct = 100 - (relativeX / rect.width) * 100;
                    
                    // Constrain between 0 and 100
                    const finalTop = Math.max(0, Math.min(100, topPct));
                    const finalRight = Math.max(0, Math.min(100, rightPct));
                    
                    onUpdate('top', `${finalTop}%`);
                    onUpdate('right', `${finalRight}%`);
                }
            }}
            className={`relative flex-1 h-full min-h-0 min-w-0 group/asset rounded-2xl ${!transparentWrapper ? 'overflow-hidden shadow-2xl border border-white/5 bg-neutral-200 dark:bg-neutral-900' : '!overflow-visible z-50'} flex items-center justify-center cursor-move`}
        >
            {status === 'loading' && !isYoutube && !isVideo && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                    <Spinner className="w-8 h-8" text="Cargando..." />
                </div>
            )}
            
            {status === 'error' && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-50 dark:bg-red-900/10 p-4 text-center">
                    <Icon name="close" className="w-8 h-8 text-red-400 mb-2"/>
                    <p className="text-[10px] font-bold text-red-500 uppercase">Error de servidor IA</p>
                    <button onClick={() => { setStatus('loading'); setTriedFallback(false); }} className="mt-2 text-[8px] font-black underline uppercase text-neutral-400">Reintentar</button>
                </div>
            )}

            <div style={assetContainerStyle}>
                {isYoutube ? (
                    isExporting ? ( 
                        <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 text-white p-4"> 
                            <Icon name="video" className="w-12 h-12 mb-2 opacity-40"/> 
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Contenido YouTube</p> 
                        </div> 
                    ) : (
                        <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?autoplay=${isPresentationMode ? 1 : 0}&mute=1&loop=1&playlist=${ytId}`} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} />
                    )
                ) : isVideo ? (
                    <video src={currentUrl} controls={!isExporting} autoPlay={isPresentationMode || isExporting} muted loop playsInline className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} />
                ) : (
                    <img 
                        key={asset.id}
                        src={currentUrl} 
                        alt="Slide Asset" 
                        onLoad={handleLoad}
                        onError={handleError}
                        className={`w-full h-full transition-opacity duration-500 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${fit === 'cover' ? 'object-cover' : 'object-contain'}`} 
                    />
                )}
            </div>

            {!isExporting && !isPresentationMode && (
                <div className="absolute top-2 right-2 z-[60] flex flex-col gap-2 opacity-0 group-hover/asset:opacity-100 transition-opacity">
                    <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md p-2 rounded-xl shadow-xl flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-black uppercase text-neutral-400">Escala</span>
                            <input type="range" min="0.2" max="4" step="0.1" value={scale} onChange={(e) => onUpdate('scale', parseFloat(e.target.value))} className="w-16 accent-brand-primary" />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => onUpdate('objectFit', fit === 'contain' ? 'cover' : 'contain')} className="p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-xs font-bold text-black dark:text-white" title="Toggle Fit"> <Icon name="expand" className="w-3 h-3 text-black dark:text-white" /> </button>
                            <button onClick={onDelete} className="p-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-bold" title="Remove Asset"> <Icon name="trash" className="w-3 h-3" /> </button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

const SlideThumbnail: React.FC<{ 
    slide: PresentationSlide, 
    index: number, 
    isActive: boolean, 
    onClick: () => void, 
    onDelete: () => void, 
    onDuplicate: () => void, 
    onMove: (dir: 'up' | 'down') => void,
    theme: any,
    isReadOnly?: boolean 
}> = ({ slide, index, isActive, onClick, onDelete, onDuplicate, onMove, theme, isReadOnly }) => {
    const isMasterpiece = !!slide.customHtml;
    const finalAssets = slide.visualAssets || [];

    return (
        <div 
            onClick={onClick}
            className={`group relative w-full aspect-video rounded-xl border-2 px-0 py-0 cursor-pointer transition-all duration-300 hover:scale-105 overflow-hidden ${isActive ? 'border-brand-primary ring-2 ring-brand-primary/30 shadow-lg' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400'}`}
        >
            <div className={`absolute inset-0 scale-[0.25] origin-top-left w-[400%] h-[400%] pointer-events-none select-none [container-type:size]`}>
                 <SlideCanvas 
                    slide={slide} 
                    index={index} 
                    theme={theme} 
                    onEdit={() => {}} 
                    isExporting={true}
                    currentStep={0}
                    isReadOnly={true}
                />
            </div>
            {!isReadOnly && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 z-20 rounded-lg">
                     <button onClick={(e) => { e.stopPropagation(); onMove('up'); }} className="p-1 bg-white text-brand-primary rounded-full shadow-lg hover:scale-110" title="Subir"><Icon name="chevronDown" className="w-3 h-3 rotate-180"/></button>
                     <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1 bg-white text-brand-primary rounded-full shadow-lg hover:scale-110" title="Duplicar"><Icon name="copy" className="w-3 h-3"/></button>
                     <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 bg-red-50 text-red-500 rounded-full shadow-lg hover:scale-110" title="Eliminar"><Icon name="trash" className="w-3 h-3"/></button>
                     <button onClick={(e) => { e.stopPropagation(); onMove('down'); }} className="p-1 bg-white text-brand-primary rounded-full shadow-lg hover:scale-110" title="Bajar"><Icon name="chevronDown" className="w-3 h-3"/></button>
                </div>
            )}
            <div className="absolute bottom-1 right-1 bg-black/50 backdrop-blur-md text-white text-[8px] px-1.5 py-0.5 rounded-full font-black z-10">{index + 1}</div>
        </div>
    );
};

const SlideCanvas: React.FC<{ 
    slide: PresentationSlide, 
    index: number,
    theme: any, 
    onEdit: (field: string, value: any) => void, 
    onUndo?: () => void,
    onRedo?: () => void,
    onRegenerateSlide?: (prompt: string) => Promise<boolean>,
    canUndo?: boolean,
    canRedo?: boolean,
    isExporting?: boolean,
    isPresentationMode?: boolean,
    currentStep: number, 
    onNextStep?: () => void,
    isReadOnly?: boolean
}> = ({ slide, index, theme, onEdit, onUndo, onRedo, onRegenerateSlide, canUndo, canRedo, isExporting, isPresentationMode, currentStep, onNextStep, isReadOnly }) => {
    const { currentUser } = useContext(AppContext);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
    const [isUploadingAsset, setIsUploadingAsset] = useState(false);
    const [isEditingCode, setIsEditingCode] = useState(false);
    const [isYoutubeModalOpen, setIsYoutubeModalOpen] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [localCode, setLocalCode] = useState(slide.customHtml || "");
    const slideRef = useRef<HTMLDivElement>(null);
    const [regeneratePrompt, setRegeneratePrompt] = useState("");
    const [isRegenerating, setIsRegenerating] = useState(false);

    useEffect(() => {
        setLocalCode(slide.customHtml || "");
    }, [slide.id, slide.customHtml]);

    const handleRegenerate = async () => {
        if (!regeneratePrompt.trim() || !onRegenerateSlide) return;
        setIsRegenerating(true);
        try {
            const success = await onRegenerateSlide(regeneratePrompt);
            if (success) setRegeneratePrompt("");
        } finally {
            setIsRegenerating(false);
        }
    };

    const handleCodeChange = (newCode: string) => {
        setLocalCode(newCode);
    };

    const commitCodeChange = () => {
        if (localCode !== slide.customHtml) {
            onEdit('customHtml', localCode);
        }
    };

    const handleUndo = () => {
        if (onUndo) onUndo();
    };

    const handleRedo = () => {
        if (onRedo) onRedo();
    };
    
    // Drag controls for text blocks
    const titleDrag = useDragControls();
    const contentDrag = useDragControls();

    const isMasterpiece = !!slide.customHtml;

    const visualAssets = useMemo(() => {
        if (slide.visualAssets && slide.visualAssets.length > 0) return slide.visualAssets;
        
        if (isMasterpiece) return []; // Masterpiece doesn't use placeholder background images natively here

        const rawCue = slide.visualCue || `${slide.title} corporate business`;
        const ytId = getYoutubeId(rawCue);
        const isVid = rawCue.toLowerCase().includes('.mp4') || rawCue.startsWith('data:video');
        
        if (ytId || isVid) {
            return [{ id: `auto-${slide.id}`, url: rawCue, type: ytId ? 'youtube' : 'video', scale: 1.0, objectFit: 'contain' }];
        }

        const normalize = (txt: string) => {
            return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
                      .replace(/[^a-zA-Z\s]/g, '') 
                      .trim().split(/\s+/).slice(0, 2).join(','); 
        };

        const cleanKeywords = normalize(slide.visualCue || slide.title || 'business');
        const uniqueSeed = (index + 1) * 777 + slide.id.length;

        return [{
            id: `auto-${slide.id}`,
            url: `https://loremflickr.com/1024/768/${encodeURIComponent(cleanKeywords || 'business')}?lock=${uniqueSeed}`,
            type: 'image',
            scale: 1.0,
            objectFit: 'cover' 
        } as PresentationVisualAsset];
    }, [slide.id, slide.visualCue, slide.title, slide.visualAssets, slide.bullets, index, isMasterpiece]); 

    const handleUpdateAsset = (assetId: string, field: string, value: any) => {
        const currentAssets = (slide.visualAssets && slide.visualAssets.length > 0) ? slide.visualAssets : visualAssets;
        const updated = currentAssets.map(a => a.id === assetId ? { ...a, [field]: value } : a);
        onEdit('visualAssets', updated);
    };

    const handleDeleteAsset = (assetId: string) => {
        const currentAssets = (slide.visualAssets && slide.visualAssets.length > 0) ? slide.visualAssets : visualAssets;
        const updated = currentAssets.filter(a => a.id !== assetId);
        onEdit('visualAssets', updated);
    };

    const compressImage = (file: File, maxWidth = 1280, maxHeight = 1280, quality = 0.7): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height *= maxWidth / width;
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width *= maxHeight / height;
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(event.target?.result as string);
                        return;
                    }
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsUploadingAsset(true);
            try {
                let fileUrl: string;
                if (!currentUser) return;
                
                const fileId = `pres-upload-${Date.now()}`;
                const uploaded = await uploadWithQuotaCheck({
                    userId: currentUser.uid,
                    data: file,
                    path: safeStoragePath('users', currentUser.uid, 'drive', `${fileId}_${file.name}`),
                    sizeBytes: file.size,
                    metadata: { contentType: file.type || 'application/octet-stream' }
                });
                fileUrl = uploaded.url;

                const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
                const snap = await getDoc(settingsRef);
                const currentFiles = snap.exists() ? (snap.data().personalFiles || []) : [];
                const newDriveFile = {
                    id: fileId,
                    name: file.name,
                    url: fileUrl,
                    type: file.type,
                    size: file.size,
                    date: new Date().toISOString(),
                    origin: 'PresentationBuilder',
                    parentId: 'root',
                    parentName: 'Root',
                };
                await setDoc(settingsRef, { personalFiles: [newDriveFile, ...currentFiles] }, { merge: true });
                
                if (slide.customHtml) {
                    const newAsset: PresentationVisualAsset = {
                        id: `asset-${Date.now()}`,
                        url: fileUrl,
                        type: file.type.startsWith('video') ? 'video' : 'image',
                        scale: 1.0,
                        objectFit: 'contain'
                    };
                    const updated = [...(slide.visualAssets || []), newAsset].slice(0, 2); 
                    onEdit('visualAssets', updated);
                } else {
                    const newAsset: PresentationVisualAsset = {
                        id: `asset-${Date.now()}`,
                        url: fileUrl,
                        type: file.type.startsWith('video') ? 'video' : 'image',
                        scale: 1.0,
                        objectFit: 'contain'
                    };
                    const updated = [...(slide.visualAssets || []), newAsset].slice(0, 2); 
                    onEdit('visualAssets', updated);
                }
            } catch (error) {
                console.error("Error processing file:", error);
            } finally {
                setIsUploadingAsset(false);
            }
            
            // Reset input so the same file can be selected again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDriveSelect = (fileData: { name: string, url: string, type: string, base64Data: string }) => {
        const newAsset: PresentationVisualAsset = {
            id: `asset-${Date.now()}`,
            url: fileData.url,
            type: fileData.type.startsWith('video') ? 'video' : 'image',
            scale: 1.0,
            objectFit: 'cover'
        };
        const updated = [newAsset, ...(slide.visualAssets || []).slice(0, 1)];
        onEdit('visualAssets', updated);
    };

    const handleConfirmYoutube = () => {
        if (youtubeUrl.trim()) {
            const ytId = getYoutubeId(youtubeUrl);
            const newAsset: PresentationVisualAsset = {
                id: `asset-${Date.now()}`,
                url: youtubeUrl.trim(),
                type: ytId ? 'youtube' : (youtubeUrl.toLowerCase().includes('.mp4') ? 'video' : 'image'),
                scale: 1.0,
                objectFit: 'contain'
            };
            const updated = [newAsset, ...(slide.visualAssets || []).slice(0, 1)];
            onEdit('visualAssets', updated);
            setYoutubeUrl("");
            setIsYoutubeModalOpen(false);
        }
    };

    const handleAddVideoLink = () => {
        setIsYoutubeModalOpen(true);
    };

    const activeFont = slide.fontFamily || theme.slideStyle;
    const forcedTextColor = slide.textColor === 'white' ? 'text-white' : slide.textColor === 'black' ? 'text-black' : theme.text;

    const textStyle = {
        textAlign: slide.textAlign || 'left',
        fontWeight: slide.fontWeight || 'normal',
        fontStyle: slide.fontStyle || 'normal',
        fontSize: slide.fontSizeLevel ? `calc(${(1.8 + (slide.fontSizeLevel * 0.15))}cqw)` : '2.2cqw'
    };

    const titleStyle = {
        textAlign: slide.textAlign || 'left',
        fontWeight: '900', 
        fontStyle: slide.fontStyle || 'normal',
        fontSize: '4.5cqw'
    };

    const isEditable = !isExporting && !isPresentationMode && !isReadOnly;
    const visibleBullets = isPresentationMode ? slide.bullets.slice(0, currentStep + 1) : slide.bullets;
    const finalAssets = (slide.visualAssets && slide.visualAssets.length > 0) ? slide.visualAssets : visualAssets;

    // Use fixed percentage padding to ensure text and assets scale identically between editor and presenter
    const slidePadding = "p-[8%]";

    const processedHtml = useMemo(() => {
        if (!slide.customHtml) return "";
        if (isEditable) return slide.customHtml;
        // Si no es editable, forzamos que todos los contenteditable sean false
        return slide.customHtml.replace(/contenteditable="true"/g, 'contenteditable="false"');
    }, [slide.customHtml, isEditable]);

    if (slide.customHtml) {
        return (
            <div ref={slideRef} className={`w-full h-full relative group [container-type:size] ${slidePadding} ${!isEditable ? 'pointer-events-none select-none' : ''}`}>
                {isYoutubeModalOpen && (
                    <Modal isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} title="Añadir Video">
                        <div className="space-y-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pega el link de YouTube o video MP4</p>
                            <Input 
                                autoFocus
                                value={youtubeUrl} 
                                onChange={e => setYoutubeUrl(e.target.value)} 
                                placeholder="https://www.youtube.com/watch?v=..." 
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirmYoutube()}
                            />
                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="ghost" onClick={() => setIsYoutubeModalOpen(false)}>Cancelar</Button>
                                <Button onClick={handleConfirmYoutube}>Añadir</Button>
                            </div>
                        </div>
                    </Modal>
                )}
                {isUploadingAsset && (
                    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-2xl">
                        <Spinner className="w-8 h-8 text-brand-primary" text="Subiendo foto..." />
                    </div>
                )}
                <DriveFilePicker isOpen={isDrivePickerOpen} onClose={() => setIsDrivePickerOpen(false)} onSelect={handleDriveSelect} allowedTypes={['image/', 'video/']} />
                <style dangerouslySetInnerHTML={{ __html: `
                    @import "tailwindcss";
                    .masterpiece-slide [contenteditable="true"]:focus { outline: 2px solid #555; outline-offset: 4px; border-radius: 4px; }
                ` }} />
                
                {isEditingCode ? (
                    <textarea 
                        id="masterpiece-textarea"
                        className="w-full h-full bg-neutral-950 text-emerald-400 font-mono text-sm p-4 sm:p-8 focus:outline-none resize-none custom-scrollbar"
                        value={localCode}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        onBlur={commitCodeChange}
                        placeholder="<!-- Escribe o pega tu código HTML/Tailwind aquí -->"
                        spellCheck={false}
                    />
                ) : (
                    <div 
                        className="masterpiece-slide w-full h-full overflow-y-auto no-scrollbar relative z-10"
                        dangerouslySetInnerHTML={{ __html: processedHtml }}
                        onBlurCapture={(e) => {
                            if (isEditable && (e.target as HTMLElement).hasAttribute('contenteditable')) {
                                onEdit('customHtml', (e.currentTarget as HTMLElement).innerHTML);
                            }
                        }}
                    />
                )}

                {finalAssets.length > 0 && !isEditingCode && (
                    <div className="absolute inset-0 pointer-events-none z-[1000]">
                        {finalAssets.map(asset => (
                            <div key={asset.id} className="absolute pointer-events-auto" style={{
                                width: `${(asset.scale || 1) * 20}%`,
                                height: 'auto',
                                aspectRatio: '1/1',
                                top: asset.top || '10%',
                                right: asset.right || '10%'
                            }}>
                                <AssetRenderer 
                                    asset={asset} 
                                    isExporting={isExporting} 
                                    isPresentationMode={isPresentationMode} 
                                    transparentWrapper={true}
                                    onUpdate={(field, val) => handleUpdateAsset(asset.id, field, val)}
                                    onDelete={() => handleDeleteAsset(asset.id)}
                                    slideIndex={index}
                                    slideTitle={slide.title}
                                    containerRef={slideRef}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {isEditable && (
                    <div className="absolute top-4 left-4 right-4 z-[500] flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-white/90 dark:bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-3xl border border-neutral-200 dark:border-white/10 flex items-center gap-4 shadow-2xl">
                             <button onClick={() => {
                                 if (isEditingCode) {
                                     onEdit('customHtml', localCode);
                                 }
                                 setIsEditingCode(!isEditingCode);
                             }} className={`p-1.5 rounded-lg flex items-center gap-2 px-4 uppercase text-[10px] font-black tracking-widest transition-colors ${isEditingCode ? 'bg-indigo-600 text-white' : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20'}`}><Icon name="code" className="w-4 h-4"/> {isEditingCode ? 'Ver Visual' : 'Editar Código HTML'}</button>
                             <div className="flex gap-1 items-center bg-neutral-200 dark:bg-neutral-800 p-1 rounded-xl">
                                 <button 
                                     onMouseDown={(e) => e.preventDefault()} 
                                     onClick={onUndo} 
                                     className="p-1.5 text-neutral-500 hover:text-brand-primary disabled:opacity-30"
                                     title="Deshacer (Undo)"
                                     disabled={!canUndo}
                                 >
                                     <Icon name="undo" className="w-3 h-3"/>
                                 </button>
                                 <button 
                                     onMouseDown={(e) => e.preventDefault()} 
                                     onClick={onRedo} 
                                     className="p-1.5 text-neutral-500 hover:text-brand-primary disabled:opacity-30"
                                     title="Rehacer (Redo)"
                                     disabled={!canRedo}
                                 >
                                     <Icon name="redo" className="w-3 h-3"/>
                                 </button>
                             </div>
                             <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700"></div>
                             <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg flex items-center gap-2 px-4 uppercase text-[10px] font-black tracking-widest hover:bg-brand-primary/20 transition-colors"><Icon name="upload" className="w-4 h-4"/> Subir PC</button>
                             <button onClick={() => setIsDrivePickerOpen(true)} className="p-1.5 bg-indigo-500/10 text-indigo-500 rounded-lg flex items-center gap-2 px-4 uppercase text-[10px] font-black tracking-widest hover:bg-indigo-500/20 transition-colors"><Icon name="cloud" className="w-4 h-4"/> Goatify Drive</button>
                             <button onClick={handleAddVideoLink} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg flex items-center gap-2 px-4 uppercase text-[10px] font-black tracking-widest hover:bg-brand-primary/20 transition-colors" title="Añadir Link de Video (YouTube/MP4)"><Icon name="video" className="w-4 h-4"/> Video URL</button>
                             
                             {isEditingCode && (
                                <>
                                    <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700"></div>
                                    <div className="flex items-center gap-2 min-w-[200px] sm:min-w-[300px]">
                                        <input 
                                            type="text" 
                                            value={regeneratePrompt}
                                            onChange={(e) => setRegeneratePrompt(e.target.value)}
                                            placeholder="Prompt para regenerar esta lámina..." 
                                            className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-1.5 text-[9px] font-bold outline-none flex-1 focus:ring-1 focus:ring-brand-primary"
                                        />
                                        <button 
                                            onClick={handleRegenerate}
                                            disabled={isRegenerating || !regeneratePrompt.trim()}
                                            className="bg-brand-primary text-white p-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                                        >
                                            {isRegenerating ? <Spinner className="w-3 h-3 text-white" /> : <Icon name="rocket" className="w-3 h-3"/>}
                                            <span>{isRegenerating ? '...' : 'Regenerar'}</span>
                                        </button>
                                    </div>
                                </>
                             )}
                        </div>
                    </div>
                )}
                 <div className="absolute bottom-2 sm:bottom-4 right-4 sm:right-6 opacity-40 flex items-center gap-2 pointer-events-none z-[100]"> 
                     <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" className="w-6 h-6 grayscale opacity-70" alt="Goatify Logo"/>
                 </div>
                 <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
            </div>
        );
    }

    return (
            <div ref={slideRef} className={`w-full h-full ${slide.backgroundColor || theme.bg} ${forcedTextColor} ${!slide.backgroundColor ? theme.gradient : ''} ${activeFont} ${slidePadding} flex flex-col relative overflow-hidden [container-type:size] shadow-2xl transition-all duration-700 animate-pres-zoom-up group`}>
                {isYoutubeModalOpen && !slide.customHtml && (
                    <Modal isOpen={isYoutubeModalOpen} onClose={() => setIsYoutubeModalOpen(false)} title="Añadir Video">
                        <div className="space-y-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Pega el link de YouTube o video MP4</p>
                            <Input 
                                autoFocus
                                value={youtubeUrl} 
                                onChange={e => setYoutubeUrl(e.target.value)} 
                                placeholder="https://www.youtube.com/watch?v=..." 
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirmYoutube()}
                            />
                            <div className="flex justify-end gap-2 pt-4">
                                <Button variant="ghost" onClick={() => setIsYoutubeModalOpen(false)}>Cancelar</Button>
                                <Button onClick={handleConfirmYoutube}>Añadir</Button>
                            </div>
                        </div>
                    </Modal>
                )}
                {isUploadingAsset && (
                    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-2xl">
                        <Spinner className="w-8 h-8 text-brand-primary" text="Subiendo foto..." />
                    </div>
                )}
                <DriveFilePicker isOpen={isDrivePickerOpen} onClose={() => setIsDrivePickerOpen(false)} onSelect={handleDriveSelect} allowedTypes={['image/', 'video/']} />
                
                <div className={`absolute top-[-10%] right-[-10%] w-[60%] h-[60%] ${theme.accentBg} opacity-5 rounded-full blur-[100px] ${!isExporting ? 'animate-pulse' : ''}`}></div>
                <div className={`absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] ${theme.accentBg} opacity-5 rounded-full blur-[80px] ${!isExporting ? 'animate-pulse delay-700' : ''}`}></div>
                {isEditable && (
                    <div className="absolute top-2 left-4 right-4 z-[500] flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-white/90 dark:bg-black/90 backdrop-blur-3xl px-6 py-3 rounded-[2rem] border border-neutral-200 dark:border-white/10 flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-x-auto no-scrollbar max-w-[95%]">
                            <div className="flex gap-1 items-center bg-neutral-200 dark:bg-neutral-800 p-1 rounded-xl flex-shrink-0">
                                <button onMouseDown={(e) => e.preventDefault()} onClick={handleUndo} className="p-1.5 text-neutral-500 hover:text-brand-primary" title="Deshacer"><Icon name="undo" className="w-3 h-3"/></button>
                                <button onMouseDown={(e) => e.preventDefault()} onClick={handleRedo} className="p-1.5 text-neutral-500 hover:text-brand-primary" title="Rehacer"><Icon name="redo" className="w-3 h-3"/></button>
                            </div>
                            <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                            <div className="flex gap-1 items-center bg-neutral-200 dark:bg-neutral-800 p-1 rounded-xl flex-shrink-0">
                            <button onClick={() => onEdit('textColor', 'white')} className={`w-6 h-6 rounded-lg bg-white border border-neutral-300 transition-all ${slide.textColor === 'white' ? 'ring-2 ring-brand-primary' : 'opacity-40'}`} title="Letra Blanca" />
                            <button onClick={() => onEdit('textColor', 'black')} className={`w-6 h-6 rounded-lg bg-black border border-neutral-700 transition-all ${slide.textColor === 'black' ? 'ring-2 ring-brand-primary' : 'opacity-40'}`} title="Letra Negra" />
                        </div>
                        <div className={`flex gap-1.5 flex-shrink-0 p-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-2xl`}>{GRADIENTS.map(g => ( <button key={g} onClick={() => onEdit('backgroundColor', g)} className={`w-5 h-5 rounded-full border-2 ${g} ${slide.backgroundColor === g ? 'border-brand-primary ring-2 ring-brand-primary/20 scale-110' : 'border-white/20 hover:scale-110 transition-transform'}`}/> ))}</div>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => onEdit('textAlign', 'left')} className={`p-1.5 rounded-lg ${slide.textAlign === 'left' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:bg-neutral-100'}`}><Icon name="alignLeft" className="w-4 h-4"/></button>
                            <button onClick={() => onEdit('textAlign', 'center')} className={`p-1.5 rounded-lg ${slide.textAlign === 'center' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:bg-neutral-100'}`}><Icon name="alignCenter" className="w-4 h-4"/></button>
                            <button onClick={() => onEdit('textAlign', 'right')} className={`p-1.5 rounded-lg ${slide.textAlign === 'right' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:bg-neutral-100'}`}><Icon name="alignRight" className="w-4 h-4"/></button>
                        </div>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => onEdit('fontWeight', slide.fontWeight === 'bold' ? 'normal' : 'bold')} className={`p-1.5 px-3 rounded-lg font-black ${slide.fontWeight === 'bold' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:bg-neutral-100'}`}>B</button>
                            <button onClick={() => onEdit('fontStyle', slide.fontStyle === 'italic' ? 'normal' : 'italic')} className={`p-1.5 px-3 rounded-lg italic font-black ${slide.fontStyle === 'italic' ? 'bg-brand-primary text-white shadow' : 'text-neutral-500 hover:bg-neutral-100'}`}>I</button>
                        </div>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => onEdit('fontSizeLevel', Math.max(-10, (slide.fontSizeLevel || 0) - 1))} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-black text-xs">A-</button>
                            <button onClick={() => onEdit('fontSizeLevel', Math.min(10, (slide.fontSizeLevel || 0) + 1))} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-black text-xs">A+</button>
                        </div>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <select value={slide.fontFamily || ''} onChange={(e) => onEdit('fontFamily', e.target.value)} className="bg-transparent text-black dark:text-white text-[9px] font-black uppercase border-none cursor-pointer max-w-[100px] flex-shrink-0 focus:ring-0">
                            <option value="" className="text-black">Fuente Estándar</option>
                            {FONTS.map(f => <option key={f.id} value={f.id} className="text-black">{f.name}</option>)}
                        </select>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <div className="flex gap-1 flex-shrink-0 items-center">
                             <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg" title="Subir Foto/Video Local"><Icon name="upload" className="w-4 h-4"/></button>
                             <button onClick={() => setIsDrivePickerOpen(true)} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg" title="Desde Goatify Drive"><Icon name="folder" className="w-4 h-4"/></button>
                             <button onClick={handleAddVideoLink} className="p-1.5 bg-brand-primary/10 text-brand-primary rounded-lg" title="Añadir Link de Video (YouTube/MP4)"><Icon name="video" className="w-4 h-4"/></button>
                             <span className="text-[9px] font-bold text-neutral-400 uppercase ml-2 tracking-wider hidden sm:block">Máx. 2 imágenes</span>
                        </div>
                        <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 flex-shrink-0"></div>
                        <div className="flex items-center gap-2 min-w-[200px] sm:min-w-[300px]">
                            <input 
                                type="text" 
                                value={regeneratePrompt}
                                onChange={(e) => setRegeneratePrompt(e.target.value)}
                                placeholder="Prompt para regenerar..." 
                                className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-1.5 text-[9px] font-bold outline-none flex-1 focus:ring-1 focus:ring-brand-primary"
                            />
                            <button 
                                onClick={handleRegenerate}
                                disabled={isRegenerating || !regeneratePrompt.trim()}
                                className="bg-brand-primary text-white p-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                            >
                                {isRegenerating ? <Spinner className="w-3 h-3 text-white" /> : <Icon name="rocket" className="w-4 h-4"/>}
                                <span className="hidden sm:inline">{isRegenerating ? '...' : 'Regenerar'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <motion.div drag={isEditable} dragListener={false} dragControls={titleDrag} dragMomentum={false} className={`relative flex flex-col mb-4 sm:mb-8 border-b-2 border-current/10 pb-4 sm:pb-6 z-10 ${!isExporting ? theme.titleAnim : ''}`}>
                {isEditable && <div onPointerDown={(e) => titleDrag.start(e)} className="absolute -top-6 right-0 text-white/50 hover:text-brand-primary cursor-move opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-black/10"><Icon name="move" className="w-4 h-4"/></div>}
                <div className={`flex items-center gap-3 sm:gap-6 mb-2 ${slide.textAlign === 'center' ? 'justify-center' : slide.textAlign === 'right' ? 'justify-end' : 'justify-start'}`}>
                    {(slide.icon !== 'none' || isEditable) && (
                        <div 
                            onClick={() => {
                                if (!isEditable) return;
                                const icons = ['star', 'rocket', 'zap', 'target', 'trendingUp', 'shield', 'none'];
                                const current = icons.indexOf(slide.icon as any || 'star');
                                const next = icons[(current + 1) % icons.length];
                                onEdit('icon', next);
                            }}
                            className={`${slide.icon === 'none' ? 'p-1 opacity-20 hover:opacity-100' : 'p-[1.5cqw] shadow-xl'} rounded-xl sm:rounded-2xl ${theme.accentBg} text-white transform ${!isExporting ? 'hover:rotate-6 transition-transform duration-500 cursor-pointer' : ''}`}
                        > 
                            <Icon name={slide.icon === 'none' ? 'plus' : (slide.icon as any || 'star')} style={{ width: slide.icon === 'none' ? '2cqw' : '4cqw', height: slide.icon === 'none' ? '2cqw' : '4cqw' }} /> 
                        </div>
                    )}
                    <h1 
                        contentEditable={isEditable} 
                        suppressContentEditableWarning 
                        onPointerDown={(e) => !isEditable && e.preventDefault()}
                        onBlur={(e) => isEditable && onEdit('title', e.currentTarget.innerText)} 
                        style={titleStyle} 
                        className={`font-black leading-tight outline-none w-full tracking-tight text-inherit drop-shadow-sm empty:before:content-['Título...'] empty:before:opacity-50 break-words ${!isEditable ? 'cursor-default select-none pointer-events-none' : ''}`}
                    > 
                        {slide.title} 
                    </h1>
                </div>
                {slide.subtitle && ( 
                    <h2 
                        contentEditable={isEditable} 
                        suppressContentEditableWarning 
                        onBlur={(e) => isEditable && onEdit('subtitle', e.currentTarget.innerText)} 
                        style={{ ...textStyle, fontSize: '1.8cqw', opacity: 0.7 }} 
                        className={`font-medium tracking-wide pl-2 outline-none ${!isEditable ? 'cursor-default select-none' : ''}`}
                    > 
                        {slide.subtitle} 
                    </h2> 
                )}
            </motion.div>
            <div className={`flex-1 flex flex-col ${(!isMasterpiece && finalAssets.length > 0) ? 'lg:flex-row' : ''} z-10 gap-4 sm:gap-8 lg:gap-16 min-h-0 overflow-y-auto custom-scrollbar ${slide.textAlign === 'center' ? 'items-center' : ''} ${slide.layout === 'split-right' ? 'lg:flex-row-reverse' : ''}`}>
                <motion.div drag={isEditable} dragListener={false} dragControls={contentDrag} dragMomentum={false} className={`relative ${slide.layout === 'big-number' ? 'w-full' : (!isMasterpiece && finalAssets.length > 0) ? 'w-full lg:w-1/2' : 'w-full'} flex flex-col justify-center min-h-0`}>
                    {isEditable && <div onPointerDown={(e) => contentDrag.start(e)} className="absolute -top-4 right-0 text-white/50 hover:text-brand-primary cursor-move opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-black/10 z-[60]"><Icon name="move" className="w-4 h-4"/></div>}
                    {slide.layout === 'big-number' ? (
                        <div className={`text-center ${!isExporting ? theme.contentAnim : ''} my-auto`}>
                            <span 
                                contentEditable={isEditable} 
                                suppressContentEditableWarning 
                                onBlur={(e) => onEdit('big-number-val', e.currentTarget.innerText)} 
                                style={{ fontSize: slide.fontSizeLevel ? `calc(${(14 + (slide.fontSizeLevel * 1.2))}cqw)` : '14cqw' }}
                                className={`font-black ${theme.accent} leading-none drop-shadow-2xl tracking-tighter outline-none cursor-text block`}
                            >
                                {slide.bullets.length > 0 ? slide.bullets[0].split('|')[0] || (index + 1).toString() : (index + 1).toString()}
                            </span>
                            <p contentEditable={isEditable} suppressContentEditableWarning onBlur={(e) => onEdit('big-number-desc', e.currentTarget.innerText)} style={{ fontSize: slide.fontSizeLevel ? `calc(${(3.5 + (slide.fontSizeLevel * 0.4))}cqw)` : '3.5cqw' }} className="opacity-80 font-light tracking-wide mt-[-0.5rem] sm:mt-[-1rem] outline-none">{slide.bullets.length > 0 ? slide.bullets[0].split('|')[1] || 'Logro Principal' : 'Logro Principal'}</p>
                        </div>
                    ) : (
                        <ul className={`space-y-4 sm:space-y-6 md:space-y-8 overflow-y-auto pr-2 custom-scrollbar ${slide.textAlign === 'center' ? 'flex flex-col items-center w-full' : ''}`}>
                            {visibleBullets.map((bullet, i) => (
                                <li key={i} style={{ ...textStyle }} className={`flex items-start gap-[2cqw] animate-pres-slide-right ${slide.textAlign === 'center' ? 'flex-col items-center text-center' : ''}`}>
                                    {slide.textAlign !== 'center' && <span className={`mt-[1cqw] w-[1cqw] h-[1cqw] rounded-full ${theme.accentBg} flex-shrink-0 shadow-lg ring-2 ring-white/20`}></span>}
                                    <span 
                                        contentEditable={isEditable} 
                                        suppressContentEditableWarning 
                                        onPointerDown={(e) => !isEditable && e.preventDefault()}
                                        onBlur={(e) => isEditable && onEdit(`bullet-${i}`, e.currentTarget.innerText)} 
                                        className={`outline-none focus:bg-black/5 dark:focus:bg-white/10 rounded px-2 transition-colors opacity-90 leading-snug flex-1 w-full ${!isEditable ? 'cursor-default select-none pointer-events-none' : ''}`}
                                    > 
                                        {bullet} 
                                    </span>
                                </li>
                            ))}
                            {isEditable && ( <button onClick={() => onEdit('add-bullet', '')} className="text-xs font-bold opacity-30 hover:opacity-100 flex items-center gap-2 mt-4 ml-8"><Icon name="plus" className="w-3 h-3"/> Añadir punto</button> )}
                        </ul>
                    )}
                </motion.div>
                {(!isMasterpiece && finalAssets.length > 0) && (
                    <div className="w-full lg:w-1/2 min-h-[30vh] lg:min-h-0 relative flex items-center justify-center z-20">
                        <AssetRenderer 
                            asset={finalAssets[0]} 
                            isExporting={isExporting} 
                            isPresentationMode={isPresentationMode} 
                            transparentWrapper={false}
                            onUpdate={(field, val) => handleUpdateAsset(finalAssets[0].id, field, val)}
                            onDelete={() => handleDeleteAsset(finalAssets[0].id)}
                            slideIndex={index}
                            slideTitle={slide.title}
                            containerRef={slideRef}
                        />
                    </div>
                )}
            </div>
            {(isMasterpiece || finalAssets.length > 1) && finalAssets.length > 0 && (
                <div className="absolute inset-0 pointer-events-none z-[1000]">
                    {finalAssets.map((asset, i) => {
                        // In standard mode, the first asset is already in the flex layout
                        if (!isMasterpiece && i === 0) return null;
                        return (
                            <div key={asset.id} className="absolute pointer-events-auto" style={{
                                width: `${(asset.scale || 1) * 20}%`,
                                height: 'auto',
                                aspectRatio: '1/1',
                                top: asset.top || (isMasterpiece ? '10%' : '15%'),
                                right: asset.right || (isMasterpiece ? '10%' : '15%')
                            }}>
                                <AssetRenderer 
                                    asset={asset} 
                                    isExporting={isExporting} 
                                    isPresentationMode={isPresentationMode} 
                                    transparentWrapper={true}
                                    onUpdate={(field, val) => handleUpdateAsset(asset.id, field, val)}
                                    onDelete={() => handleDeleteAsset(asset.id)}
                                    slideIndex={index}
                                    slideTitle={slide.title}
                                    containerRef={slideRef}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="absolute bottom-2 sm:bottom-4 right-4 sm:right-6 opacity-40 flex items-center gap-2 pointer-events-none z-[100]"> 
                <img src="https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747" className="w-5 h-5 grayscale opacity-70" alt="Goatify Logo"/>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="image/*,video/*" />
        </div>
    );
};

const PresentationCoverCard: React.FC<{ pres: Presentation, onClick: () => void, onDelete: (id: string) => void, onShare: (pres: Presentation) => void, theme: any }> = ({ pres, onClick, onDelete, onShare, theme }) => {
    // NUEVO: Identificador de origen si viene de un proyecto
    const originLabel = (pres as any).fromProjectName ? `Proyecto: ${(pres as any).fromProjectName}` : (pres as any).sharedBy ? `De: ${(pres as any).sharedBy.name}` : null;

    return (
        <div onClick={onClick} className="group relative aspect-video rounded-3xl overflow-hidden cursor-pointer shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className={`absolute inset-0 ${theme.bg} ${theme.gradient} p-8 flex flex-col justify-between text-center select-none overflow-hidden`}>
                <div className="flex justify-center pt-2">
                    <div className={`p-4 rounded-2xl ${theme.accentBg} text-white shadow-xl transform group-hover:rotate-6 transition-transform duration-500`}>
                        <Icon name={pres.externalUrl ? "rocket" : "monitor"} className="w-8 h-8"/>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center px-4 mt-4">
                    <h3 className={`text-base sm:text-xl font-black ${theme.text} leading-tight uppercase tracking-tighter drop-shadow-sm`}>
                        {pres.title}
                    </h3>
                </div>
                {originLabel && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-full px-4">
                        <span className="bg-brand-primary/20 backdrop-blur-md text-brand-primary text-[7px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-brand-primary/10">
                            {originLabel}
                        </span>
                    </div>
                )}
                <div className="flex justify-center pb-2 mt-4">
                    <div className={`w-16 h-1.5 ${theme.accentBg} rounded-full opacity-40 group-hover:w-24 transition-all duration-700`}></div>
                </div>
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors duration-500"></div>
            
            <div className="absolute top-4 right-4 z-50 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div onClick={(e) => { e.stopPropagation(); onShare(pres); }} className="p-2.5 bg-white/90 dark:bg-black/80 backdrop-blur-sm text-brand-primary rounded-2xl hover:bg-brand-primary hover:text-white shadow-2xl transition-all hover:scale-110 flex items-center justify-center cursor-pointer ring-1 ring-black/5">
                    <Icon name="share" className="w-5 h-5" />
                </div>
                <div onClick={(e) => { e.stopPropagation(); onDelete(pres.id); }} className="p-2.5 bg-white/90 dark:bg-black/80 backdrop-blur-sm text-red-500 rounded-2xl hover:bg-red-500 hover:text-white shadow-2xl transition-all hover:scale-110 flex items-center justify-center cursor-pointer ring-1 ring-black/5">
                    <Icon name="trash" className="w-5 h-5" />
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-black/90 backdrop-blur-xl p-3 flex justify-between items-center border-t border-black/5 dark:border-white/10 pointer-events-none transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{new Date(pres.createdAt).toLocaleDateString()}</span>
                <span className={`text-[9px] px-3 py-1 rounded-full ${theme.accentBg} text-white font-black shadow-lg uppercase tracking-widest`}>
                    {pres.code ? 'Diseño Élite' : pres.externalUrl ? 'Link Externo' : `${pres.slides.length} Diapositivas`}
                </span>
            </div>
        </div>
    );
};

const DrawingOverlay: React.FC<{ 
    isActive: boolean, 
    tool: 'laser' | 'pen' | 'none',
    clearToken: number,
    initialDrawing?: string,
    onSave: (data: string) => void
}> = ({ isActive, tool, clearToken, initialDrawing, onSave }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const laserRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [clearToken]);

    useEffect(() => {
        if (isActive && canvasRef.current && initialDrawing) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                const img = new Image();
                img.onload = () => {
                    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = initialDrawing;
            }
        } else if (isActive && canvasRef.current && !initialDrawing) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }, [isActive, initialDrawing]);

    useEffect(() => {
        if (!isActive) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleResize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 4;
                    ctxRef.current = ctx;
                    
                    if (initialDrawing) {
                        const img = new Image();
                        img.onload = () => ctx.drawImage(img, 0, 0);
                        img.src = initialDrawing;
                    }
                }
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [isActive, initialDrawing]);

    useEffect(() => {
        if (!isActive) return;

        const moveLaser = (x: number, y: number) => {
            if (laserRef.current) {
                laserRef.current.style.left = `${x}px`;
                laserRef.current.style.top = `${y}px`;
            }
        };

        const handleMove = (e: any) => {
            if (!isActive) return;
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            if (clientX === undefined || clientY === undefined) return;

            moveLaser(clientX, clientY);
            
            if (isDrawing && tool === 'pen' && ctxRef.current) {
                ctxRef.current.lineTo(clientX, clientY);
                ctxRef.current.stroke();
            }
        };

        const handleStart = (e: any) => {
            if (!isActive) return;
            if (e.cancelable) e.preventDefault();
            
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const clientY = e.clientY || (e.touches && e.touches[0].clientY);
            
            if (clientX === undefined || clientY === undefined) return;

            if (tool === 'pen' && ctxRef.current) {
                setIsDrawing(true);
                ctxRef.current.beginPath();
                ctxRef.current.moveTo(clientX, clientY);
            }
        };

        const handleEnd = () => {
            if (isDrawing && canvasRef.current) {
                setIsDrawing(false);
                onSave(canvasRef.current.toDataURL());
            }
        };

        const el = overlayRef.current;
        if (el) {
            el.addEventListener('mousemove', handleMove);
            el.addEventListener('mousedown', handleStart);
            el.addEventListener('mouseup', handleEnd);
            el.addEventListener('mouseleave', handleEnd);
            
            el.addEventListener('touchstart', handleStart, { passive: false });
            el.addEventListener('touchmove', handleMove, { passive: false });
            el.addEventListener('touchend', handleEnd);
        }

        return () => {
            if (el) {
                el.removeEventListener('mousemove', handleMove);
                el.removeEventListener('mousedown', handleStart);
                el.removeEventListener('mouseup', handleEnd);
                el.removeEventListener('mouseleave', handleEnd);
                el.removeEventListener('touchstart', handleStart);
                el.removeEventListener('touchmove', handleMove);
                el.removeEventListener('touchend', handleEnd);
            }
        };
    }, [isActive, tool, isDrawing, onSave]);

    if (!isActive) return null;

    return (
        <div ref={overlayRef} className={`fixed inset-0 z-[250002] cursor-none select-none touch-none pointer-events-auto bg-transparent ${tool === 'pen' ? 'drawing-cursor' : ''}`}>
            <style>{`
                .drawing-cursor {
                    cursor: crosshair !important;
                }
            `}</style>
            
            <div 
                ref={laserRef} 
                className={`fixed w-8 h-8 bg-red-500 rounded-full blur-[2px] shadow-[0_0_20px_#ef4444] z-[250005] pointer-events-none transition-opacity duration-300 ${tool === 'laser' ? 'opacity-100' : 'opacity-0'}`}
                style={{ transform: 'translate(-50%, -50%)' }}
            />

            <div 
                className={`fixed z-[250006] pointer-events-none transition-opacity duration-300 ${tool === 'pen' ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                    left: laserRef.current?.style.left, 
                    top: laserRef.current?.style.top,
                    transform: 'translate(-50%, -50%)' 
                }}
            >
                <div className="w-6 h-px bg-red-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                <div className="h-6 w-px bg-red-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
            </div>

            <canvas 
                ref={canvasRef} 
                className={`fixed inset-0 z-[250004] pointer-events-none`}
            />
        </div>
    );
};

const PresentationToolbar: React.FC<{
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    onClear: () => void;
    tool: 'laser' | 'pen' | 'none';
    setTool: (t: 'laser' | 'pen' | 'none') => void;
}> = ({ onPrev, onNext, onClose, onClear, tool, setTool }) => {
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[250100] flex items-center gap-1.5 bg-black/90 backdrop-blur-xl px-4 py-2.5 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 transition-all hover:scale-105 scale-90 sm:scale-100 group">
            <button 
                onClick={() => setTool(tool === 'laser' ? 'none' : 'laser')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${tool === 'laser' ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-white/5 text-neutral-400 hover:bg-white/10'}`}
            >
                <Icon name="radio" className="w-4 h-4" /> LÁSER
            </button>
            <button 
                onClick={() => setTool(tool === 'pen' ? 'none' : 'pen')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${tool === 'pen' ? 'bg-brand-primary text-white shadow-[0_0_20px_rgba(76,29,149,0.5)]' : 'bg-white/5 text-neutral-400 hover:bg-white/10'}`}
            >
                <Icon name="pencil" className="w-4 h-4" /> DIBUJAR
            </button>
            <button 
                onClick={onClear}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all bg-white/5 text-neutral-400 hover:bg-red-500/20 hover:text-red-500"
            >
                <Icon name="trash" className="w-4 h-4" /> BORRAR
            </button>
            <div className="w-px h-6 bg-white/10 mx-2"></div>
            <button onClick={onPrev} className="p-2 rounded-full bg-white/5 text-white hover:bg-white/10 transition-all"><Icon name="chevronLeft" className="w-5 h-5"/></button>
            <button onClick={onNext} className="p-2 rounded-full bg-white/5 text-white hover:bg-white/10 transition-all"><Icon name="chevronLeft" className="w-5 h-5 rotate-180"/></button>
            <div className="w-px h-6 bg-white/10 mx-2"></div>
            <button onClick={onClose} className="p-2 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all"><Icon name="close" className="w-5 h-5"/></button>
        </div>
    );
};

const PresentationBuilder: React.FC = () => {
    const { currentUser, setToastNotification, projects, sendDataUrlToProject, checkPresentationLimit, userProfile, userUsage, updateProject, allUsers, setIsFullScreenActive } = useContext(AppContext);
    const [view, setView] = useState<'home' | 'editor' | 'presenting'>('home');
    const [topic, setTopic] = useState('');
    const [referenceUrl, setReferenceUrl] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationMode, setGenerationMode] = useState<'standard' | 'code'>('standard');
    const [numSlides, setNumSlides] = useState<number>(8);
    const [contextFiles, setContextFiles] = useState<{ name: string, data: string, mimeType: string }[]>([]);
    const [isContextDrivePickerOpen, setIsContextDrivePickerOpen] = useState(false);
    const contextFileInputRef = useRef<HTMLInputElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [activePresentation, setActivePresentation] = useState<Presentation | null>(null);
    const [savedPresentations, setSavedPresentations] = useState<Presentation[]>([]);
    const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
    const [currentStep, setCurrentStep] = useState(0); 
    const [undoStack, setUndoStack] = useState<string[]>([]);
    const [redoStack, setRedoStack] = useState<string[]>([]);
    const [isEditorFullScreen, setIsEditorFullScreen] = useState(false);
    const [shareMode, setShareMode] = useState<'editor' | 'viewer'>('viewer');

    // Guardar estado actual en el historial antes de modificar
    const addToHistory = (pres: Presentation) => {
        const presStr = JSON.stringify(pres);
        if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== presStr) {
            setUndoStack(prev => [...prev.slice(-49), presStr]); // Límite de 50 niveles
            setRedoStack([]);
        }
    };

    const handleUndo = () => {
        if (undoStack.length <= 1) return;
        const current = undoStack[undoStack.length - 1];
        const previous = undoStack[undoStack.length - 2];
        
        setRedoStack(prev => [...prev, current]);
        setUndoStack(prev => prev.slice(0, -1));
        setActivePresentation(JSON.parse(previous));
    };

    const handleRedo = () => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        
        setUndoStack(prev => [...prev, next]);
        setRedoStack(prev => prev.slice(0, -1));
        setActivePresentation(JSON.parse(next));
    };

    useEffect(() => {
        if (activePresentation) {
            setUndoStack([JSON.stringify(activePresentation)]);
            setRedoStack([]);
        }
    }, [activePresentation?.id]);

    useEffect(() => {
        setIsFullScreenActive(isEditorFullScreen);
        return () => setIsFullScreenActive(false);
    }, [isEditorFullScreen, setIsFullScreenActive]);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [importTitle, setImportTitle] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const exportContainerRef = useRef<HTMLDivElement>(null);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isShareToProjectModalOpen, setIsShareToProjectModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');
    const [isSavingToProject, setIsSavingToProject] = useState(false);
    
    const [isShareToUserModalOpen, setIsShareToUserModalOpen] = useState(false);
    const [presToShare, setPresToShare] = useState<Presentation | null>(null);
    const [shareSearch, setShareSearch] = useState('');
    const [isSharingProcess, setIsSharingProcess] = useState(false);

    const [slideDrawings, setSlideDrawings] = useState<Record<number, string>>({});

    const [activePresTool, setActivePresTool] = useState<'laser' | 'pen' | 'none'>('none');
    const [clearDrawingsToken, setClearDrawingsToken] = useState(0);

    const [isReadOnly, setIsReadOnly] = useState(false);

    // SOLUCIÓN v14.0: Cargar presentaciones personales Y escaneadas de proyectos
    useEffect(() => {
        if (!currentUser) return;
        
        const personalQuery = query(collection(db, `users/${currentUser.uid}/presentations`), orderBy('createdAt', 'desc'));
        
        const unsubscribe = onSnapshot(personalQuery, async (snapshot) => {
            const personalPresentations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Presentation));
            
            // ESCANEAR PROYECTOS PARA BUSCAR COMPARTIDAS
            const sharedFromProjects: Presentation[] = [];
            for (const proj of projects) {
                if (proj.documents) {
                    const presDocs = proj.documents.filter(d => d.fileType === 'interactive_presentation');
                    for (const pDoc of presDocs) {
                        if (!personalPresentations.find(p => p.id === pDoc.content)) {
                             sharedFromProjects.push({
                                     id: pDoc.content,
                                     title: pDoc.name.replace('PRESENTACIÓN: ', '').replace(' (EDICIÓN)', '').replace(' (LECTURA)', ''),
                                     userId: 'shared', 
                                     slides: [], 
                                     createdAt: pDoc.uploadedAt,
                                     theme: 'modern',
                                     fromProjectName: proj.name,
                                     isReadOnly: pDoc.size === 0 // 0 para lector, 1 para editor
                                 } as any);
                        }
                    }
                }
            }

            const combined = [...personalPresentations, ...sharedFromProjects];
            setSavedPresentations(combined);
            
            // Manejo de Hash de navegación
            const handleRoute = () => {
                const hash = window.location.hash;
                if (hash.includes('/present/')) {
                    const rawId = hash.split('/present/')[1]?.split('?')[0];
                    const decodedId = decodeURIComponent(rawId);
                    // Buscamos por ID exacto o por Título (para links "limpios")
                    const pres = [...personalPresentations, ...sharedFromProjects].find(p => p.id === rawId || p.title === decodedId);
                    if (pres) {
                         handleOpenPresentation(pres);
                         setView('presenting');
                         setTimeout(() => { if (containerRef.current?.requestFullscreen) { containerRef.current.requestFullscreen().catch(() => {}); } }, 500);
                    }
                }
            };
            handleRoute();
        });
        return () => unsubscribe();
    }, [currentUser, projects]);

    const handleOpenPresentation = async (pres: Presentation) => {
        // Bloqueo estricto v15.0: Si es compartida directamente o desde proyecto -> Sólo lectura
        const isSharedDirectly = !!(pres as any).sharedBy;
        const isFromProject = pres.userId === 'shared';
        const forceReadOnly = !!(pres as any).isReadOnly;

        if (isFromProject || (pres.slides.length === 0 && !pres.code)) {
            setToastNotification({ title: "Cargando Diseño", message: "Accediendo a la base de datos compartida...", icon: "ai", isLoading: true });
            try {
                let foundData: any = null;
                // Búsqueda en el círculo
                for (const memberId of userProfile.circle || []) {
                    const docRef = doc(db, `users/${memberId}/presentations`, pres.id);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        foundData = { id: snap.id, ...snap.data() };
                        break;
                    }
                }
                
                if (foundData) {
                    setActivePresentation(foundData);
                    setCurrentSlideIdx(0);
                    setCurrentStep(0);
                    setSlideDrawings({});
                    setIsReadOnly(forceReadOnly || isFromProject);
                    
                    if (forceReadOnly) {
                        setView('presenting');
                        setTimeout(() => {
                            if (containerRef.current?.requestFullscreen) {
                                containerRef.current.requestFullscreen().catch(() => {});
                            }
                        }, 500);
                    } else {
                        setView('editor');
                    }
                } else {
                    setToastNotification({ title: "Error de Acceso", message: "No se encontró el diseño original.", icon: "close" });
                }
            } catch (e) { console.error(e); }
        } else {
            setActivePresentation(pres);
            setIsReadOnly(isSharedDirectly || forceReadOnly);
            setCurrentSlideIdx(0);
            setCurrentStep(0);
            setSlideDrawings({});
            
            if (forceReadOnly) {
                setView('presenting');
                setTimeout(() => {
                    if (containerRef.current?.requestFullscreen) {
                        containerRef.current.requestFullscreen().catch(() => {});
                    }
                }, 500);
            } else {
                setView('editor');
            }
        }
    };

    const handleImportLink = async () => {
        if (!importUrl.trim() || !importTitle.trim() || !currentUser) return;
        const sanitizedUrl = sanitizeExternalUrl(importUrl);
        
        const virtualSlide: PresentationSlide = { 
            id: `vslide-${Date.now()}`, 
            title: importTitle.trim(), 
            bullets: ['Visualizando contenido externo'], 
            layout: 'content', 
            visualCue: '', 
            icon: 'rocket', 
            type: 'content' 
        };

        const newPresData: any = { 
            userId: currentUser.uid, 
            title: importTitle.trim(), 
            slides: [virtualSlide], 
            externalUrl: sanitizedUrl, 
            createdAt: new Date().toISOString(), 
            theme: 'modern' 
        };

        try {
            const docRef = await addDoc(collection(db, `users/${currentUser.uid}/presentations`), newPresData);
            const newPres: Presentation = { id: docRef.id, ...newPresData };
            setActivePresentation(newPres);
            setToastNotification({ title: "Presentación Importada", message: "Link externo vinculado correctamente.", icon: "rocket" });
            setIsImportModalOpen(false);
            setImportUrl('');
            setImportTitle('');
            setIsReadOnly(false);
            setView('editor');
        } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo importar el link.", icon: "close" }); }
    };

    const handleContextFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        files.forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                const data = result.split(',')[1];
                setContextFiles(prev => [...prev, { name: file.name, data, mimeType: file.type }]);
            };
            reader.readAsDataURL(file);
        });
        if (contextFileInputRef.current) contextFileInputRef.current.value = '';
    };

    const handleContextDriveSelect = (fileData: { name: string, url: string, type: string, base64Data: string }) => {
        if (fileData.base64Data) {
            setContextFiles(prev => [...prev, { name: fileData.name, data: fileData.base64Data, mimeType: fileData.type || 'application/octet-stream' }]);
        }
    };

    const removeContextFile = (index: number) => {
        setContextFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleGenerate = async () => {
        if (!topic.trim() || !currentUser) return;
        
        const presBlocked = await checkPresentationLimit();
        if (presBlocked) return;

        setIsGenerating(true);
        try {
            // Preparar URL de referencia
            let finalRefUrl = referenceUrl.trim();
            if (finalRefUrl && !finalRefUrl.startsWith('http')) {
                finalRefUrl = 'https://' + finalRefUrl;
            }

            if (generationMode === 'code') {
                const masterpiece: any = await generatePresentationCode(
                    topic, 
                    userProfile.plan, 
                    contextFiles.map(f => ({ data: f.data, mimeType: f.mimeType })), 
                    numSlides,
                    finalRefUrl
                );
                if (masterpiece && masterpiece.slides) {
                    const slidesWithIds = masterpiece.slides.map((s: any, idx: number) => ({
                        ...s,
                        id: `slide-master-${Date.now()}-${idx}`,
                        bullets: s.bullets || [],
                        type: 'content',
                        layout: 'content'
                    }));
                    await consumeServerFeature('presentation', 1, {
                        module: 'presentation_builder',
                        action: 'generate_presentation',
                        mode: generationMode,
                        slides: slidesWithIds.length,
                        topic
                    });
                    const newPresData: any = { 
                        userId: currentUser.uid, 
                        title: masterpiece.title || topic, 
                        slides: slidesWithIds, 
                        createdAt: new Date().toISOString(), 
                        theme: 'masterpiece' 
                    };
                    const docRef = await addDoc(collection(db, `users/${currentUser.uid}/presentations`), newPresData);
                    setActivePresentation({ id: docRef.id, ...newPresData });
                    setCurrentSlideIdx(0); setCurrentStep(0); setIsReadOnly(false); setView('editor'); setTopic('');
                    setReferenceUrl('');
                    setContextFiles([]);
                } else { throw new Error("Falló la generación de obra maestra."); }
            } else {
                const result: any = await generatePresentationContent(topic, { 
                    tone: 'Profesional', 
                    language: 'es', 
                    numSlides,
                    referenceUrl: finalRefUrl
                });
                if (result && result.slides && Array.isArray(result.slides) && result.slides.length > 0) {
                    const slidesWithIds = result.slides.map((s: any, idx: number) => {
                        const cue = s.visualCue || `${topic} corporate business`;
                        return {
                            ...s, 
                            id: `slide-${Date.now()}-${idx}`, 
                            bullets: s.bullets || [], 
                            externalLinks: s.externalLinks || [], 
                            layout: s.layout || 'split-left', 
                            visualCue: cue, 
                            type: s.type || 'content',
                            visualAssets: [] 
                        };
                    });
                    await consumeServerFeature('presentation', 1, {
                        module: 'presentation_builder',
                        action: 'generate_presentation',
                        mode: generationMode,
                        slides: slidesWithIds.length,
                        topic
                    });
                    const newPresData: any = { userId: currentUser.uid, title: result.title || topic, slides: slidesWithIds, createdAt: new Date().toISOString(), theme: 'modern' };
                    const docRef = await addDoc(collection(db, `users/${currentUser.uid}/presentations`), newPresData);
                    setActivePresentation({ id: docRef.id, ...newPresData });
                    setCurrentSlideIdx(0); setCurrentStep(0); setIsReadOnly(false); setView('editor'); setTopic('');
                    setReferenceUrl('');
                } else { throw new Error("Falló la generación de contenido."); }
            }
        } catch (error: any) { 
            console.error(error); 
            setToastNotification({ 
                title: "Error de Generación", 
                message: error.message || "No se pudo generar la presentación. Revisa tus archivos e intenta de nuevo.", 
                icon: "close" 
            }); 
        }
        finally { setIsGenerating(false); }
    };

    const handleDeletePresentation = async (id: string) => {
        if (!currentUser) return;
        if (!window.confirm('¿Seguro que deseas eliminar esta presentación permanentemente?')) return;
        setSavedPresentations(prev => prev.filter(p => p.id !== id));
        if (activePresentation?.id === id) { setActivePresentation(null); setView('home'); }
        try { await deleteDoc(doc(db, `users/${currentUser.uid}/presentations`, id)); setToastNotification({ title: "Eliminado", message: "Presentación eliminada.", icon: "trash" }); } catch (e) { console.error("Error deleting", e); }
    };

    const handleSharePresentationToUser = async (targetUser: UserProfile) => {
        if (!presToShare || !currentUser) return;
        setIsSharingProcess(true);
        try {
            const clonedPres = {
                ...JSON.parse(JSON.stringify(presToShare)),
                userId: targetUser.uid,
                createdAt: new Date().toISOString(),
                sharedBy: { uid: currentUser.uid, name: userProfile.name }
            };
            delete clonedPres.id; // Delete explicitly to avoid "undefined" in Firestore
            
            await addDoc(collection(db, `users/${targetUser.uid}/presentations`), clonedPres);
            
            await addDoc(collection(db, `users/${targetUser.uid}/notifications`), {
                type: 'general',
                text: `🎨 **Presentación Recibida**: ${userProfile.name} ha compartido contigo el diseño: **"${presToShare.title}"**. Ya está en tu biblioteca de AI Studio.`,
                timestamp: new Date().toISOString(),
                read: false,
                link: '/#aiStudio/presentations',
                fromUser: { uid: currentUser.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
            });

            setToastNotification({ title: "Compartido con Éxito", message: `La presentación se ha cargado en la cuenta de ${targetUser.name}.`, icon: "check" });
            setIsShareToUserModalOpen(false);
            setPresToShare(null);
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error al compartir", message: "Hubo un problema de permisos de red.", icon: "close" });
        } finally {
            setIsSharingProcess(false);
        }
    };

    const handleRegenerateSlide = async (prompt: string) => {
        if (!activePresentation || currentSlideIdx === -1 || isReadOnly) return false;
        
        try {
            const slideToRegenerate = activePresentation.slides[currentSlideIdx];
            const theme = THEMES[activePresentation.theme as keyof typeof THEMES];
            if (!theme) return false;

            const updatedContent = await regenerateSlideContent(slideToRegenerate, prompt, theme);
            
            addToHistory(activePresentation);
            const updatedPres = JSON.parse(JSON.stringify(activePresentation)) as Presentation;
            updatedPres.slides[currentSlideIdx] = {
                ...slideToRegenerate,
                title: updatedContent.title || slideToRegenerate.title,
                bullets: updatedContent.bullets || slideToRegenerate.bullets,
                customHtml: updatedContent.htmlContent || slideToRegenerate.customHtml,
            };
            
            setActivePresentation(updatedPres);
            if (currentUser && updatedPres.id) {
                await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides: updatedPres.slides });
            }
            return true;
        } catch (error) {
            console.error("Error regenerating slide:", error);
            return false;
        }
    };

    const handleUpdateSlide = async (field: string, value: any) => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const updatedPres = JSON.parse(JSON.stringify(activePresentation)) as Presentation;
        const slide = updatedPres.slides[currentSlideIdx];
        if(!slide) return;

        if (field === 'title') slide.title = value;
        else if (field === 'subtitle') slide.subtitle = value;
        else if (field === 'visualCue') slide.visualCue = value;
        else if (field === 'visualAssets') slide.visualAssets = value;
        else if (field === 'customHtml') slide.customHtml = value;
        else if (field === 'type') slide.type = value as any;
        else if (field === 'layout') slide.layout = value as any;
        else if (field === 'backgroundColor') slide.backgroundColor = value;
        else if (field === 'textColor') slide.textColor = value as any;
        else if (field === 'fontFamily') slide.fontFamily = value;
        else if (field === 'textAlign') slide.textAlign = value as any;
        else if (field === 'fontWeight') slide.fontWeight = value as any;
        else if (field === 'fontStyle') slide.fontStyle = value as any;
        else if (field === 'fontSizeLevel') slide.fontSizeLevel = value as number;
        else if (field === 'add-bullet') slide.bullets.push("Nuevo punto estratégico...");
        else if (field === 'big-number-val') {
            const current = slide.bullets[0] || "|Logro";
            const parts = current.split('|');
            slide.bullets[0] = `${value}|${parts[1] || 'Logro'}`;
        }
        else if (field === 'big-number-desc') {
            const current = slide.bullets[0] || "1|";
            const parts = current.split('|');
            slide.bullets[0] = `${parts[0] || '1'}|${value}`;
        }
        else if (field.startsWith('bullet-')) {
            const idx = parseInt(field.split('-')[1]);
            if (slide.bullets[idx] !== undefined) slide.bullets[idx] = value;
        }
        setActivePresentation(updatedPres);
        if (currentUser && updatedPres.id) { try { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides: updatedPres.slides }); } catch(e) { console.error("Autosave failed", e); } }
    };

    const handleAddSlide = async () => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const newSlide: PresentationSlide = { id: `slide-${Date.now()}`, title: 'Título de la Diapositiva', subtitle: 'Subtítulo informativo', bullets: ['Punto clave 1', 'Punto clave 2'], layout: 'content', visualCue: 'business development', visualAssets: [], icon: 'star', type: 'content' };
        const updatedSlides = [...activePresentation.slides, newSlide];
        const updatedPres = { ...activePresentation, slides: updatedSlides };
        setActivePresentation(updatedPres);
        setCurrentSlideIdx(updatedSlides.length - 1);
        setCurrentStep(0);
        if (currentUser && updatedPres.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides: updatedSlides }); }
    };

    const handleDeleteSlide = async (idx: number) => {
        if (!activePresentation || activePresentation.slides.length <= 1 || isReadOnly) return;
        if (!window.confirm("¿Eliminar diapositiva?")) return;
        addToHistory(activePresentation);
        const updatedSlides = activePresentation.slides.filter((_, i) => i !== idx);
        const updatedPres = { ...activePresentation, slides: updatedSlides };
        setActivePresentation(updatedPres);
        setCurrentSlideIdx(Math.max(0, currentSlideIdx - 1));
        setCurrentStep(0);
        if (currentUser && updatedPres.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides: updatedSlides }); }
    };

    const handleDuplicateSlide = async (idx: number) => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const original = activePresentation.slides[idx];
        const copy = { ...JSON.parse(JSON.stringify(original)), id: `slide-copy-${Date.now()}` };
        const slides = [...activePresentation.slides];
        slides.splice(idx + 1, 0, copy);
        const updatedPres = { ...activePresentation, slides };
        setActivePresentation(updatedPres);
        setCurrentSlideIdx(idx + 1);
        setCurrentStep(0);
        if (currentUser && updatedPres.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides }); }
        setToastNotification({ title: "Diapositiva Duplicada", message: "Se ha insertado una copia exacta.", icon: "copy" });
    };

    const handleMoveSlide = async (idx: number, direction: 'up' | 'down') => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const slides = [...activePresentation.slides];
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= slides.length) return;
        const temp = slides[idx];
        slides[idx] = slides[targetIdx];
        slides[targetIdx] = temp;
        const updatedPres = { ...activePresentation, slides };
        setActivePresentation(updatedPres);
        setCurrentSlideIdx(targetIdx);
        setCurrentStep(0);
        if (currentUser && updatedPres.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updatedPres.id), { slides }); }
    };

    const updateTheme = async (themeId: string) => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const updated = { ...activePresentation, theme: themeId as any };
        setActivePresentation(updated);
        if (currentUser && updated.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updated.id), { theme: themeId }); }
    };

    const updateTitle = async (newTitle: string) => {
        if (!activePresentation || isReadOnly) return;
        addToHistory(activePresentation);
        const updated = { ...activePresentation, title: newTitle };
        setActivePresentation(updated);
        if (currentUser && updated.id) { await updateDoc(doc(db, `users/${currentUser.uid}/presentations`, updated.id), { title: newTitle }); }
    };

    const handleNextStep = () => {
        if (!activePresentation) return;
        const currentSlide = activePresentation.slides[currentSlideIdx];
        const totalSlides = Math.max(activePresentation.slides.length, 1);

        if (view === 'presenting' && currentSlide && currentStep < currentSlide.bullets.length - 1) { 
            setCurrentStep(prev => prev + 1); 
        } 
        else if (currentSlideIdx < totalSlides - 1) { 
            setCurrentSlideIdx(prev => prev + 1); 
            setCurrentStep(0); 
        }
    };

    const handlePrevStep = () => {
        if (!activePresentation) return;
        if (view === 'presenting' && currentStep > 0) { 
            setCurrentStep(prev => prev - 1); 
        } 
        else if (currentSlideIdx > 0) { 
            const prevSlide = activePresentation.slides[currentSlideIdx - 1]; 
            setCurrentSlideIdx(prev => prev - 1); 
            setCurrentStep(view === 'presenting' && prevSlide ? prevSlide.bullets.length - 1 : 0); 
        }
    };

    const handleExportPDF = async () => {
        if (!activePresentation || !window.html2canvas) { setToastNotification({title: 'Error', message: 'Librería de exportación no cargada.', icon: 'close'}); return; }
        setIsExporting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 800));
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
            const container = exportContainerRef.current;
            if (!container) throw new Error("Export container missing");
            const slides = container.children;
            for (let i = 0; i < slides.length; i++) {
                const slideEl = slides[i] as HTMLElement;
                await new Promise(resolve => setTimeout(resolve, 300));
                const canvas = await window.html2canvas(slideEl, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#000000', logging: false });
                const imgData = canvas.toDataURL('image/jpeg', 0.85);
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
            }
            pdf.save(`${activePresentation.title.replace(/\s+/g, '_')}.pdf`);
            setToastNotification({ title: "PDF Exportado", message: "Presentación descargada.", icon: "check" });
        } catch (error) { console.error(error); setToastNotification({ title: "Error", message: "Falló la exportación.", icon: "close" }); } 
        finally { setIsExporting(false); }
    };

    const handleExportPPTX = async () => {
        if (!activePresentation || !window.PptxGenJS || !window.html2canvas) { setToastNotification({title: 'Error', message: 'Librerías de exportación no cargadas.', icon: 'close'}); return; }
        setToastNotification({ title: "Exportando PPTX", message: "Procesando diapositivas...", icon: "ai", isLoading: true });
        setIsExporting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 800));
            const pptx = new window.PptxGenJS();
            pptx.layout = 'LAYOUT_16x9'; pptx.author = 'Goatify IA'; pptx.company = 'Goatify IA Solutions'; pptx.title = activePresentation.title;
            
            const exportContainer = exportContainerRef.current;
            if (!exportContainer) throw new Error("Export container missing");
            const slideElements = exportContainer.children;
            
            if (slideElements.length === 0) {
                 throw new Error("No slide elements to capture. Container was empty.");
            }

            for (const [index, slide] of activePresentation.slides.entries()) {
                const pptSlide = pptx.addSlide();
                
                if (slide.customHtml) {
                    const slideEl = slideElements[index] as HTMLElement;
                    await new Promise(resolve => setTimeout(resolve, 400));
                    const canvas = await window.html2canvas(slideEl, { scale: 1.5, useCORS: true, allowTaint: true, backgroundColor: '#000000' });
                    const imgData = canvas.toDataURL('image/jpeg', 0.85);
                    pptSlide.addImage({ data: imgData, x: 0, y: 0, w: 10, h: 5.625 });
                } else {
                    pptSlide.background = { color: 'FFFFFF' };
                    const alignMap: Record<string, 'left' | 'center' | 'right'> = { left: 'left', center: 'center', right: 'right' };
                    const slideAlign = alignMap[slide.textAlign || 'left'];
                    pptSlide.addText(slide.title, { x: 0.5, y: 0.5, w: '90%', h: 0.8, fontSize: 32, bold: true, color: '4C1D95', valign: 'middle', align: slideAlign, fontFace: 'Arial' });
                    pptSlide.addShape(pptx.ShapeType.line, { x: 0.5, y: 1.3, w: '90%', h: 0.05, line: { color: 'E2E8F0', width: 1 } });
                    if (slide.subtitle) { pptSlide.addText(slide.subtitle, { x: 0.5, y: 1.4, w: '90%', h: 0.4, fontSize: 18, color: '64748B', fontFace: 'Arial', align: slideAlign }); }
                    const fontSize = 18 + (slide.fontSizeLevel || 0);
                    const bulletPoints = slide.bullets.map(b => ({ text: b, options: { bullet: true, indent: 20, margin: 5, color: '334155', fontSize: fontSize, bold: slide.fontWeight === 'bold', italic: slide.fontStyle === 'italic' } }));
                    
                    const assets = (slide.visualAssets && slide.visualAssets.length > 0) ? slide.visualAssets : (slide.visualCue ? [{ id: 'def', url: `https://image.pollinations.ai/prompt/${encodeURIComponent(slide.visualCue)}?seed=${index}`, type: getYoutubeId(slide.visualCue) ? 'youtube' : (slide.visualCue.includes('.pptx') ? 'video' : 'image') }] : []);
                    const hasVisuals = assets.length > 0;
                    let textX = 0.5, textW = '90%', imageX = 5.2, imageW = 4.3;
                    if (slide.layout === 'split-left') { textX = 0.5; textW = '45%'; imageX = 5.2; imageW = 4.3; } 
                    else if (slide.layout === 'split-right') { textX = 5.2; textW = '45%'; imageX = 0.5; imageW = 4.3; }
                    pptSlide.addText(bulletPoints, { x: textX, y: 2.0, w: textW, h: 3.5, valign: 'top', align: slideAlign, fontFace: 'Arial' });
                    if (hasVisuals) {
                        for (let idx = 0; idx < assets.length; idx++) {
                            const asset = assets[idx];
                            const finalX = assets.length === 1 ? imageX : (idx === 0 ? imageX : imageX + (imageW / 2) + 0.1);
                            const finalW = assets.length === 1 ? imageW : (imageW / 2) - 0.1;
                            if (asset.type === 'image' || !asset.type) {
                                const finalUrl = asset.url.startsWith('http') || asset.url.startsWith('data:') ? asset.url : `https://image.pollinations.ai/prompt/${encodeURIComponent(asset.url)}?seed=${index}`;
                                const b64Data = await getBase64FromUrl(finalUrl);
                                pptSlide.addImage({ data: b64Data, x: finalX, y: 1.5, w: finalW, h: 3.8, sizing: { type: 'contain', w: finalW, h: 3.8 } });
                            } else {
                                const ytId = getYoutubeId(asset.url);
                                const label = ytId ? 'Video en YouTube' : 'Archivo Video MP4';
                                pptSlide.addText(`▶ ${label}`, { x: finalX, y: 1.5, w: finalW, h: 3.8, color: 'FFFFFF', fontSize: 14, align: 'center', bold: true, fill: { color: '4C1D95' }, hyperlink: { url: asset.url, tooltip: 'Ver Video' } });
                                pptSlide.addText("(Haz clic para reproducir)", { x: finalX, y: 3.8, w: finalW, h: 1.0, color: 'FFFFFF', fontSize: 10, align: 'center', valign: 'top' });
                            }
                        }
                    }
                }
                pptSlide.addText("Goatify IA - Powering Business", { x: 0.5, y: 5.3, w: '90%', fontSize: 9, color: 'CBD5E1', align: 'right' });
            }
            await pptx.writeFile({ fileName: `${activePresentation.title.replace(/\s+/g, '_')}.pptx` });
            setToastNotification({ title: "Archivo Generado", message: "Presentación lista.", icon: "monitor" });
        } catch (error) { console.error(error); setToastNotification({ title: "Error", message: "No se pudo generar la presentación.", icon: "close" }); }
        finally { setIsExporting(false); }
    };

    const handleSaveToProject = async () => {
        if (!activePresentation || !targetProjectId || !window.html2canvas) return;
        setIsExporting(true);
        try {
             await new Promise(resolve => setTimeout(resolve, 500));
             const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
             const container = exportContainerRef.current;
             if(!container) return;
             const slides = container.children;
             for (let i = 0; i < slides.length; i++) {
                const canvas = await window.html2canvas(slides[i] as HTMLElement, { scale: 1.5, useCORS: true });
                const imgData = canvas.toDataURL('image/jpeg', 0.8);
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
             }
             const pdfBlob = pdf.output('blob');
             const reader = new FileReader();
             reader.onload = () => {
                const base64data = reader.result as string;
                sendDataUrlToProject(base64data, `${activePresentation.title}.pdf`, 'application/pdf', targetProjectId);
                setIsProjectModalOpen(false);
                setToastNotification({ title: "Guardado", message: "Presentación vinculada.", icon: "check" });
             };
             reader.readAsDataURL(pdfBlob);
        } catch (e) { console.error(e); } finally { setIsExporting(false); }
    };

    const handleShareToProjectShortcut = async () => {
        if (!activePresentation || !targetProjectId) return;
        setIsSavingToProject(true);
        try {
            const projectRef = doc(db, 'projects', targetProjectId);
            const projectSnap = await getDoc(projectRef);
            if (projectSnap.exists()) {
                const projectData = projectSnap.data() as Project;
                // Guardamos el modo en el campo 'size' o extendemos el Document (usaremos size: 1 para editor, 0 para viewer como hack si no hay campo)
                // O mejor, pondremos un prefijo en el id o nombre
                const shortcutId = `pres-shortcut-${activePresentation.id}-${shareMode}`;
                const newShortcut: Document = { 
                    id: shortcutId, 
                    name: `PRESENTACIÓN: ${activePresentation.title} (${shareMode === 'editor' ? 'EDICIÓN' : 'LECTURA'})`, 
                    content: activePresentation.id, 
                    uploadedAt: new Date().toISOString(), 
                    size: shareMode === 'editor' ? 1 : 0, 
                    fileType: 'interactive_presentation' 
                };
                const existingDocs = projectData.documents || [];
                if (!existingDocs.some(d => d.content === activePresentation.id && (d.id.endsWith('editor') || d.id.endsWith('viewer')))) {
                    await updateDoc(projectRef, { documents: [newShortcut, ...existingDocs] });
                    setToastNotification({ title: "Acceso Directo Creado", message: `"${activePresentation.title}" vinculada como ${shareMode}.`, icon: "rocket" });
                } else { 
                    // Actualizar si ya existe pero con otro modo
                    const updatedDocs = existingDocs.map(d => d.content === activePresentation.id ? newShortcut : d);
                    await updateDoc(projectRef, { documents: updatedDocs });
                    setToastNotification({ title: "Acceso Directo Actualizado", message: `Modo cambiado a ${shareMode}.`, icon: "check" });
                }
            }
            setIsShareToProjectModalOpen(false);
        } catch (e) { console.error(e); } finally { setIsSavingToProject(false); }
    };

    const enterFullscreen = () => { if (containerRef.current?.requestFullscreen) { containerRef.current.requestFullscreen(); setView('presenting'); setCurrentStep(0); } };
    useEffect(() => { 
        const handleFSChange = () => { 
            if (!document.fullscreenElement) { 
                setView('editor'); 
                // Segundad crítica: no resetear isReadOnly a false si el usuario es Lector
                // El estado de isReadOnly se gestiona en handleOpenPresentation y debe preservarse
                setActivePresTool('none'); 
            } 
        }; 
        document.addEventListener('fullscreenchange', handleFSChange); 
        return () => document.removeEventListener('fullscreenchange', handleFSChange); 
    }, []);
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            // Don't intercept if user is typing in an input or textarea
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            if (view !== 'home') {
                if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); handleNextStep(); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrevStep(); }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [view, currentSlideIdx, currentStep, activePresentation]);

    const currentTheme = THEMES[activePresentation?.theme as keyof typeof THEMES] || THEMES.modern;
    
    const filteredUsers = useMemo(() => {
        const otherUsers = allUsers.filter(u => u.uid !== currentUser?.uid);
        if (!shareSearch) return otherUsers;
        return otherUsers.filter(u => u.name.toLowerCase().includes(shareSearch.toLowerCase()) || u.email?.toLowerCase().includes(shareSearch.toLowerCase()));
    }, [allUsers, currentUser, shareSearch]);

    if (view === 'home') {
        return (
            <div className="h-full flex flex-col p-6 overflow-y-auto bg-neutral-50 dark:bg-neutral-950 animate-fade-in custom-scrollbar">
                <Modal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Importar Presentación Externa">
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-500">Pega el link de compartir de Canva, Google Slides o PowerPoint Online.</p>
                        <div>
                            <label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Título del Diseño</label>
                            <Input value={importTitle} onChange={e => setImportTitle(e.target.value)} placeholder="Ej: Presentación Inversionistas 2026" />
                        </div>
                        <div>
                            <label className="text-xs font-bold uppercase text-neutral-500 mb-1 block">Enlace (Share Link)</label>
                            <Input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://www.canva.com/design/..." />
                        </div>
                        <div className="flex justify-end gap-2 pt-4 border-t dark:border-neutral-800">
                            <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleImportLink} disabled={!importUrl.trim() || !importTitle.trim()}>Importar Ahora</Button>
                        </div>
                    </div>
                </Modal>

                <Modal isOpen={isShareToUserModalOpen} onClose={() => setIsShareToUserModalOpen(false)} title="Compartir Presentación">
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-500">Se enviará una copia de <strong>"{presToShare?.title}"</strong> a la biblioteca del destinatario.</p>
                        <Input value={shareSearch} onChange={e => setShareSearch(e.target.value)} placeholder="Buscar usuario..." />
                        <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar p-1">
                            {filteredUsers.length > 0 ? filteredUsers.map(user => (
                                <div key={user.uid} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700 hover:border-brand-primary transition-all group">
                                    <div className="flex items-center gap-3">
                                        <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-10 h-10 rounded-full object-contain" alt={user.name} />
                                        <div><p className="font-bold text-sm text-neutral-900 dark:text-white">{user.name}</p><p className="text-[10px] text-neutral-500 uppercase">{user.headline || 'Miembro'}</p></div>
                                    </div>
                                    <Button size="sm" disabled={isSharingProcess} onClick={() => handleSharePresentationToUser(user)} className="font-black uppercase text-[10px] tracking-widest px-4">
                                        {isSharingProcess ? '...' : 'Enviar'}
                                    </Button>
                                </div>
                            )) : (
                                <p className="text-center py-10 opacity-40 italic text-sm">No se encontraron contactos en tu círculo.</p>
                            )}
                        </div>
                        <div className="pt-4 border-t dark:border-neutral-800 flex justify-end">
                            <Button variant="secondary" onClick={() => setIsShareToUserModalOpen(false)}>Cancelar</Button>
                        </div>
                    </div>
                </Modal>

                <div className="max-w-6xl mx-auto w-full text-center py-12 mb-8">
                    <h1 className="text-5xl md:text-7xl font-black mb-8 tracking-tight text-neutral-900 dark:text-white">Crea <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-purple-600">Presentaciones</span> de Élite</h1>
                    
                    <div className="flex flex-wrap justify-center gap-4 mb-8">
                        <button 
                            onClick={() => setGenerationMode('standard')}
                            className={`px-6 py-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-2 flex items-center gap-3 ${generationMode === 'standard' ? 'bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20' : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-brand-primary'}`}
                        >
                            <Icon name="monitor" className="w-4 h-4"/> Diseño Estándar (Editable/PDF)
                        </button>
                        <button 
                            onClick={() => setGenerationMode('code')}
                            className={`px-6 py-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border-2 flex items-center gap-3 ${generationMode === 'code' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-600/40' : 'bg-white dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-indigo-600'}`}
                        >
                            <Icon name="ai" className="w-4 h-4"/> Modo Cinemático (Masterpiece)
                        </button>
                    </div>

                    <div className="max-w-4xl mx-auto flex flex-col items-center">
                        <div className="w-full bg-white dark:bg-neutral-900 p-4 rounded-[2.5rem] shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col gap-4 transition-transform hover:scale-[1.01]">
                            <div className="flex gap-3 w-full flex-col sm:flex-row">
                                <div className="flex-grow bg-neutral-50 dark:bg-neutral-950 rounded-2xl flex items-center px-4 border border-neutral-100 dark:border-neutral-800"> 
                                    <Icon name="ai" className={`w-6 h-6 ${generationMode === 'code' ? 'text-indigo-500' : 'text-brand-primary'} mr-3 animate-pulse`}/> 
                                    <Input 
                                        value={topic} 
                                        onChange={e => setTopic(e.target.value)} 
                                        placeholder={generationMode === 'code' ? "Describe tu presentación profesional o sube archivos..." : "Ej: Plan de Expansión 2026..."} 
                                        className="!mt-0 h-12 text-lg border-none focus:ring-0 bg-transparent w-full placeholder-neutral-400 font-bold" 
                                        onKeyDown={e => e.key === 'Enter' && handleGenerate()} 
                                    /> 
                                </div>
                                <div className="flex-grow max-w-[250px] bg-neutral-50 dark:bg-neutral-950 rounded-2xl flex items-center px-4 border border-neutral-100 dark:border-neutral-800"> 
                                    <Icon name="link" className="w-4 h-4 text-neutral-400 mr-2"/> 
                                    <Input 
                                        value={referenceUrl} 
                                        onChange={e => setReferenceUrl(e.target.value)} 
                                        placeholder="URL de Referencia..." 
                                        className="!mt-0 h-12 text-sm border-none focus:ring-0 bg-transparent w-full placeholder-neutral-400 font-medium" 
                                        onKeyDown={e => e.key === 'Enter' && handleGenerate()} 
                                    /> 
                                </div>
                                <div className="flex items-center bg-neutral-50 dark:bg-neutral-950 rounded-2xl px-4 border border-neutral-100 dark:border-neutral-800 flex-shrink-0">
                                    <span className="text-[10px] uppercase font-bold text-neutral-500 mr-2 shrink-0">Slides</span>
                                    <input type="number" min="1" max="30" value={numSlides} onChange={e => setNumSlides(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} className="w-[60px] h-12 bg-transparent outline-none border-none focus:ring-0 text-center font-bold" />
                                </div>
                                <Button 
                                    onClick={handleGenerate} 
                                    disabled={isGenerating || !topic} 
                                    className={`h-14 px-10 rounded-2xl ${generationMode === 'code' ? 'bg-indigo-600 hover:shadow-indigo-600/40' : 'bg-brand-primary hover:shadow-brand-primary/40'} text-white font-black shadow-lg text-lg uppercase tracking-widest transition-all`}
                                > 
                                    {isGenerating ? <Spinner className="text-white" text="Iniciando..." /> : "Generar"} 
                                </Button>
                            </div>

                            {/* Context Files UI */}
                            <div className="flex flex-wrap items-center gap-3 px-2">
                                <button 
                                    onClick={() => contextFileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-indigo-500 transition-colors"
                                >
                                    <Icon name="upload" className="w-3.5 h-3.5"/> Local
                                </button>
                                <button 
                                    onClick={() => setIsContextDrivePickerOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-brand-primary transition-colors"
                                >
                                    <Icon name="folder" className="w-3.5 h-3.5"/> Goatify Drive
                                </button>
                                <input type="file" ref={contextFileInputRef} className="hidden" multiple onChange={handleContextFileChange} accept=".pdf,.doc,.docx,.txt,.html" />
                                
                                {contextFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full border border-indigo-100 dark:border-indigo-800 animate-fade-in group">
                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[150px]">{file.name}</span>
                                        <button onClick={() => removeContextFile(idx)} className="text-indigo-400 hover:text-red-500 transition-colors">
                                            <Icon name="close" className="w-3 h-3"/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {generationMode === 'code' && (
                            <div className="mt-6 flex flex-col items-center gap-2">
                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] animate-pulse">✨ Presentación de Nivel Mundial en Tiempo Real</p>
                                <p className="text-[9px] text-neutral-500 max-w-md italic">
                                    Cuesta <span className="font-black text-neutral-900 dark:text-white">1 Presentación + 5 AI Credits</span>. El sistema analizará tus archivos adjuntos para crear un diseño pro con código impecable y estructurado para cada diapositiva (máx. 30).
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="max-w-6xl mx-auto w-full mt-8 pb-32">
                    <DriveFilePicker isOpen={isContextDrivePickerOpen} onClose={() => setIsContextDrivePickerOpen(false)} onSelect={handleContextDriveSelect} allowedTypes={['application/', 'text/', 'image/']} />
                    <div className="flex items-center justify-between mb-8 border-b dark:border-neutral-900 pb-4"> 
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-brand-accent/10 rounded-xl"><Icon name="clock" className="w-5 h-5 text-brand-primary"/></div> 
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Mis Diseños</h3> 
                        </div>
                        <Button onClick={() => setIsImportModalOpen(true)} variant="secondary" size="sm" className="bg-white dark:bg-neutral-800 border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white font-black uppercase text-[10px] tracking-widest h-10 px-6">
                            <Icon name="upload" className="w-4 h-4"/> Importar Link (Canva/PPT)
                        </Button>
                    </div>
            {savedPresentations.length > 0 ? ( <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"> {savedPresentations.map(pres => ( <PresentationCoverCard key={pres.id} pres={pres} onClick={() => handleOpenPresentation(pres)} onDelete={handleDeletePresentation} onShare={(p) => { setPresToShare(p); setIsShareToUserModalOpen(true); }} theme={THEMES[pres.theme as keyof typeof THEMES] || THEMES.modern} /> ))} </div> ) : ( <div className="text-center py-24 opacity-30"> <Icon name="monitor" className="w-20 h-20 mx-auto mb-4" /> <p className="text-xl font-bold uppercase tracking-widest">Aún no has diseñado nada</p> </div> )}
                </div>
            </div>
        );
    }

    const editorContent = (
        <div className={`h-full flex flex-col bg-neutral-100 dark:bg-neutral-950 overflow-hidden relative ${isEditorFullScreen ? 'fixed inset-0 z-[999999999] !m-0 !rounded-none w-screen h-screen' : ''}`} ref={containerRef}>
            {view === 'presenting' && (
                <>
                    <DrawingOverlay 
                        isActive={activePresTool !== 'none'} 
                        tool={activePresTool} 
                        clearToken={clearDrawingsToken}
                        initialDrawing={slideDrawings[currentSlideIdx]}
                        onSave={(data) => setSlideDrawings(prev => ({ ...prev, [currentSlideIdx]: data }))}
                    />
                    <PresentationToolbar 
                        onPrev={handlePrevStep}
                        onNext={handleNextStep}
                        onClose={() => { if(document.exitFullscreen) document.exitFullscreen(); setView('editor'); }}
                        onClear={() => {
                            setClearDrawingsToken(t => t + 1);
                            setSlideDrawings(prev => {
                                const next = { ...prev };
                                delete next[currentSlideIdx];
                                return next;
                            });
                        }}
                        tool={activePresTool}
                        setTool={setActivePresTool}
                    />
                </>
            )}
            <div ref={exportContainerRef} className="fixed opacity-0 pointer-events-none -z-10 bg-black" style={{ width: '297mm', height: '210mm', top: '-500vh', left: '-500vw' }}> {activePresentation && !activePresentation.externalUrl && isExporting && activePresentation.slides.map((slide, idx) => ( <div key={idx} style={{ width: '297mm', height: '210mm', position: 'relative' }}> <SlideCanvas slide={slide} index={idx} theme={currentTheme} onEdit={() => {}} isExporting={true} currentStep={slide.bullets.length} /> </div> ))} </div>
            {isExporting && ( <div className="fixed inset-0 z-[260000] bg-black/90 flex flex-col items-center justify-center text-white backdrop-blur-sm"> <Spinner className="text-white mb-4 h-12 w-12" /> <h3 className="text-3xl font-black uppercase tracking-tighter mb-2">Exportando...</h3> <p className="text-xs uppercase tracking-[0.3em] opacity-50 animate-pulse">Goatify IA - Generando Diapositivas...</p> </div> )}
            <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Exportar PDF a Proyecto"> <div className="space-y-4"> <p className="text-sm font-medium">Selecciona el proyecto de destino:</p> <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-2xl p-3 font-bold outline-none text-black dark:text-white"> <option value="">Seleccionar Proyecto...</option> {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)} </select> <div className="flex justify-end gap-2 pt-4"> <Button variant="secondary" onClick={() => setIsProjectModalOpen(false)}>Cancelar</Button> <Button onClick={handleSaveToProject} disabled={!targetProjectId}>Guardar PDF</Button> </div> </div> </Modal>
            <Modal isOpen={isShareToProjectModalOpen} onClose={() => setIsShareToProjectModalOpen(false)} title="Vincular a Proyecto (Interactivo)"> 
                <div className="space-y-6"> 
                    <p className="text-sm font-medium opacity-70">Selecciona cómo quieres que los miembros vean esta presentación:</p> 
                    
                    <div className="flex gap-4">
                            <button 
                                onClick={() => setShareMode('viewer')}
                                className={`flex-1 p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${shareMode === 'viewer' ? 'border-brand-primary bg-brand-primary/5 shadow-inner' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'}`}
                            >
                                <div className={`p-3 rounded-2xl ${shareMode === 'viewer' ? 'bg-brand-primary text-white shadow-lg' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}>
                                    <Icon name="monitor" className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                    <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${shareMode === 'viewer' ? 'text-brand-primary' : 'text-neutral-500'}`}>Modo Lector</span>
                                    <span className="text-[9px] opacity-50 mt-1 block">Sólo ver y presentar</span>
                                </div>
                            </button>
                            <button 
                                onClick={() => setShareMode('editor')}
                                className={`flex-1 p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${shareMode === 'editor' ? 'border-indigo-600 bg-indigo-600/5 shadow-inner' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'}`}
                            >
                                <div className={`p-3 rounded-2xl ${shareMode === 'editor' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}>
                                    <Icon name="code" className="w-6 h-6" />
                                </div>
                                <div className="text-center">
                                    <span className={`block text-[11px] font-black uppercase tracking-[0.2em] ${shareMode === 'editor' ? 'text-indigo-600' : 'text-neutral-500'}`}>Modo Editor</span>
                                    <span className="text-[9px] opacity-50 mt-1 block">Editar contenido e IA</span>
                                </div>
                            </button>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Proyecto Destino:</p>
                        <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-2xl p-3 font-bold outline-none text-black dark:text-white"> 
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)} 
                        </select> 
                    </div>

                    <div className="flex justify-end gap-2 pt-4"> 
                        <Button variant="secondary" onClick={() => setIsShareToProjectModalOpen(false)}>Cancelar</Button> 
                        <Button onClick={handleShareToProjectShortcut} disabled={isSavingToProject} className={shareMode === 'editor' ? 'bg-indigo-600' : 'bg-brand-primary'}>Compartir</Button> 
                    </div> 
                </div> 
            </Modal>
            {view === 'editor' && (
                <div className="h-auto py-3 lg:h-16 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap lg:flex-nowrap items-center justify-between px-4 sm:px-6 z-20 shadow-xl flex-shrink-0 gap-4">
                    <div className="flex items-center gap-3 flex-1 flex-shrink min-w-0"> <Button variant="ghost" onClick={() => setView('home')} className="!p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 flex-shrink-0"> <Icon name="chevronLeft" className="w-5 h-5"/> </Button> <Input value={activePresentation?.title} onChange={(e) => updateTitle(e.target.value)} disabled={isReadOnly} className="!mt-0 !border-none !bg-transparent font-black text-xs sm:text-sm lg:text-base focus:ring-0 w-full sm:w-[200px] lg:w-[300px] uppercase tracking-tighter truncate" /> </div>
                    {!activePresentation?.externalUrl && !isReadOnly && ( <div className="hidden xl:flex items-center gap-2 bg-neutral-50 dark:bg-neutral-950 p-1.5 rounded-2xl flex-shrink-0"> {Object.values(THEMES).map(t => ( <button key={t.id} onClick={() => updateTheme(t.id)} className={`w-6 h-6 rounded-full ${t.accentBg} border-2 border-white dark:border-black ring-1 transition-all hover:scale-125 ${activePresentation?.theme === t.id ? 'ring-brand-primary scale-110 shadow-lg' : 'ring-transparent opacity-40 hover:opacity-100'}`} title={t.name}/> ))} </div> )}
                    <div className="flex items-center gap-2 sm:gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
                         {isReadOnly && <div className="bg-brand-primary/10 text-brand-primary px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest mr-2 border border-brand-primary/20 flex items-center gap-2"><Icon name="lock" className="w-3 h-3"/> Sólo Lectura</div>}
                         <Button variant="ghost" size="sm" onClick={() => setIsEditorFullScreen(!isEditorFullScreen)} className={`!p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl transition-all flex-shrink-0 ${isEditorFullScreen ? 'bg-brand-primary/20 text-brand-primary' : 'text-black dark:text-white'}`} title="Pantalla Completa"><Icon name={isEditorFullScreen ? "close" : "expand"} className="w-4 h-4"/></Button>
                         {!isReadOnly && <Button variant="ghost" size="sm" onClick={() => setIsShareToProjectModalOpen(true)} className="!p-2.5 bg-brand-primary/5 dark:bg-brand-primary/10 rounded-xl text-brand-primary flex-shrink-0 group/share relative overflow-hidden" title="Vincular a Proyecto">
                            <div className="absolute inset-0 bg-brand-primary/10 translate-y-full group-hover/share:translate-y-0 transition-transform"></div>
                            <Icon name="share" className="w-4 h-4 relative z-10"/>
                         </Button>}
                         {!activePresentation?.externalUrl && ( 
                            <div className="flex bg-neutral-50 dark:bg-neutral-950 p-1 rounded-xl">
                                <Button variant="ghost" size="sm" onClick={() => setIsProjectModalOpen(true)} className="!p-2 text-neutral-400 hover:text-brand-primary" title="Exportar PDF a Proyecto"><Icon name="folder" className="w-3.5 h-3.5"/></Button> 
                                <Button variant="ghost" size="sm" onClick={handleExportPDF} className="!p-2 text-neutral-400 hover:text-red-500" title="Descargar PDF"><Icon name="upload" className="w-3.5 h-3.5"/></Button> 
                                <Button variant="ghost" size="sm" onClick={handleExportPPTX} className="!p-2 text-neutral-400 hover:text-brand-primary" title="Exportar PPTX"><Icon name="monitor" className="w-3.5 h-3.5"/></Button> 
                            </div>
                         )}
                         <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mx-1 flex-shrink-0"></div>
                         <Button onClick={enterFullscreen} className="bg-brand-primary text-white shadow-xl hover:bg-brand-secondary px-6 lg:px-8 font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl h-11 flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95 flex-shrink-0"> <Icon name="monitor" className="w-5 h-5"/> <span>Presentar</span> </Button>
                    </div>
                </div>
            )}
            <div className={`flex-1 flex overflow-hidden relative ${view === 'presenting' ? 'bg-black items-center justify-center fixed inset-0 z-[250000]' : ''}`}>
                {view === 'editor' && !activePresentation?.externalUrl && (
                    <div className="w-40 sm:w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden z-10 flex-shrink-0">
                        <div className="p-3 border-b dark:border-neutral-800 flex items-center justify-between"> <h4 className="text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-neutral-400">Slides</h4> <span className="text-[7px] sm:text-[9px] font-bold bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full">{activePresentation?.slides.length}</span> </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                            {activePresentation?.slides.map((slide, idx) => (
                                <SlideThumbnail 
                                    key={slide.id} slide={slide} index={idx} isActive={idx === currentSlideIdx} 
                                    onClick={() => { setCurrentSlideIdx(idx); setCurrentStep(0); }} 
                                    onDelete={() => handleDeleteSlide(idx)}
                                    onDuplicate={() => handleDuplicateSlide(idx)}
                                    onMove={(dir) => handleMoveSlide(idx, dir)}
                                    theme={currentTheme}
                                    isReadOnly={isReadOnly} 
                                />
                            ))}
                            {!isReadOnly && <button onClick={handleAddSlide} className="w-full aspect-video border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl flex flex-col items-center justify-center text-neutral-400 hover:border-brand-primary hover:text-brand-primary transition-all group p-4"> <div className="p-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 mb-2 group-hover:scale-110 transition-transform"><Icon name="plus" className="w-4 h-4"/></div> <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-widest">Nueva</span> </button>}
                        </div>
                    </div>
                )}
                <div className={`flex-1 flex items-center justify-center relative transition-all duration-500 ease-in-out ${view === 'presenting' ? 'w-full h-full p-0 bg-black' : 'bg-neutral-100 dark:bg-black p-4 md:p-6'}`}>
                    {activePresentation && (
                        activePresentation.externalUrl ? (
                            <div className={`w-full h-full max-w-7xl mx-auto bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border-8 border-neutral-900 ${view === 'presenting' ? '!max-w-none !rounded-none !border-0' : ''}`}> 
                                <iframe key={activePresentation.externalUrl} src={activePresentation.externalUrl} className="w-full h-full border-0" allowFullScreen allow="autoplay; encrypted-media" /> 
                            </div>
                        ) : (
                            <div key={`slide-container-${currentSlideIdx}`} className={`relative shadow-[0_30px_70px_rgba(0,0,0,0.4)] transition-all duration-700 ease-in-out bg-white overflow-hidden flex items-center justify-center group ${view === 'presenting' ? `w-full h-full rounded-none border-0 ${currentTheme.bg} ${currentTheme.gradient}` : 'w-full max-w-[96vw] lg:max-w-[88vw] max-h-[85vh] aspect-video rounded-[1.5rem] md:rounded-[2.5rem] md:border-[12px] border-neutral-900 dark:border-neutral-800 shadow-2xl overflow-hidden'}`}>
                                <div className={`relative ${view === 'presenting' ? 'aspect-video w-full h-auto max-h-screen max-w-full' : 'w-full h-full'}`}>
                                    <SlideCanvas 
                                        slide={activePresentation.slides[currentSlideIdx]} 
                                        index={currentSlideIdx} 
                                        theme={currentTheme} 
                                        onEdit={handleUpdateSlide} 
                                        onUndo={handleUndo} 
                                        onRedo={handleRedo} 
                                        onRegenerateSlide={handleRegenerateSlide}
                                        canUndo={undoStack.length > 1}
                                        canRedo={redoStack.length > 0}
                                        isPresentationMode={view === 'presenting'} 
                                        currentStep={currentStep} 
                                        onNextStep={handleNextStep} 
                                        isReadOnly={isReadOnly} 
                                    />
                                </div>
                            </div>
                        )
                    )}
                    {activePresentation && !activePresentation.externalUrl && view !== 'presenting' && ( <div className={`absolute bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 sm:gap-6 p-2 sm:p-2 bg-black/60 backdrop-blur-2xl text-white transition-all hover:scale-105 ${view === 'presenting' ? 'hidden pointer-events-none' : 'opacity-100 z-50'} border border-white/10 shadow-2xl rounded-full`}> <button onClick={handlePrevStep} disabled={currentSlideIdx === 0 && (view === 'presenting' ? currentStep === 0 : true)} className="p-2 sm:p-3 hover:bg-white/20 rounded-full disabled:opacity-20 transition-all hover:scale-110 active:scale-90"> <Icon name="chevronLeft" className="w-4 h-4 sm:w-5 sm:h-5"/> </button> <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]"> <span className="text-xs sm:text-sm font-black font-mono tracking-tighter tabular-nums leading-none"> {currentSlideIdx + 1} <span className="opacity-30 text-[10px]">/ {activePresentation?.slides.length}</span> </span> </div> <button onClick={handleNextStep} disabled={activePresentation && currentSlideIdx === (activePresentation?.slides.length || 0) - 1 && (view === 'presenting' ? currentStep === (activePresentation.slides[currentSlideIdx]?.bullets.length || 0) - 1 : true)} className="p-2 sm:p-3 hover:bg-white/20 rounded-full disabled:opacity-20 transition-all hover:scale-110 active:scale-90"> <Icon name="chevronLeft" className="w-4 h-4 sm:w-5 sm:h-5 rotate-180"/> </button> </div> )}
                </div>
            </div>
        </div>
    );

    const fullScreenContent = isEditorFullScreen ? ( <div className="fixed inset-0 z-[999999999] w-screen h-screen bg-black"> {editorContent} </div> ) : ( <div className="h-full w-full"> {editorContent} </div> );
    return fullScreenContent;
};

export default PresentationBuilder;
