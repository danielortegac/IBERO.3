import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import Icon from './Icon';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import Modal from './ui/Modal';
import Input from './ui/Input';
import { useTranslation } from '../hooks/useTranslation';
import { getAiChatResponseStream, buildPersonalizedSystemInstruction, generateProjectTemplate } from '../services/geminiService';
import type { ChatMessage, Project, Note, UserProfile, CallSession } from '../types';
import { executeAssistantActions, extractActions, cleanTextFromActions } from '../services/actionExecutor';
import { ArtifactResultCard, TaskResultCard, MeetingResultCard, ProjectResultCard, MailDraftResultCard, EmailSentResultCard } from './ActionResultCards';
import { ChatChart } from './ChatChart';
import { doc, setDoc, updateDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getPlanConfig } from '../types';
import DriveFilePicker from './ui/DriveFilePicker';
import PlanCreditBadge from './PlanCreditBadge';

// Componente optimizado para renderizar mensajes sin bloquear el hilo principal
const MessageList = React.memo(({ history, isLoading, onStartEdit, editingMessageId, editInput, setEditInput, saveEdit, cancelEdit, scrollToBottom, onSendToProject }: { 
    history: ChatMessage[], 
    isLoading: boolean, 
    onStartEdit: (m: ChatMessage) => void,
    editingMessageId: string | null,
    editInput: string,
    setEditInput: (v: string) => void,
    saveEdit: (id: string) => void,
    cancelEdit: () => void,
    scrollToBottom: (force?: boolean) => void,
    onSendToProject: (art: any) => void
}) => {
    return (
        <>
            {history.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-subtle-slide-in-up`}>
                    <div className={`relative group max-w-[min(760px,92%)] rounded-3xl px-4 sm:px-5 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-sm' : 'bg-neutral-50 dark:bg-neutral-950 text-gray-800 dark:text-gray-200 border border-neutral-100 dark:border-neutral-800'}`}>
                        {msg.files && msg.files.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {msg.files.map((f, i) => (
                                    <div key={i} className="p-1 bg-black/10 rounded-lg max-w-[120px] cursor-pointer" onClick={() => window.open(f.url, '_blank')}>
                                        {f.type.startsWith('image/') ? <img src={f.url} className="rounded h-20 w-auto object-contain" /> : <div className="flex items-center gap-2 p-2 text-[10px] font-bold text-white"><Icon name="folder" className="w-3 h-3"/><span className="truncate">{f.name}</span></div>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {msg.imageUrl && (
                            <div className="relative mb-2">
                                <img src={msg.imageUrl} className="rounded-xl max-h-48 w-full object-contain border border-white/10" alt="Vista" />
                                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded text-[8px] text-white uppercase font-black tracking-widest ring-1 ring-white/20">Visión HUD Shivo</div>
                            </div>
                        )}
                        {msg.artifacts && msg.artifacts.length > 0 && (
                            <div className="flex flex-col gap-2 mb-3 mt-1">
                                {msg.artifacts.map((art, i) => (
                                    <ArtifactResultCard 
                                        key={i} 
                                        artifact={art} 
                                        onSendToProject={() => onSendToProject(art)}
                                    />
                                ))}
                            </div>
                        )}
                        {msg.actionResults && msg.actionResults.length > 0 && (
                            <div className="flex flex-col gap-3 mb-4 mt-2">
                                {msg.actionResults.map((result, i) => (
                                    <React.Fragment key={i}>
                                        {result.type === 'GENERATE_CHART' && result.data && (
                                            <ChatChart 
                                                type={result.data.chartType || 'bar'} 
                                                title={result.data.title || 'Gráfica IA'} 
                                                data={result.data.data} 
                                                analysis={result.data.analysis} 
                                            />
                                        )}
                                        {result.type === 'GENERATE_ARTIFACT' && result.data && (
                                            <ArtifactResultCard 
                                                artifact={result.data} 
                                                onSendToProject={() => onSendToProject(result.data)}
                                            />
                                        )}
                                        {result.type === 'CREATE_TASK' && result.data && result.success && (
                                            <TaskResultCard task={result.data} />
                                        )}
                                        {(result.type === 'CREATE_MEETING' || result.type === 'CREATE_EVENT') && result.data && result.success && (
                                            <MeetingResultCard event={result.data} />
                                        )}
                                        {result.type === 'CREATE_PROJECT' && result.data && result.success && (
                                            <ProjectResultCard project={result.data} />
                                        )}
                                        {result.type === 'SAVE_DRAFT' && result.data && result.success && (
                                            <MailDraftResultCard draft={result.data} />
                                        )}
                                        {result.type === 'SEND_EMAIL' && result.data && result.success && (
                                            <EmailSentResultCard email={result.data} />
                                        )}
                                        {result.type === 'GENERATE_ARTIFACT' && result.data && !result.success && (
                                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-[10px] font-bold text-red-500 uppercase tracking-widest leading-relaxed">
                                                ❌ Error al generar archivo: {result.message}
                                            </div>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        {editingMessageId === msg.id ? (
                            <div className="space-y-2 min-w-[200px]">
                                <Textarea value={editInput} onChange={e => setEditInput(e.target.value)} className="w-full text-white bg-black/20" />
                                <div className="flex justify-end gap-2">
                                    <button onClick={cancelEdit} className="text-[10px] uppercase font-bold text-white/70">Cancelar</button>
                                    <button onClick={() => saveEdit(msg.id)} className="text-[10px] uppercase font-bold text-white">Guardar</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {msg.isLoading && !msg.text ? (
                                    <div className="flex gap-1.5 h-5 items-center px-1"><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-150"></div></div>
                                ) : <ChatMessageRenderer text={msg.text} className={msg.role === 'user' ? 'text-white' : ''} />}
                                
                                {msg.role === 'user' && !isLoading && !editingMessageId && (
                                    <button 
                                        onClick={() => onStartEdit(msg)} 
                                        className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-brand-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Editar mensaje"
                                    >
                                        <Icon name="edit" className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ))}
        </>
    );
});

// Componente de entrada aislado para evitar re-renderizados globales y lag al escribir
const MemoizedInputArea = React.memo(({ onSend, onFileChange, onPaste, isScreenSharing, isLoading, handleStartLiveAudio, handleStartLiveVideo, onShortcutAction, onOpenDrive }: any) => {
    const [localInput, setLocalInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLTextAreaElement>(null);

    const handleSendLocal = (prompt?: string) => {
        const text = prompt || localInput;
        if (!text.trim() && !isLoading) return;
        onSend(text);
        setLocalInput('');
    };

    const QUICK_GUIDE_BUTTONS = [
        { label: "REVISA MI AGENDA HOY", prompt: "Shivo, revisa mi agenda y mi calendario completo para hoy y dime mis actividades críticas.", type: 'chat' },
        { label: "CREA UNA TAREA", prompt: "Shivo, quiero crear una nueva tarea importante.", type: 'chat' },
        { label: "CREA UNA IMAGEN", type: 'shortcut', action: 'image' },
        { label: "CREA UNA PRESENTACIÓN", type: 'shortcut', action: 'presentation' },
        { label: "VER PANTALLA EN VIVO", type: 'shortcut', action: 'screen' },
        { label: "REVISA MIS PROYECTOS", prompt: "¿Cuáles son mi proyectos activos actuales? Dame un resumen de su progreso.", type: 'chat' },
        { label: "AGENDA UNA REUNIÓN", prompt: "Agendame una reunión de cierre para mañana a las 10:00 AM.", type: 'chat' }
    ];

    return (
        <div className="flex flex-col gap-2">
            {/* QUICK GUIDE BUTTONS - 7 botones de una sola línea */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 px-1">
                {QUICK_GUIDE_BUTTONS.map((btn, i) => (
                    <button 
                        key={i} 
                        onClick={() => btn.type === 'chat' ? handleSendLocal(btn.prompt) : onShortcutAction(btn.action)}
                        className="flex-shrink-0 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-[8px] font-black text-neutral-500 hover:text-brand-primary hover:border-brand-primary transition-all uppercase tracking-tighter whitespace-nowrap"
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            <div className="relative flex items-end gap-1 bg-white dark:bg-neutral-950 rounded-[1.75rem] p-2 shadow-lg border border-neutral-200 dark:border-neutral-800 focus-within:border-brand-primary/50 transition-all">
                <input type="file" multiple ref={fileInputRef} className="hidden" onChange={onFileChange} accept="*" />
                <div className="flex flex-row items-center gap-1 flex-none pb-1">
                    <button onClick={() => (fileInputRef.current as any)?.click()} className="p-2 text-neutral-400 hover:text-brand-primary rounded-full" title="Adjuntar desde PC"><Icon name="plus" className="w-5 h-5" /></button>
                    <button onClick={onOpenDrive} className="p-2 text-brand-primary hover:bg-brand-primary/10 rounded-full" title="Adjuntar desde Goatify Drive"><Icon name="folder" className="w-5 h-5" /></button>
                </div>
                
                <Textarea 
                    ref={textareaRef} 
                    value={localInput} 
                    onChange={(e) => setLocalInput(e.target.value)} 
                    onKeyDown={(e) => { 
                        if (e.key === 'Enter' && !e.shiftKey) { 
                            e.preventDefault(); 
                            handleSendLocal(); 
                        } 
                    }} 
                    onPaste={onPaste}
                    placeholder={isScreenSharing ? "Shivo ve tu pantalla... Pregúntale." : "Escribe un mensaje fluido..."} 
                    className="!mt-0 bg-transparent border-none focus:ring-0 w-full text-sm py-2" 
                />
                <div className="flex items-center gap-1">
                    <button onClick={() => handleSendLocal()} disabled={isLoading} className="p-3 rounded-2xl bg-brand-primary text-white shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center disabled:opacity-50">
                        <Icon name={isLoading ? "sync" : "send"} className={`w-4 h-4 ${isLoading ? 'animate-spin' : 'translate-x-0.5'}`} />
                    </button>
                    <button onClick={handleStartLiveAudio} className="p-3 rounded-2xl bg-neutral-200 dark:bg-neutral-700 text-brand-primary hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md" title="Modelo de Voz">
                        <Icon name="mic" className="w-4 h-4"/>
                    </button>
                    <button onClick={handleStartLiveVideo} className="p-3 rounded-2xl bg-neutral-200 dark:bg-neutral-700 text-purple-600 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-md" title="Modelo de Video">
                        <Icon name="video" className="w-4 h-4"/>
                    </button>
                </div>
            </div>
        </div>
    );
});

interface AdvancedChatProps {
    isGlobal: boolean;
    chatHistory?: ChatMessage[];
    setChatHistory?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
    projectContext?: Project;
}

const AdvancedChat: React.FC<AdvancedChatProps> = ({ isGlobal, chatHistory, setChatHistory, projectContext }) => {
    const { t, language } = useTranslation();
    const { 
        userProfile, globalChats, setGlobalChats, activeGlobalChatId, setActiveGlobalChatId,
        addNewGlobalChat, deleteGlobalChat, checkQueryLimit, checkWebSearchLimit,
        setCurrentView, projects, setToastNotification,
        createTask, addProject, updateProject, currentUser, allUsers, sendDirectMessage, userUsage,
        allLeads, assignGlobalChatToProject, setLiveSessionMode, setLiveSessionContext,
        checkLiveConversationLimit, isScreenSharingGlobal, setIsScreenSharingGlobal,
        setSelectedProjectId, setProModalOpen, startupPrompt, setStartupPrompt,
        setIsAgentFullScreen, emailAccounts, setMailDraft, mailLists, mailContacts
    } = useContext(AppContext);
    
    const { scheduleMeeting } = useContext(CallContext);

    const [isLoading, setIsLoading] = useState(false);
    const [attachedFiles, setAttachedFiles] = useState<{ name: string, url: string, type: string, base64Data?: string }[]>([]);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');
    const [isInternalFullScreen, setIsInternalFullScreen] = useState(false);
    const [isCapabilitiesModalOpen, setIsCapabilitiesModalOpen] = useState(false);
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
    const [isToolsDrawerOpen, setIsToolsDrawerOpen] = useState(false);
    const [assigningArtifact, setAssigningArtifact] = useState<any>(null);

    const shouldAutoScrollRef = useRef(true);
    const [isAtBottom, setIsAtBottom] = useState(true);
    
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenIntervalRef = useRef<number | null>(null);
    const [screenPreview, setScreenPreview] = useState<string | null>(null);
    const sharingStartTimeRef = useRef<number | null>(null);

    const [isAssignModalOpen, setAssignModalOpen] = useState(false);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

    const [pipWindow, setPipWindow] = useState<Window | null>(null);

    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const streamingBufferRef = useRef('');
    const displayedTextRef = useRef('');
    const isStreamingActiveRef = useRef(false);
    const typewriterIntervalRef = useRef<number | null>(null);
    
    const [scheduledCalls, setScheduledCalls] = useState<CallSession[]>([]);

    useEffect(() => {
        const isMobile = window.innerWidth < 1024;
        if (isMobile) {
            setIsAgentFullScreen(true);
        }
        return () => {
            if (isMobile) setIsAgentFullScreen(false);
        };
    }, [setIsAgentFullScreen]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "calls"), where("participants", "array-contains", currentUser.uid), where("status", "==", "scheduled"));
        return onSnapshot(q, (snap) => {
            setScheduledCalls(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession)));
        });
    }, [currentUser]);

    const activeChat = isGlobal 
        ? (globalChats.find(c => c.id === activeGlobalChatId) || globalChats[0])
        : null;

    const history = isGlobal 
        ? (activeChat?.history || [])
        : (chatHistory || []);
    
    const memoizedHistory = useMemo(() => history, [history]);

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const used = userUsage?.counters?.daily_chat_count || 0;
    const pending = limit >= 999999 ? 999999 : Math.max(0, limit - used);
    const storageLimitBytes = ((planConfig.limits as any).storage_gb || 1) * 1024 * 1024 * 1024;
    const storageUsedBytes = userUsage?.counters?.current_storage_bytes || 0;
    const storageRemainingBytes = Math.max(0, storageLimitBytes - storageUsedBytes);
    const recentChatMemory = useMemo(() => {
        return (globalChats || [])
            .filter(c => c.id !== activeGlobalChatId && c.history?.length)
            .slice(0, 5)
            .map(c => ({
                chat: c.name,
                updatedAt: c.updatedAt,
                lastMessages: c.history.slice(-3).map(m => ({ role: m.role, text: (m.text || '').slice(0, 450) }))
            }));
    }, [globalChats, activeGlobalChatId]);

    useEffect(() => {
        if (startupPrompt && isGlobal) {
            const promptToExecute = startupPrompt;
            setStartupPrompt(null);
            handleSend(promptToExecute);
        }
    }, [startupPrompt, isGlobal]);

    const saveToDatabase = async (newHistory: ChatMessage[]) => {
        if (!currentUser) return;
        try {
            const sanitizedHistory = JSON.parse(JSON.stringify(newHistory.filter(m => !m.isLoading).map(m => {
                const cleanMsg = { ...m };
                if (cleanMsg.files) {
                    cleanMsg.files = cleanMsg.files.map(f => {
                        const { base64Data, ...rest } = f;
                        return rest;
                    });
                }
                if (cleanMsg.artifacts) {
                    cleanMsg.artifacts = cleanMsg.artifacts.map(a => {
                        if (a.downloadUrl?.startsWith('data:')) {
                            const { downloadUrl, ...rest } = a;
                            return { ...rest, downloadUrl: '#base64_removed' };
                        }
                        return a;
                    });
                }
                return cleanMsg;
            }), (key, value) => value === undefined ? null : value));

            if (isGlobal && activeGlobalChatId) {
                const chatRef = doc(db, `users/${currentUser.uid}/globalChats`, activeGlobalChatId);
                const updateData = JSON.parse(JSON.stringify({ 
                    history: sanitizedHistory, 
                    updatedAt: new Date().toISOString() 
                }, (key, value) => value === undefined ? null : value));
                await setDoc(chatRef, updateData, { merge: true });
            } else if (!isGlobal && projectContext) {
                const projectRef = doc(db, "projects", projectContext.id);
                const updatedProjectChats = (projectContext.chats || []).map(c => {
                    return { ...c, history: sanitizedHistory };
                });
                await updateDoc(projectRef, { chats: updatedProjectChats });
            }
        } catch (e) { 
            console.error("Fallo al guardar historial sanetizado", e); 
        }
    };

    const scrollToBottom = (force = false) => {
        const container = messagesContainerRef.current;
        if (container && (shouldAutoScrollRef.current || force)) {
            container.scrollTop = container.scrollHeight;
        }
    };

    const handleScroll = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        shouldAutoScrollRef.current = nearBottom;
        setIsAtBottom(nearBottom);
    };

    useEffect(() => {
        if (shouldAutoScrollRef.current) {
            scrollToBottom();
        }
    }, [memoizedHistory.length, isLoading]);

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const blob = items[i].getAsFile();
                if (blob) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const url = event.target?.result as string;
                        const base64 = url.split(',')[1] || '';
                        const approxSize = Math.floor(base64.length * 0.75);
                        if (approxSize > storageRemainingBytes) {
                            setToastNotification({ title: "Espacio insuficiente", message: "La captura supera tu espacio disponible de Drive.", icon: "lock", onClick: () => setProModalOpen(true) });
                            return;
                        }
                        if (attachedFiles.length < 5) {
                            setAttachedFiles(prev => [...prev, { 
                                name: `Pasted_Image_${Date.now()}.png`, 
                                type: 'image/png', 
                                url, 
                                base64Data: base64,
                                size: approxSize
                            } as any]);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []) as File[];
        let pendingBytes = attachedFiles.reduce((sum, f: any) => sum + (f.size || (f.base64Data ? Math.floor(f.base64Data.length * 0.75) : 0)), 0);
        selectedFiles.forEach((file: File) => {
            if (attachedFiles.length >= 5) return;
            if (file.size + pendingBytes > storageRemainingBytes) {
                setToastNotification({
                    title: "Espacio insuficiente",
                    message: "Este archivo supera el espacio disponible de tu Drive. Libera espacio o sube de plan.",
                    icon: "lock",
                    onClick: () => setProModalOpen(true)
                });
                return;
            }
            pendingBytes += file.size;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const url = ev.target?.result as string;
                setAttachedFiles(prev => {
                    if (prev.length >= 5) return prev;
                    return [...prev, { name: file.name, type: file.type, url, base64Data: url.split(',')[1], size: file.size } as any];
                });
            }
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeFile = (index: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleStartEdit = (msg: ChatMessage) => {
        setEditingMessageId(msg.id);
        setEditInput(msg.text);
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setEditInput('');
    };

    const saveEdit = async (msgId: string) => {
        const msgIdx = history.findIndex(m => m.id === msgId);
        if (msgIdx === -1) return;
        const newHistory = history.slice(0, msgIdx);
        const editedMsg = { ...history[msgIdx], text: editInput };
        setEditingMessageId(null);
        setEditInput('');
        await handleSend(editInput, editedMsg.files, newHistory);
    };

    const toggleRealPiP = async () => {
        if (pipWindow) { pipWindow.close(); return; }
        
        // Blindaje para móviles - documentPictureInPicture es experimental de escritorio
        if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) {
            return;
        }

        try {
            const pip = await (window as any).documentPictureInPicture.requestWindow({ width: 380, height: 600 });
            [...document.styleSheets].forEach((styleSheet) => {
                try {
                    const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pip.document.head.appendChild(style);
                } catch (e) {
                    const link = document.createElement('link');
                    if (styleSheet.href) { link.rel = 'stylesheet'; link.href = styleSheet.href; pip.document.head.appendChild(link); }
                }
            });
            pip.addEventListener('pagehide', () => { setPipWindow(null); setIsScreenSharingGlobal(false); });
            setPipWindow(pip);
        } catch (e) { console.error("PiP error", e); }
    };

    const handleToggleScreenShare = async () => {
        if (isScreenSharingGlobal) { stopScreenSharing(); return; }
        const isBlocked = await checkLiveConversationLimit(0, 'video');
        if (isBlocked) return;
        
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            setToastNotification({ title: "No compatible", message: "Tu navegador no soporta compartir pantalla.", icon: "info" });
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" } as any, audio: false });
            screenStreamRef.current = stream; 
            setIsScreenSharingGlobal(true);
            sharingStartTimeRef.current = Date.now();
            await toggleRealPiP();
            const video = document.createElement('video'); 
            video.srcObject = stream; 
            video.play();
            const canvas = document.createElement('canvas'); 
            const ctx = canvas.getContext('2d');
            screenIntervalRef.current = window.setInterval(() => {
                if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
                    canvas.width = 1280; canvas.height = 720; 
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const snapshot = canvas.toDataURL('image/jpeg', 0.6); 
                    setScreenPreview(snapshot);
                }
            }, 2000); 
            stream.getTracks()[0].onended = stopScreenSharing;
        } catch (err) { console.error("Screen share error", err); }
    };

    const stopScreenSharing = async () => {
        if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
        if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
        if (pipWindow) pipWindow.close();
        if (sharingStartTimeRef.current) {
            const durationSeconds = (Date.now() - sharingStartTimeRef.current) / 1000;
            await checkLiveConversationLimit(durationSeconds, 'video');
            sharingStartTimeRef.current = null;
        }
        screenStreamRef.current = null; 
        setIsScreenSharingGlobal(false); 
        setScreenPreview(null);
    };

    const handleSend = async (textToSend: string, overrideFiles?: ChatMessage['files'], baseHistory?: ChatMessage[]) => {
        const filesToSend = overrideFiles || attachedFiles;
        if ((!textToSend.trim() && filesToSend.length === 0 && !isScreenSharingGlobal) || isLoading) return;
        
        // LIMIT CHECK
        const isBlocked = await checkQueryLimit();
        if (isBlocked) return;

        // --- ROUTER DETERMINISTICO ---
        const { detectActionIntent } = await import('../services/actionRouter');
        const intent = detectActionIntent(textToSend);

        setIsLoading(true);

        let finalFilesToSend = [...filesToSend];
        if (finalFilesToSend.length > 0 && currentUser) {
            const { uploadStringWithQuotaCheck, safeStoragePath } = await import('../services/storageQuotaService');
            const { doc, setDoc, arrayUnion } = await import('firebase/firestore');

            for (let i = 0; i < finalFilesToSend.length; i++) {
                const f = finalFilesToSend[i];
                if (f.url && f.url.startsWith('data:')) {
                    try {
                        const safeFileName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                        const { url: downloadUrl } = await uploadStringWithQuotaCheck({
                            userId: currentUser.uid,
                            data: f.base64Data || '',
                            format: 'base64',
                            sizeBytes: f.base64Data ? Math.floor(f.base64Data.length * 0.75) : 0,
                            path: safeStoragePath('drive', currentUser.uid, 'ai-chat', `${Date.now()}_${safeFileName}`),
                            metadata: { contentType: f.type || 'application/octet-stream' },
                            plan: userProfile?.plan
                        });
                        
                        finalFilesToSend[i] = { ...f, url: downloadUrl };

                        const driveFileId = `aichat-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                        const driveFile = {
                            id: driveFileId,
                            name: f.name,
                            url: downloadUrl,
                            type: f.type || 'application/octet-stream',
                            size: f.base64Data ? Math.floor(f.base64Data.length * 0.75) : 0,
                            date: new Date().toISOString(),
                            origin: 'Advanced Chat',
                            parentId: 'personal',
                            parentName: 'Personal',
                            isUnassigned: true
                        };
                        const driveSettingsRef = doc(db, 'users', currentUser.uid, 'settings', 'drive');
                        await setDoc(
                            driveSettingsRef,
                            { personalFiles: arrayUnion(driveFile), updatedAt: new Date().toISOString() },
                            { merge: true }
                        );
                    } catch (e) {
                        console.error('Failed to upload file to Drive during chat', e);
                    }
                }
            }
        }

        const userMsg: ChatMessage = { 
            id: `msg-u-${Date.now()}`, role: 'user', text: textToSend, 
            files: finalFilesToSend,
            ...(isScreenSharingGlobal && screenPreview && { imageUrl: screenPreview })
        };
        const currentHistory = [...(baseHistory || history), userMsg];
        if (isGlobal) {
            setGlobalChats(prev => prev.map(c => c.id === activeGlobalChatId ? { ...c, history: currentHistory } : c));
        } else if (setChatHistory) {
            setChatHistory(() => currentHistory);
        }
        setAttachedFiles([]); 
        
        let finalActionHistory: ChatMessage[] = currentHistory;

        if (intent && intent.type !== 'GENERATE_ARTIFACT') {
            const modelMsgId = `msg-m-${Date.now()}`;
            const appContext = {
                userProfile, projects, currentUser, allUsers, sendDirectMessage,
                createTask, addProject, updateProject, scheduleMeeting, setCurrentView,
                setToastNotification, emailAccounts, setMailDraft
            } as any;

            try {
                const results = await executeAssistantActions([{ ...intent.params, ACTION: intent.type }], appContext, activeGlobalChatId || 'global');
                const result = results[0];
                
                const modelMsg: ChatMessage = {
                    id: modelMsgId,
                    role: 'model',
                    text: result.success ? `✅ Acción ejecutada: ${result.message}` : `❌ Falló la acción: ${result.message}`,
                    actionResults: results.map(r => ({ type: r.actionType as any, success: r.success, message: r.message, data: r.data })),
                    isLoading: false
                };

                finalActionHistory = [...currentHistory, modelMsg];
                if (isGlobal) setGlobalChats(prev => prev.map(c => c.id === activeGlobalChatId ? { ...c, history: finalActionHistory } : c));
                else if (setChatHistory) setChatHistory(finalActionHistory);
                
                setIsLoading(false);
                await saveToDatabase(finalActionHistory);
                return;
            } catch (err) {
                console.error("[ACTION ROUTER] Execution failed:", err);
            }
        }

        const lowerText = textToSend.toLowerCase();
        const isInternalQuery = /mis? proyectos|mi agenda|calendario|mis? tareas|mi crm|mi perfil|mi cuenta|mis finanzas|mis? actividades|qué tengo para|mis datos|mails?|correos?/i.test(lowerText);
        const isExplicitSearch = /busca|investiga|google|internet|noticias|tendencias|web|enlace|link|quién es|qué pasó/i.test(lowerText);
        const needsSearch = /hoy|ahora|actual|noticia|precio|clima|evento|reciente/i.test(lowerText);
        
        const isGroundedRequest = isExplicitSearch || (needsSearch && !isInternalQuery);
        
        let groundingLimitReached = false;
        if (isGroundedRequest) {
            try {
                const blocked = await checkWebSearchLimit();
                if (blocked) groundingLimitReached = true;
            } catch (e: any) {
                if (e.code === "PLAN_LIMIT_REACHED") {
                    groundingLimitReached = true;
                }
            }
        }

        streamingBufferRef.current = ''; displayedTextRef.current = ''; isStreamingActiveRef.current = true;
        shouldAutoScrollRef.current = true;
        setTimeout(() => scrollToBottom(true), 30);
        try {
            let basePrompt = isGlobal ? 'Eres Shivo, la IA de élite de Goatify.' : `Asistiendo en proyecto ${projectContext?.name}`;
            
            const calendarContent = projects.flatMap(p => 
                p.folders.flatMap(f => 
                    f.tasks.filter(t => t.date).map(t => ({
                        tipo: 'TAREA/HITO',
                        titulo: t.title,
                        fecha: t.date,
                        hora: t.time || 'Sin hora',
                        proyecto: p.name,
                        estado: t.status
                    }))
                )
            );

            const systemInstruction = buildPersonalizedSystemInstruction(userProfile, basePrompt, { 
                projects, 
                leads: allLeads, 
                allUsers,
                accounts: emailAccounts,
                meetings: scheduledCalls.map(c => ({ tipo: 'REUNIÓN VIDEO', titulo: c.title, fecha: c.scheduledAt, id: c.id })),
                calendarContent,
                mailLists,
                mailContacts,
                recentChatMemory,
                storage: {
                    usedBytes: storageUsedBytes,
                    limitBytes: storageLimitBytes,
                    remainingBytes: storageRemainingBytes
                }
            }, language, isScreenSharingGlobal);

            const stream = await getAiChatResponseStream(currentHistory, { 
                systemInstruction, 
                language,
                userPlan: userProfile.plan,
                groundingLimitReached,
                isGroundedRequest
            });

            const modelMsgId = `msg-m-${Date.now()}`;
            if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
            typewriterIntervalRef.current = window.setInterval(() => {
                const cleanTarget = streamingBufferRef.current.replace(/<<<ACTION:[\s\S]*?(?:>>>|$)/g, '\n\n*⏳ Executing agent action...*').trim();
                if (displayedTextRef.current.length < cleanTarget.length) {
                    const stepSize = Math.ceil((cleanTarget.length - displayedTextRef.current.length) / 6) + 12;
                    displayedTextRef.current = cleanTarget.slice(0, displayedTextRef.current.length + stepSize);
                    const updateMsg = (h: ChatMessage[]) => {
                        const newH = [...h];
                        const idx = newH.findIndex(m => m.id === modelMsgId);
                        const msg = { id: modelMsgId, role: 'model' as const, text: displayedTextRef.current, isLoading: true };
                        if (idx > -1) newH[idx] = msg; else newH.push(msg);
                        return newH;
                    };
                    if (isGlobal) setGlobalChats(prev => prev.map(c => c.id === activeGlobalChatId ? { ...c, history: updateMsg(c.history) } : c));
                    else if (setChatHistory) setChatHistory(updateMsg);
                    if (shouldAutoScrollRef.current) scrollToBottom();
                } else if (!isStreamingActiveRef.current) {
                    clearInterval(typewriterIntervalRef.current!); 
                    finalizeResponse(modelMsgId, currentHistory);
                }
            }, 20);
            for await (const chunk of stream) { if (chunk.text) streamingBufferRef.current += chunk.text; }
            isStreamingActiveRef.current = false;
        } catch (error) { 
            console.error("[AdvancedChat] Stream failed:", error);
            setIsLoading(false); 
            isStreamingActiveRef.current = false; 
            if (typewriterIntervalRef.current) {
                clearInterval(typewriterIntervalRef.current);
                typewriterIntervalRef.current = null;
            }
            // Mostrar error en el chat de forma limpia
            const errorMsg: ChatMessage = { 
                id: `msg-err-${Date.now()}`, 
                role: 'model', 
                text: "❌ Hubo un error de conexión con la IA. Por favor, intenta de nuevo.", 
                isLoading: false 
            };
            if (isGlobal) {
                setGlobalChats(prev => prev.map(c => {
                    if (c.id === activeGlobalChatId) {
                        // Filtramos el mensaje que estaba cargando (si existe) y añadimos el error
                        const h = c.history.filter(m => !m.isLoading);
                        return { ...c, history: [...h, errorMsg] };
                    }
                    return c;
                }));
            } else if (setChatHistory) {
                setChatHistory(prev => [...prev.filter(m => !m.isLoading), errorMsg]);
            }
        }
    };

    const finalizeResponse = async (modelMessageId: string, currentHistory: ChatMessage[]) => {
        const fullRawText = streamingBufferRef.current;
        const actions = extractActions(fullRawText);
        
        let actionResults: any[] = [];
        let newArtifacts: any[] = [];

        if (actions.length > 0) {
            // EJECUTAR ACCIONES REALES
            const appContext = {
                userProfile, projects, currentUser, allUsers, sendDirectMessage,
                createTask, addProject, updateProject, scheduleMeeting, setCurrentView,
                setToastNotification, emailAccounts, setMailDraft
            } as any;

            const results = await executeAssistantActions(actions, appContext, activeGlobalChatId || 'project-context');
            
            actionResults = results
                .filter(r => !(r.actionType === 'GENERATE_ARTIFACT' && r.success))
                .map(r => ({
                    type: r.actionType,
                    success: r.success,
                    message: r.message,
                    data: r.data
                }));

            // Extraer artefactos generados exitosamente
            newArtifacts = results
                .filter(r => r.actionType === 'GENERATE_ARTIFACT' && r.success && r.data?.downloadUrl)
                .map(r => ({
                    id: r.data.id || `art-${Date.now()}`,
                    artifactId: r.data.artifactId,
                    name: r.data.name,
                    type: r.data.type,
                    downloadUrl: r.data.downloadUrl,
                    sizeBytes: r.data.sizeBytes,
                    content: r.data.content, // Añadir contenido para persistencia
                    driveSaved: r.data.driveSaved,
                    drivePath: r.data.drivePath,
                    primaryFormat: r.data.primaryFormat,
                    variants: r.data.variants
                }));
        }

        // Limpiar el texto de JSON ACTION
        let cleanText = cleanTextFromActions(fullRawText);
        
        // Protección: Si no hay nada, mostrar mensaje de error suave
        if (!cleanText.trim() && actionResults.length === 0 && newArtifacts.length === 0) {
            cleanText = "No recibí una respuesta válida del modelo. Intenta de nuevo.";
        }
        
        // Si hay resultados de listas (email/contactos), disparar interpretación automática LOCAL (sin handleSend)
        if (actionResults.some((r: any) => r.type === 'LIST_EMAILS' || r.type === 'LIST_CONTACTS')) {
            const listResult = actionResults.find((r: any) => r.type === 'LIST_EMAILS');
            if (listResult && listResult.data) {
                const emails = listResult.data;
                let summary = `\n\n📬 **Resumen de correos recientes (${emails.length} encontrados):**\n`;
                emails.slice(0, 10).forEach((e: any, idx: number) => {
                    const icon = e.important ? '🔥' : (e.read ? '✉️' : '🔵');
                    const adj = e.hasAttachments ? '📎' : '';
                    summary += `${idx + 1}. ${icon} **${e.from}**: ${e.subject} ${adj}\n   *${e.summary}*\n   _${e.date}_\n\n`;
                });
                
                if (cleanText.includes("Acción ejecutada") || !cleanText.trim()) {
                    cleanText = summary;
                } else {
                    cleanText += `\n---` + summary;
                }
            }
        }
        
        const finalModelMsg: ChatMessage = { 
            id: modelMessageId, 
            role: 'model', 
            text: cleanText, 
            isLoading: false,
            artifacts: newArtifacts,
            actionResults: actionResults
        };

        const finalHistory = [...currentHistory, finalModelMsg];
        if (isGlobal) setGlobalChats(prev => prev.map(c => c.id === activeGlobalChatId ? { ...c, history: finalHistory } : c));
        else if (setChatHistory) setChatHistory(() => finalHistory);
        
        setIsLoading(false); 
        await saveToDatabase(finalHistory);
    };

    const handleStartLiveAudio = () => {
        const chatId = isGlobal ? activeGlobalChatId : (projectContext?.chats?.[0]?.id || '');
        setLiveSessionContext({ chatId, projectId: projectContext?.id, isGlobal, history });
        setLiveSessionMode('audio');
    };

    const handleStartLiveVideo = () => {
        const chatId = isGlobal ? activeGlobalChatId : (projectContext?.chats?.[0]?.id || '');
        setLiveSessionContext({ chatId, projectId: projectContext?.id, isGlobal, history });
        setLiveSessionMode('video');
    };

    const handleSendToProject = async (artifact: any) => {
        if (projectContext) {
            await finalizeSendToProject(artifact, projectContext.id);
        } else {
            setAssigningArtifact(artifact);
            setAssignModalOpen(true);
        }
    };

    const finalizeSendToProject = async (artifact: any, pId: string) => {
        try {
            const project = projects.find(p => p.id === pId);
            if (!project) return;

            const newDoc = {
                id: `doc-${Date.now()}`,
                name: artifact.name,
                content: artifact.downloadUrl,
                url: artifact.downloadUrl,
                uploadedAt: new Date().toISOString(),
                size: artifact.sizeBytes || 0,
                fileType: artifact.type,
                primaryFormat: artifact.primaryFormat || artifact.type?.split('/')[1] || 'pdf',
                variants: artifact.variants || {},
                artifactId: artifact.artifactId || artifact.id,
                source: "Goatify Docs"
            };

            const projectRef = doc(db, "projects", pId);
            const updatedDocs = [...(project.documents || []), newDoc];
            await updateDoc(projectRef, { documents: updatedDocs });
            
            setToastNotification({ 
                title: "Guardado en Proyecto", 
                message: `"${artifact.name}" se guardó en documentos de ${project.name}`, 
                icon: "check" 
            });
            setAssignModalOpen(false);
            setAssigningArtifact(null);
        } catch (e) {
            console.error("Error saving to project", e);
            setToastNotification({ title: "Error", message: "No se pudo guardar en el proyecto", icon: "cloud-off" });
        }
    };

    const handleShortcutAction = (action: string) => {
        if (action === 'image') {
            setCurrentView('aiStudio');
            window.location.hash = 'aiStudio/mediaGenerator';
        } else if (action === 'presentation') {
            setCurrentView('aiStudio');
            window.location.hash = 'aiStudio/presentations';
        } else if (action === 'screen') {
            handleToggleScreenShare();
        }
    };

    const handleDriveFileSelect = (fileData: { name: string, url: string, type: string, base64Data: string }) => {
        setAttachedFiles(prev => [...prev, fileData]);
    };

    const renderChatContent = () => (
        <div className={`flex flex-col h-full bg-white dark:bg-[#080808] border border-neutral-200/70 dark:border-neutral-900 ${pipWindow ? 'w-full rounded-none' : 'rounded-[1.75rem] shadow-xl'} ${isInternalFullScreen ? 'fixed inset-0 z-[160000] !rounded-none border-none' : ''}`}>
             
            {/* Modal para asignar a proyecto */}
            <Modal isOpen={isAssignModalOpen} onClose={() => { setAssignModalOpen(false); setAssigningArtifact(null); }} title="Enviar a Proyecto">
                <div className="space-y-6 p-2">
                    <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest leading-relaxed">
                        Selecciona el proyecto donde deseas guardar este documento generado por Shivo.
                    </p>
                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {projects.map(p => (
                            <button
                                key={p.id}
                                onClick={() => assigningArtifact ? finalizeSendToProject(assigningArtifact, p.id) : null}
                                className="flex items-center gap-3 p-4 bg-neutral-100 dark:bg-neutral-800/50 hover:bg-brand-primary/10 hover:border-brand-primary/40 border border-transparent rounded-2xl transition-all text-left group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-white dark:bg-neutral-800 flex items-center justify-center shadow-sm group-hover:bg-brand-primary group-hover:text-white transition-colors">
                                    <Icon name="folder" className="w-5 h-5"/>
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-tight">{p.name}</h4>
                                    <p className="text-[10px] font-bold text-neutral-500 mt-0.5">{p.documents?.length || 0} Documentos</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isToolsDrawerOpen} onClose={() => setIsToolsDrawerOpen(false)} title="Herramientas del Chat" className="max-w-3xl">
                <div className="space-y-5">
                    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                        <PlanCreditBadge showStorage />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button onClick={() => { setCurrentView('projects'); setIsToolsDrawerOpen(false); }} className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-primary text-left transition-all"><Icon name="projects" className="w-5 h-5 text-brand-primary mb-2"/><p className="text-[10px] font-black uppercase">Proyectos</p><p className="text-[9px] text-neutral-400">{projects.length} activos</p></button>
                        <button onClick={() => { setCurrentView('globalCalendar'); setIsToolsDrawerOpen(false); }} className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-primary text-left transition-all"><Icon name="calendar" className="w-5 h-5 text-brand-primary mb-2"/><p className="text-[10px] font-black uppercase">Calendario</p><p className="text-[9px] text-neutral-400">Agenda y tareas</p></button>
                        <button onClick={() => { setCurrentView('drive'); setIsToolsDrawerOpen(false); }} className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-primary text-left transition-all"><Icon name="folder" className="w-5 h-5 text-brand-primary mb-2"/><p className="text-[10px] font-black uppercase">Drive</p><p className="text-[9px] text-neutral-400">Archivos</p></button>
                        <button onClick={() => { setIsCapabilitiesModalOpen(true); setIsToolsDrawerOpen(false); }} className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-primary text-left transition-all"><Icon name="help" className="w-5 h-5 text-brand-primary mb-2"/><p className="text-[10px] font-black uppercase">Manual</p><p className="text-[9px] text-neutral-400">Comandos</p></button>
                    </div>
                    <div className="rounded-3xl bg-brand-primary/5 border border-brand-primary/10 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-primary">Memoria contextual</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">El chat usa contexto del mismo usuario, proyecto activo, agenda, Drive y conversaciones recientes sin mezclar datos de otros usuarios. Todo sigue guardado como antes; solo limpiamos la interfaz.</p>
                    </div>
                </div>
            </Modal>

             <div className="px-3 sm:px-5 py-3 border-b border-neutral-200/70 dark:border-neutral-900 flex items-center justify-between gap-3 bg-white/95 dark:bg-[#080808]/95 backdrop-blur-2xl z-50">
                    <div className="flex items-center gap-3 min-w-0">
                         <div className="w-9 h-9 rounded-full bg-neutral-900 dark:bg-white flex items-center justify-center text-white dark:text-neutral-900 shadow-sm flex-shrink-0">
                             <Icon name="ai" className="w-5 h-5" />
                         </div>
                         <div className="min-w-0 flex flex-col">
                            {isGlobal ? (
                                <select value={activeGlobalChatId} onChange={e => setActiveGlobalChatId(e.target.value)} className="bg-transparent font-black text-neutral-900 dark:text-white focus:ring-0 cursor-pointer p-0 border-none leading-none text-sm sm:text-base truncate max-w-[180px] sm:max-w-[280px]">
                                    {globalChats.map(chat => <option key={chat.id} value={chat.id}>{chat.name}</option>)}
                                </select>
                            ) : <h3 className="font-black text-neutral-900 dark:text-white tracking-tight truncate max-w-[220px]">Agente IA</h3>}
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`flex h-1.5 w-1.5 rounded-full flex-shrink-0 ${isScreenSharingGlobal ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest truncate">{isScreenSharingGlobal ? 'viendo pantalla' : 'listo'}</span>
                            </div>
                         </div>
                    </div>

                    <div className="hidden lg:flex flex-1 justify-center px-2 pointer-events-none">
                        <PlanCreditBadge compact className="max-w-fit pointer-events-auto" />
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!isScreenSharingGlobal && (
                            <>
                                <button onClick={addNewGlobalChat} className="p-2 text-neutral-500 hover:text-brand-primary hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full transition-colors" title="Nuevo Chat"><Icon name="plus" className="w-5 h-5"/></button>
                                <button onClick={() => setAssignModalOpen(true)} className="hidden sm:flex p-2 text-neutral-500 hover:text-brand-primary hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-full transition-colors" title="Asignar Proyecto"><Icon name="projects" className="w-5 h-5"/></button>
                                <button onClick={() => isGlobal && deleteGlobalChat(activeGlobalChatId)} className="hidden sm:flex p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors" title="Borrar Chat"><Icon name="trash" className="w-5 h-5"/></button>
                            </>
                        )}
                        <button onClick={handleToggleScreenShare} className={`p-2 rounded-full transition-all flex-shrink-0 ${isScreenSharingGlobal ? 'bg-red-600 text-white animate-pulse' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'}`} title="Compartir / analizar pantalla">
                            <Icon name="monitor" className="w-5 h-5"/>
                        </button>
                        <button onClick={() => setIsToolsDrawerOpen(true)} className="p-2 rounded-full text-neutral-500 hover:text-brand-primary hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-all" title="Herramientas">
                            <Icon name="settings" className="w-5 h-5"/>
                        </button>
                        <button onClick={() => setIsInternalFullScreen(!isInternalFullScreen)} className={`p-2 rounded-full transition-all flex-shrink-0 ${isInternalFullScreen ? 'bg-brand-primary text-white' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900'}`} title="Pantalla Completa">
                            <Icon name={isInternalFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                        </button>
                    </div>
                </div>

                <div className="hidden md:flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-[#080808] border-b border-neutral-100 dark:border-neutral-900 overflow-x-auto no-scrollbar">
                    <button onClick={() => projectContext && setSelectedProjectId(projectContext.id)} className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 flex-shrink-0 hover:border-brand-primary hover:text-brand-primary transition-all">
                        {projectContext ? `Proyecto: ${projectContext.name}` : 'Chat global'}
                    </button>
                    <button onClick={() => setCurrentView('drive')} className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 flex-shrink-0 hover:border-brand-primary hover:text-brand-primary transition-all">Drive</button>
                    <button onClick={() => setCurrentView('globalCalendar')} className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 flex-shrink-0 hover:border-brand-primary hover:text-brand-primary transition-all">Calendario</button>
                    <button onClick={() => setIsCapabilitiesModalOpen(true)} className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 flex-shrink-0 hover:border-brand-primary hover:text-brand-primary transition-all">Manual</button>
                    {recentChatMemory.slice(0, 2).map(item => (
                        <button key={item.chat} onClick={() => setStartupPrompt(`Retoma contexto del chat ${item.chat} y ayúdame a seguir.`)} className="px-3 py-1.5 rounded-full bg-white dark:bg-neutral-950 text-neutral-400 text-[10px] font-bold border border-neutral-200 dark:border-neutral-800 flex-shrink-0 hover:border-brand-primary hover:text-brand-primary transition-all">{item.chat}</button>
                    ))}
                </div>

                <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 sm:px-6 py-6 custom-scrollbar bg-white dark:bg-[#080808] pb-32 lg:pb-6 relative">
                    <div className="w-full max-w-4xl mx-auto space-y-6">
                    <MessageList 
                        history={memoizedHistory}
                        isLoading={isLoading}
                        onStartEdit={handleStartEdit}
                        editingMessageId={editingMessageId}
                        editInput={editInput}
                        setEditInput={setEditInput}
                        saveEdit={saveEdit}
                        cancelEdit={cancelEdit} 
                        scrollToBottom={scrollToBottom}
                        onSendToProject={handleSendToProject}
                    />
                    </div>
                    {!isAtBottom && isLoading && (
                        <div className="sticky bottom-2 left-1/2 -translate-x-1/2 z-50">
                            <button 
                                onClick={() => scrollToBottom(true)}
                                className="bg-brand-primary text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase shadow-2xl flex items-center gap-2 border border-white/20 animate-bounce"
                            >
                                <Icon name="chevronDown" className="w-3 h-3" /> Nuevos Mensajes
                            </button>
                        </div>
                    )}
                    <div className="h-4 w-full"></div>
                </div>

                {/* BOTÓN DE MENÚ DE TEXTO BAJADO HASTA EL FINAL v12.5 - NO EXTRA PADDING */}
                <div className="flex-none px-3 sm:px-6 pb-4 pt-2 bg-white/95 dark:bg-[#080808]/95 backdrop-blur-2xl border-t border-neutral-100 dark:border-neutral-900 z-[150] sticky bottom-0 shadow-[0_-16px_48px_rgba(0,0,0,0.06)]">
                    <div className="w-full max-w-4xl mx-auto">
                        {attachedFiles.length > 0 && (
                            <div className="flex flex-wrap gap-3 mb-3 p-2.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl animate-subtle-slide-in-up shadow-sm">
                                {attachedFiles.map((file, idx) => (
                                    <div className="relative group/file" key={idx}>
                                        {file.type.startsWith('image/') ? (
                                            <img src={file.url} className="w-14 h-14 object-contain rounded-xl border border-white/20 shadow-md" alt="Preview" />
                                        ) : (
                                            <div className="w-14 h-14 bg-white dark:bg-neutral-800 rounded-xl flex items-center justify-center text-brand-primary border border-neutral-200 dark:border-neutral-700 shadow-sm">
                                                <Icon name="folder" className="w-6 h-6" />
                                            </div>
                                        )}
                                        <button onClick={() => removeFile(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-lg hover:bg-red-600 transition-all"><Icon name="close" className="w-3 h-3"/></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <MemoizedInputArea 
                            onSend={handleSend}
                            onFileChange={handleFileChange}
                            onPaste={handlePaste}
                            isScreenSharing={isScreenSharingGlobal}
                            isLoading={isLoading}
                            handleStartLiveAudio={handleStartLiveAudio}
                            handleStartLiveVideo={handleStartLiveVideo}
                            onShortcutAction={handleShortcutAction}
                            onOpenDrive={() => setIsDrivePickerOpen(true)}
                        />
                    </div>
                </div>
        </div>
    );

    // Render the simplified content if presenting in Picture-in-Picture
    if (pipWindow) {
        return createPortal(renderChatContent(), pipWindow.document.body);
    }

    // Main Component Return
    return (
        <div id="chat-advanced-wrapper" className="h-full w-full">
            <DriveFilePicker isOpen={isDrivePickerOpen} onClose={() => setIsDrivePickerOpen(false)} onSelect={handleDriveFileSelect} />
            
            <Modal isOpen={isAssignModalOpen} onClose={() => setAssignModalOpen(false)} title={t('assignToProject')}>
                <div className="space-y-4">
                    <p>Proyecto destino:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancelar</Button>
                        <Button 
                            onClick={() => { if(activeGlobalChatId) assignGlobalChatToProject(activeGlobalChatId, targetProjectId); setAssignModalOpen(false); }}>Guardar</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isCapabilitiesModalOpen} onClose={() => setIsCapabilitiesModalOpen(false)} title="Manual Maestro: Chat Avanzado Shivo IA" className="max-w-5xl">
                <div className="space-y-8 text-sm leading-relaxed overflow-y-auto max-h-[80vh] pr-2 custom-scrollbar p-1">
                    <div className="p-6 bg-brand-primary/5 border-l-4 border-brand-primary rounded-[2rem] shadow-sm">
                        <p className="font-black text-brand-primary text-xl uppercase tracking-tighter mb-2">Tu Centro de Mando Ejecutivo</p>
                        <p className="text-neutral-600 dark:text-neutral-400 font-medium">Shivo no es solo un chat; es una extensión de tu cerebro corporativo. Aquí tienes la tabla técnica de comandos y capacidades actuales para maximizar tu rentabilidad.</p>
                    </div>

                    <section className="space-y-4">
                        <h4 className="font-black text-neutral-900 dark:text-white uppercase tracking-widest text-xs border-b pb-2 flex items-center gap-2">
                            <Icon name="ai" className="w-4 h-4 text-brand-primary"/> Matriz de Capacidades y Comandos
                        </h4>
                        
                        <div className="overflow-hidden border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-xl">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-neutral-50 dark:bg-neutral-900">
                                    <tr>
                                        <th className="p-4 font-black uppercase text-[10px] tracking-widest text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">Módulo / Capacidad</th>
                                        <th className="p-4 font-black uppercase text-[10px] tracking-widest text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">Descripción Funcional</th>
                                        <th className="p-4 font-black uppercase text-[10px] tracking-widest text-brand-primary border-b border-neutral-200 dark:border-neutral-800 text-center">Ejemplo (Clic para ejecutar)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900 text-[11px] sm:text-xs">
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Agenda 360°</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Lee reuniones de Meet, hitos y tareas con fecha de TODOS tus proyectos activos para darte una visión total de tu tiempo.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleSend("Revisa mi agenda de hoy y dime mis actividades críticas."); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Revisa mi agenda hoy"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Gestión de Proyectos</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Crea proyectos completos con carpetas, hilos de trabajo y estructura IA desde cero. Puede añadir tareas y miembros.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleSend("Crea un proyecto para el lanzamiento de mi nueva app de fitness con carpetas de diseño y desarrollo."); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Crea un proyecto para X"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">CRM y Ventas</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Consulta el estado de tus prospectos, valor del pipeline y asignaciones comerciales en tiempo real.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleSend("¿Cuál es el estatus de mis prospectos en el CRM? ¿Quién requiere seguimiento urgente?"); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Estatus de prospectos"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">CFO e Inteligencia Financiera</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Audita buckets de ingresos/egresos y da veredictos sobre la salud de tus proyectos. Detecta fugas de capital.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleSend("Analiza mi salud financiera de mi proyecto principal."); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Analiza mis finanzas"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Visión HUD (Pantalla)</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Cuando compartes pantalla, Shivo analiza visualmente lo que ves para asistirte en código, diseño o textos.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleShortcutAction('screen'); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Analiza mi pantalla"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Generación Creativa 4K</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Genera imágenes artísticas o profesionales. Te lleva directo al generador y arranca la tarea automáticamente.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleShortcutAction('image'); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Crea una imagen"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Presentaciones Pro</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Genera presentaciones profesionales con slides inteligentes. Te lleva directo al constructor y arranca la tarea automáticamente.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleShortcutAction('presentation'); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "Crea una presentación"
                                            </button>
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-brand-primary/5 transition-colors">
                                        <td className="p-4 font-black text-neutral-800 dark:text-white uppercase">Email Inteligente</td>
                                        <td className="p-4 text-neutral-500 font-medium leading-relaxed">Lee, busca, envía y redacta correos de tus cuentas conectadas. Puede detectar correos nuevos del día y resumirlos.</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => { handleSend("¿Tengo correos nuevos hoy? Resúmelos."); setIsCapabilitiesModalOpen(false); }}
                                                className="w-full py-2 bg-brand-primary/5 hover:bg-brand-primary hover:text-white text-brand-primary font-black uppercase rounded-xl transition-all border border-brand-primary/20 text-[9px]"
                                            >
                                                "¿Tengo correos nuevos hoy?"
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="p-6 bg-neutral-900 text-white rounded-3xl relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/20 rounded-full blur-2xl"></div>
                            <h5 className="font-black text-brand-accent uppercase text-[10px] tracking-widest mb-3">Multimodalidad Pro</h5>
                            <ul className="space-y-2 text-xs font-medium text-neutral-300">
                                <li className="flex gap-2"><Icon name="check" className="w-3 h-3 text-green-500 flex-shrink-0"/> Lee y analiza archivos PDF subidos.</li>
                                <li className="flex gap-2"><Icon name="check" className="w-3 h-3 text-green-500 flex-shrink-0"/> Analiza imágenes adjuntas para extracción de datos.</li>
                                <li className="flex gap-2"><Icon name="check" className="w-3 h-3 text-green-500 flex-shrink-0"/> Traduce y sintetiza información técnica.</li>
                            </ul>
                        </div>
                        <div className="p-6 bg-brand-primary/10 rounded-3xl border border-brand-primary/20 flex justify-center text-center items-center">
                            <p className="text-brand-primary font-black uppercase text-[11px] mb-0 tracking-[0.2em]">Soporte Hands-Free por Voz y Video Activado</p>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-neutral-100 dark:border-neutral-800">
                        <Button onClick={() => setIsCapabilitiesModalOpen(false)} className="px-12 py-3 shadow-xl">Comprendido, Maestro</Button>
                    </div>
                </div>
            </Modal>

            <div className="h-full relative flex flex-col">
                {isInternalFullScreen ? createPortal(renderChatContent(), document.body) : renderChatContent()}
            </div>
        </div>
    );
};

export default AdvancedChat;