import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { db, auth, storage } from '../firebaseConfig';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, increment, arrayUnion, query, collection, where, getDocs, deleteDoc, addDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { AiAgentConfig, ChatMessage, AgentConversation } from '../types';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { getAiChatResponseStream, attemptNameExtraction, transcribeAudio } from '../services/geminiService';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import Textarea from './ui/Textarea';
import Button from './ui/Button';
import AgentCallOverlay from './AgentCallOverlay';
import { AppContext } from '../context/AppContext';
import { getPlanConfig } from '../types';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { consumeAgentOwnerFeature, releaseAgentOwnerFeature } from '../services/usageService';

interface AgentPublicPageProps {
    agentId: string; 
}

const loadingMessages = [
    "Iniciando Vendedor...",
    "Sincronizando protocolos...",
    "Casi listo..."
];

const PublicAgentCTA = () => (
    <div className="relative w-full z-50 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-t border-brand-primary/20 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 shadow-[0_-10px_40px_rgba(76,29,149,0.1)] transition-transform duration-500 animate-slide-in-up text-light-text-primary dark:text-dark-text-primary flex-none">
        <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 sm:h-3 sm:w-3 bg-brand-primary"></span>
            </span>
            <p className="text-[10px] sm:text-sm font-black text-center leading-tight uppercase">
                ¿Quieres un vendedor como este trabajando 24/7 para ti?
            </p>
        </div>
        
        <div className="flex gap-2 sm:gap-3 items-center flex-wrap justify-center font-black">
            <a href="https://wa.me/19125715145" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center bg-green-500 hover:bg-green-600 text-white w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all hover:scale-110 shadow-md">
                <Icon name="phone" className="w-5 h-5 sm:w-6 sm:h-6"/>
            </a>
            <a href="http://calendly.com/goatify/" target="_blank" rel="noopener noreferrer" className="bg-brand-primary hover:bg-brand-secondary text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs transition-all hover:scale-105 shadow-lg flex items-center gap-2 uppercase tracking-tighter">
                <Icon name="calendar" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> <span>AGENDAR DEMO</span>
            </a>
            <div className="h-5 w-px bg-neutral-300 dark:bg-neutral-700 mx-0.5 sm:mx-1"></div>
            <a href="https://ia.goatify.app" className="text-brand-primary hover:underline text-[10px] sm:text-xs transition-colors uppercase tracking-widest">
                INICIAR SESIÓN
            </a>
        </div>
    </div>
);

const AgentPublicPage: React.FC<AgentPublicPageProps> = ({ agentId }) => {
    const { setToastNotification, createNotification } = useContext(AppContext);
    const [agent, setAgent] = useState<AiAgentConfig | null>(null);
    const [ownerPlan, setOwnerPlan] = useState<string>('free');
    const [extraSlots, setExtraSlots] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [loadMsgIdx, setLoadMsgIdx] = useState(0);
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [userName, setUserName] = useState<string | null>(null);
    const [visitorId, setVisitorId] = useState<string | null>(null);
    const [isLiveActive, setIsLiveActive] = useState(false);
    
    const [isRecording, setIsRecording] = useState(false);
    const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [pendingFile, setPendingFile] = useState<{ file: File, previewUrl: string } | null>(null);

    const [currentFlowStepId, setCurrentFlowStepId] = useState<string | null>(null);
    const [isWaitingForInput, setIsWaitingForInput] = useState(false);
    const [automationPaused, setAutomationPaused] = useState(false);
    const [isFlowCompleted, setIsFlowCompleted] = useState(false);
    
    // CONTADOR DE TURNOS PARA SOLICITUD DE NOMBRE
    const [turnsSinceNameRequest, setTurnsSinceNameRequest] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const conversationRef = useRef<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    
    const isProcessingRef = useRef(false);
    const hasTriggeredFirstStep = useRef(false);

    const cleanAgentId = useMemo(() => {
        if (!agentId) return '';
        return agentId.trim().split('?')[0].split('#')[0].replace(/\/$/, '');
    }, [agentId]);

    useEffect(() => {
        if (!cleanAgentId) return;

        const vidKey = `goatify_vid_${cleanAgentId}`;
        let vid = localStorage.getItem(vidKey);
        if (!vid) {
            vid = `vis_${Math.random().toString(36).slice(2, 7)}_${Date.now()}`;
            localStorage.setItem(vidKey, vid);
        }
        setVisitorId(vid);

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try { await signInAnonymously(auth); } catch (err) { console.error("Anonym auth error", err); }
            }
        });

        const agentQuery = query(collection(db, 'agents'), where('name', '==', decodeURIComponent(cleanAgentId)));
        const unsubAgent = onSnapshot(agentQuery, async (querySnap) => {
            if (!querySnap.empty) {
                const docSnap = querySnap.docs[0];
                const data = { id: docSnap.id, ...docSnap.data() } as AiAgentConfig;
                setAgent(data);
                document.title = `${data.name.replace(' (Avanzado)', '')} | Vendedor de Élite`;
                
                const ownerSnap = await getDoc(doc(db, 'users', data.ownerId));
                if (ownerSnap.exists()) {
                    const ownerData = ownerSnap.data();
                    setOwnerPlan(ownerData.plan || 'free');
                    setExtraSlots(ownerData.extraAgentsPurchased || 0);
                }
                setLoading(false); 
            } else {
                // Fallback to ID query if name not found
                const agentDocRef = doc(db, 'agents', cleanAgentId);
                const docSnap = await getDoc(agentDocRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data() } as AiAgentConfig;
                    setAgent(data);
                    document.title = `${data.name.replace(' (Avanzado)', '')} | Vendedor de Élite`;
                    
                    const ownerSnap = await getDoc(doc(db, 'users', data.ownerId));
                    if (ownerSnap.exists()) {
                        const ownerData = ownerSnap.data();
                        setOwnerPlan(ownerData.plan || 'free');
                        setExtraSlots(ownerData.extraAgentsPurchased || 0);
                    }
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            }
        });

        return () => unsubAgent();
    }, [cleanAgentId]);

    useEffect(() => {
        if (!visitorId || !agent) return;
        
        const convoId = `public_${agent.id}_${visitorId}`;
        const convoRef = doc(db, 'agentConversations', convoId);
        conversationRef.current = convoRef;

        const unsub = onSnapshot(convoRef, async (snap) => {
            if (snap.exists()) {
                const data = snap.data() as AgentConversation;

                // REINICIO AUTOMÁTICO SI LA VERSIÓN DEL AGENTE CAMBIÓ
                if (agent.updatedAt && data.agentVersion !== agent.updatedAt) {
                    console.log("Detectada nueva versión del agente. Reiniciando conversación...");
                    await updateDoc(convoRef, {
                        history: [],
                        agentVersion: agent.updatedAt,
                        currentFlowStepId: agent.flow?.startStepId || null,
                        status: 'active',
                        isFlowCompleted: false,
                        automationPaused: false,
                        lastActivity: new Date().toISOString()
                    });
                    // El snapshot se disparará de nuevo con los datos limpios
                    return;
                }

                setHistory(data.history || []);
                setAutomationPaused(!!data.automationPaused);
                setIsFlowCompleted(!!data.isFlowCompleted);
                
                // ACTUALIZACIÓN REACTIVA E INMEDIATA DEL NOMBRE
                if (data.userName !== userName) {
                    setUserName(data.userName);
                }
                
                if (data.currentFlowStepId !== undefined) setCurrentFlowStepId(data.currentFlowStepId);
                const status = data.status || 'active';
                setIsWaitingForInput(status === 'waiting_for_input');
                
                if (agent.mode === 'advanced' && agent.flow && !data.automationPaused && !isProcessingRef.current && !data.isFlowCompleted) {
                    if (data.history.length === 0 && !hasTriggeredFirstStep.current) {
                        hasTriggeredFirstStep.current = true;
                        executeFlowSequence(agent.flow.startStepId);
                    } else if (status === 'active' && data.history.length > 0 && data.history[data.history.length-1].role === 'user') {
                        executeFlowSequence(data.currentFlowStepId || agent.flow.startStepId);
                    }
                }
            } else {
                const initialData = {
                    history: [], agentId: agent.id, agentName: agent.name, ownerId: agent.ownerId, userId: visitorId,
                    lastActivity: new Date().toISOString(), deletedBy: [], 
                    currentFlowStepId: agent.flow?.startStepId || null, 
                    status: 'active',
                    agentVersion: agent.updatedAt || 'initial', automationPaused: false, userName: null, isFlowCompleted: false
                };
                await setDoc(convoRef, initialData).catch(e => console.warn("Esperando auth..."));
                if (agent.mode === 'advanced' && agent.flow && !hasTriggeredFirstStep.current) {
                    hasTriggeredFirstStep.current = true;
                    executeFlowSequence(agent.flow.startStepId);
                }
            }
        });
        return () => unsub();
    }, [visitorId, agent?.id, agent?.updatedAt]); 

    const executeFlowSequence = async (stepId: string) => {
        if (!agent?.flow || isProcessingRef.current || !conversationRef.current) return;
        isProcessingRef.current = true;
        setIsThinking(true);
        try {
            let nextId: string | null = stepId;
            while (nextId && nextId !== 'AI_HANDOFF') {
                const step = agent.flow.steps.find(s => s.id === nextId);
                if (!step) break;

                if (step.type === 'TEXT' || step.type === 'IMAGE') {
                    const msgPayload: ChatMessage = { id: `step-${step.id}-${Date.now()}`, role: 'model', text: step.message || "", timestamp: new Date().toISOString() };
                    if (step.mediaUrl) {
                        msgPayload.file = { name: 'Archivo', type: step.mediaType || 'image/png', url: step.mediaUrl, base64Data: '' };
                        if (step.mediaType?.startsWith('image/')) msgPayload.imageUrl = step.mediaUrl;
                    }
                    
                    const hasOptions = step.options && step.options.length > 0;
                    const nextStepInFlow = step.nextStepId || 'AI_HANDOFF';

                    await updateDoc(conversationRef.current, { 
                        history: arrayUnion(msgPayload), 
                        lastActivity: new Date().toISOString(),
                        currentFlowStepId: (hasOptions || !!step.waitForInput) ? nextId : nextStepInFlow,
                        status: (hasOptions || !!step.waitForInput) ? 'waiting_for_input' : 'active'
                    });

                    if (hasOptions || !!step.waitForInput) { nextId = null; } 
                    else { nextId = nextStepInFlow; await new Promise(r => setTimeout(r, 600)); }
                } 
                else if (step.type === 'AI_RESPONSE') {
                    await generateStandardResponse(step.message);
                    if (step.waitForInput) { nextId = null; await updateDoc(conversationRef.current, { status: 'waiting_for_input' }); } 
                    else { nextId = step.nextStepId || 'AI_HANDOFF'; await new Promise(r => setTimeout(r, 600)); }
                } else { break; }
            }
            if (nextId === 'AI_HANDOFF') {
                await updateDoc(conversationRef.current, { isFlowCompleted: true, status: 'completed' });
                setIsFlowCompleted(true);
            }
        } catch (e) { console.error("Error en motor de flujo:", e); } 
        finally { setIsThinking(false); isProcessingRef.current = false; }
    };

    const generateStandardResponse = async (stepInstruction?: string) => {
        try {
            if (agent) {
                const ownerRef = doc(db, 'users', agent.ownerId);
                const ownerSnap = await getDoc(ownerRef);
                if (ownerSnap.exists()) {
                    try {
                        await consumeAgentOwnerFeature(agent.ownerId, agent.id, 'agent_response', 1, { action: 'public_agent_response' });
                        await consumeAgentOwnerFeature(agent.ownerId, agent.id, 'ai_chat', 1, { action: 'public_agent_ai_chat' });
                    } catch (limitError) {
                        await updateDoc(conversationRef.current, { 
                            history: arrayUnion({ id: `limit-${Date.now()}`, role: 'model', text: "Lo sentimos, este vendedor ha superado su límite. Intenta más tarde.", timestamp: new Date().toISOString() }), 
                            automationPaused: true 
                        });
                        return;
                    }
                }
            }

            const snap = await getDoc(conversationRef.current);
            const currentHistory = (snap.data() as any)?.history || [];
            let sysInstr = `SANDBOX_AGENT_MODE\n\nIDENTIDAD: Eres el asistente oficial de esta marca. personalidad: ${agent?.persona || ""}`;
            
            if (currentHistory[currentHistory.length - 1]?.text.includes('🎙️ **Resumen')) {
                sysInstr += `\n\nRECIBISTE UNA TRANSCRIPCIÓN DE LLAMADA. Di que has entendido y pregunta cómo seguir.`;
            } else {
                if (userName) sysInstr += `\n\nEl cliente se llama ${userName}. Trátalo por su nombre.`;
                else if (turnsSinceNameRequest >= 2) {
                    // CADA 3 TURNOS (0, 1, 2) SOLICITA EL NOMBRE
                    sysInstr += `\n\nREGLA: Solicita cordialmente el nombre del usuario al final de tu respuesta.`;
                    setTurnsSinceNameRequest(0);
                }
                if (stepInstruction) sysInstr += `\n\nInstrucción de flujo actual: ${stepInstruction}`;
            }

            const modelToUse = 'gemini-3-flash-preview';
            const stream = await getAiChatResponseStream(currentHistory, { 
                forAgent: true, systemInstruction: sysInstr, modelOverride: modelToUse, billingUserId: agent?.ownerId, userPlan: ownerPlan 
            });
            
            let fullText = '';
            const msgId = `model-${Date.now()}`;
            setHistory(prev => [...prev, { id: msgId, role: 'model', text: '', isLoading: true, timestamp: new Date().toISOString() }]);
            
            for await (const chunk of stream) {
                if (chunk.text) {
                    fullText += chunk.text;
                    setHistory(prev => prev.map(m => m.id === msgId ? { ...m, text: fullText.replace(/<<<ACTION:[\s\S]*?(?:>>>|$)/g, '\n\n*⏳ Procesando acción...*').trim(), isLoading: false } : m));
                }
            }
            
            const finalMsg = { id: msgId, role: 'model', text: fullText.replace(/<<<ACTION:[\s\S]*?>>>/g, '').trim(), timestamp: new Date().toISOString(), isLoading: false };
            await updateDoc(conversationRef.current, { history: arrayUnion(finalMsg), lastActivity: new Date().toISOString(), status: isFlowCompleted ? 'completed' : 'waiting_for_input' });
            await updateDoc(doc(db, 'agents', agent!.id), { responseCount: increment(1) });
            
            // Cobro del owner ya pasó por Cloud Run antes de generar la respuesta.
        } catch(e) { 
            console.error("Error en respuesta IA:", e);
            setHistory(prev => [...prev, { id: `err-${Date.now()}`, role: 'model', text: "⚠️ Lo siento, hubo un error técnico. Por favor intenta de nuevo.", timestamp: new Date().toISOString() }]);
        } 
        finally { textareaRef.current?.focus(); }
    };

    const handleSend = async (overrideText?: string, attachment?: any) => {
        const textToSend = overrideText || input;
        const finalFile = attachment || (pendingFile ? { 
            name: pendingFile.file.name, type: pendingFile.file.type, url: pendingFile.previewUrl, base64Data: pendingFile.previewUrl.split(',')[1] 
        } : null);

        if ((!textToSend.trim() && !finalFile) || isThinking || !agent) return;
        
        const refConvo = conversationRef.current;
        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`, role: 'user', text: textToSend, timestamp: new Date().toISOString(),
            ...(finalFile && { file: finalFile, ...(finalFile.type.startsWith('image/') && { imageUrl: finalFile.url }), ...(finalFile.type.startsWith('audio/') && { audioUrl: finalFile.url }) })
        };
        
        // ENVÍO INSTANTÁNEO EN LA UI
        setHistory(prev => [...prev, userMsg]);
        setInput(''); setVoicePreviewUrl(null); setVoiceBlob(null); setRecordingDuration(0); setPendingFile(null); 
        setIsThinking(true);

        if (agent && (history.length === 0 || history[history.length - 1].role === 'model')) {
            createNotification(agent.ownerId, {
                type: 'agent_message', text: `💬 **Nuevo Mensaje**: Un cliente interactuando con **${agent.name}**.`,
                link: `/#hub/messages/public_${agent.id}_${visitorId}`, fromUser: { uid: 'visitor', name: userName || 'Visitante', avatarUrl: null }
            });
        }
        
        // PROCESAMIENTO ASÍNCRONO SIN BLOQUEAR UI
        (async () => {
            if (textToSend.trim()) {
                try {
                    const res = await attemptNameExtraction(textToSend, agent.persona);
                    // SI DETECTA UN NOMBRE NUEVO O CORREGIDO, SE ACTUALIZA AL INSTANTE
                    if (res && res.name && res.name.toLowerCase() !== 'null' && res.name !== userName) { 
                        setUserName(res.name); 
                        await updateDoc(refConvo, { userName: res.name }); 
                    } else if (!userName) {
                        setTurnsSinceNameRequest(prev => prev + 1);
                    }
                } catch (e) { 
                    if (!userName) setTurnsSinceNameRequest(prev => prev + 1);
                }
            }
            
            let nextStepToSet = currentFlowStepId;
            const currentStepObj = agent.flow?.steps.find(s => s.id === currentFlowStepId);
            if (currentStepObj && currentStepObj.waitForInput && (!currentStepObj.options || currentStepObj.options.length === 0)) {
                nextStepToSet = currentStepObj.nextStepId || 'AI_HANDOFF';
            }
            
            await updateDoc(refConvo, { 
                history: arrayUnion(userMsg), lastActivity: new Date().toISOString(), currentFlowStepId: nextStepToSet, status: isFlowCompleted ? 'completed' : 'active' 
            });

            // FIX: Ensure basic agents (no flow) or completed flows ALWAYS trigger a response unless paused
            const shouldRespond = !automationPaused && ((agent.mode === 'basic') || isFlowCompleted);
            
            if (shouldRespond) { 
                await generateStandardResponse(); 
                setIsThinking(false); 
            } else { 
                setIsThinking(false); 
            }
        })();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) {
            const reader = new FileReader();
            reader.onload = (ev) => { setPendingFile({ file: f, previewUrl: ev.target?.result as string }); };
            reader.readAsDataURL(f);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const toggleRecording = async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const recorder = new MediaRecorder(stream);
                mediaRecorderRef.current = recorder;
                audioChunksRef.current = [];
                recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
                recorder.onstop = () => {
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    setVoiceBlob(blob);
                    setVoicePreviewUrl(URL.createObjectURL(blob));
                    stream.getTracks().forEach(track => track.stop());
                };
                recorder.start();
                setIsRecording(true);
                setRecordingDuration(0);
                timerRef.current = window.setInterval(() => setRecordingDuration(d => d + 1), 1000);
            } catch (e) { console.error("Mic access failed", e); }
        } else {
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
                setIsRecording(false);
                if (timerRef.current) clearInterval(timerRef.current);
            }
        }
    };

    const handleSendVoiceNote = async () => {
        if (!voiceBlob || !agent) return;
        setIsThinking(true);
        try {
            const transcription = await transcribeAudio(voiceBlob);
            const { url } = await uploadWithQuotaCheck({
                userId: agent.ownerId,
                data: voiceBlob,
                path: safeStoragePath('agent-voices', agent.ownerId, agent.id, `${Date.now()}.webm`),
                sizeBytes: voiceBlob.size,
                metadata: { contentType: 'audio/webm' }
            });
            await handleSend(`[Nota de voz]: ${transcription}`, { url, type: 'audio/webm', name: 'Nota de Voz' });
        } catch (e) { console.error("Voice note send failed", e); } 
        finally { setIsThinking(false); }
    };

    const handleOptionClick = async (nextStepId: string, label: string) => {
        if (isThinking || automationPaused) return;
        const refConvo = conversationRef.current;
        setHistory(prev => [...prev, { id: `opt-${Date.now()}`, role: 'user', text: label, timestamp: new Date().toISOString() }]);
        await updateDoc(refConvo, { 
            history: arrayUnion({ id: `opt-${Date.now()}`, role: 'user', text: label, timestamp: new Date().toISOString() }), 
            lastActivity: new Date().toISOString(), currentFlowStepId: nextStepId, status: 'active' 
        });
    };

    const handleLiveSessionEnd = async (transcript: string) => {
        if (transcript && transcript.trim()) {
            const msg: ChatMessage = { id: `live-${Date.now()}`, role: 'user', text: `🎙️ **Resumen voz**:\n\n${transcript}`, timestamp: new Date().toISOString() };
            setHistory(prev => [...prev, msg]);
            if (conversationRef.current) {
                try {
                    await updateDoc(conversationRef.current, { history: arrayUnion(msg), lastActivity: new Date().toISOString(), status: 'waiting_for_input' });
                    if (!automationPaused) { await generateStandardResponse(); }
                } catch (e) {}
            }
        }
        setIsLiveActive(false); 
    };

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, isThinking]);

    if (loading) return <div className="fixed inset-0 bg-neutral-100 dark:bg-black flex flex-col items-center justify-center"><Spinner text={loadingMessages[loadMsgIdx]} /></div>;
    if (!agent) return <div className="fixed inset-0 bg-neutral-100 dark:bg-black flex flex-col items-center justify-center p-8 text-center font-black"><Icon name="close" className="w-16 h-16 text-neutral-300 mb-4"/><p className="text-xl font-black">Vendedor no encontrado</p></div>;

    const currentStepObj = agent.mode === 'advanced' && currentFlowStepId ? agent.flow?.steps.find(s => s.id === currentFlowStepId) : null;
    const showOptions = isWaitingForInput && currentStepObj?.options && currentStepObj.options.length > 0 && !isThinking && !automationPaused;

    return (
        <div className="fixed inset-0 flex flex-col bg-neutral-100 dark:bg-black font-medium overflow-hidden">
            {isLiveActive && (
                <div className="fixed inset-0 z-[200000] bg-black">
                     <AgentCallOverlay 
                        agentId={agent.id} agentName={agent.name.replace(' (Avanzado)', '')} agentPersona={agent.persona}
                        agentAvatar={agent.avatarUrl || null} agentVoice={agent.voice} userName={userName}
                        onSessionEnd={handleLiveSessionEnd} ownerId={agent.ownerId} ownerPlan={ownerPlan}
                    /> 
                </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center p-0 min-h-0 relative">
                <div className="w-full h-full sm:max-w-[450px] bg-white dark:bg-dark-surface sm:shadow-2xl flex flex-col overflow-hidden relative border-x border-neutral-200 dark:border-neutral-800">
                    <div className={`flex-none p-4 text-white flex items-center justify-between z-10 shadow-md ${agent.whatsappStyle ? 'bg-[#075E54] dark:bg-[#1f2c34]' : 'bg-brand-primary'}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border-2 border-white/30 shadow-sm overflow-hidden">
                                {agent.avatarUrl ? <img src={agent.avatarUrl} alt="Vendedor" className="w-full h-full object-contain" /> : <Icon name="agent" className="w-6 h-6 text-white" />}
                            </div>
                            <div className="min-w-0">
                                <h1 className="font-black text-lg leading-tight truncate max-w-[140px] sm:max-w-[180px]">{agent.name.replace(' (Avanzado)', '')}</h1>
                                <p className="text-[10px] text-white/70 font-black uppercase tracking-wide truncate">
                                    {userName ? `CONVERSANDO CON ${userName}` : "EN LÍNEA"}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => setIsLiveActive(true)} className="px-4 py-2 rounded-full font-black text-[10px] sm:text-xs flex items-center gap-2 shadow-lg bg-gradient-to-r from-pink-500 to-red-500 text-white active:scale-95 transition-all uppercase tracking-tighter">
                            <Icon name="phone" className="w-4 h-4"/> 
                            <span>HABLAR EN VIVO</span>
                        </button>
                    </div>
                    <div className={`flex-1 overflow-y-auto p-0 relative min-h-0 ${agent.whatsappStyle ? 'bg-[#efeae2] dark:bg-[#0b141a] bg-opacity-100' : 'bg-neutral-50 dark:bg-neutral-900/50'}`}>
                        <div className="p-4 space-y-4 min-h-full flex flex-col justify-end">
                            {history.map((msg, idx) => (
                                <div key={msg.id || idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-subtle-slide-in-up`}>
                                    <div className={`relative max-w-[85%] px-4 py-3 shadow-sm text-[15px] leading-snug text-left ${
                                        msg.role === 'user' 
                                            ? (agent.whatsappStyle ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-white rounded-2xl rounded-tr-none' : 'bg-brand-primary text-white rounded-2xl rounded-br-none') 
                                            : (agent.whatsappStyle ? 'bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-2xl rounded-tl-none' : 'bg-white dark:bg-neutral-800 text-neutral-800 dark:text-white rounded-2xl rounded-bl-none')
                                    }`}>
                                        {msg.file && (
                                            <div className="mb-2 rounded-lg overflow-hidden bg-black/5 dark:bg-black/20" onClick={() => window.open(msg.file?.url, '_blank')}>
                                                {msg.file.type.startsWith('image/') ? ( <img src={msg.file.url} alt="Adjunto" className="w-full h-auto max-h-48 object-contain rounded-lg" /> ) : ( <div className="p-3 flex items-center gap-2 text-[15px] font-black text-white"><Icon name="folder" className="w-4 h-4 opacity-70"/><span className="truncate max-w-[150px]">{msg.file.name}</span></div> )}
                                            </div>
                                        )}
                                        {msg.audioUrl && ( <div className="mb-2 flex items-center gap-2 bg-black/10 dark:bg-white/10 p-1 rounded-xl"><Icon name="mic" className="w-4 h-4 text-white"/><audio src={msg.audioUrl} controls className="h-8 w-full max-w-[200px]" /></div> )}
                                        <div className={`text-[15px] leading-relaxed text-left pb-4`}><ChatMessageRenderer text={msg.text} className={msg.role === 'user' && !agent.whatsappStyle ? 'text-white' : ''} /></div>
                                        <div className={`absolute bottom-1.5 ${msg.role === 'user' ? 'right-3' : 'left-3'} text-[9px] opacity-60 font-black`}>
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isThinking && ( <div className="flex flex-col items-start animate-pulse"><div className={`shadow-sm px-4 py-3 ${agent.whatsappStyle ? 'bg-white dark:bg-[#202c33] rounded-2xl rounded-tl-none' : 'bg-white dark:bg-neutral-800 rounded-2xl rounded-bl-none'}`}><div className="flex gap-1.5 items-center h-5 px-1"><div className={`w-2 h-2 rounded-full animate-bounce ${agent.whatsappStyle ? 'bg-neutral-400' : 'bg-brand-primary'}`}></div><div className={`w-2 h-2 rounded-full animate-bounce delay-75 ${agent.whatsappStyle ? 'bg-neutral-400' : 'bg-brand-primary'}`}></div><div className={`w-2 h-2 rounded-full animate-bounce delay-150 ${agent.whatsappStyle ? 'bg-neutral-400' : 'bg-brand-primary'}`}></div></div></div></div> )}
                            {showOptions && (
                                <div className="flex flex-wrap gap-2 mt-2 justify-start animate-fade-in">
                                    {currentStepObj?.options.map(opt => (
                                        <button key={opt.id} onClick={() => handleOptionClick(opt.nextStepId, opt.label)} className="bg-white dark:bg-neutral-800 border-2 border-brand-primary text-brand-primary dark:text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-brand-primary hover:text-white transition-all shadow-sm">
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={`flex-none p-3 border-t z-20 ${agent.whatsappStyle ? 'bg-[#f0f2f5] dark:bg-[#202c33] border-none' : 'bg-white dark:bg-dark-surface border-neutral-200 dark:border-neutral-800'}`}>
                        <div className="max-w-md mx-auto flex items-end gap-2">
                            <div className={`flex-grow rounded-2xl p-1 flex items-center ${agent.whatsappStyle ? 'bg-white dark:bg-[#2a3942] rounded-3xl' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
                                <input type="file" min-h-0 ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-neutral-400 hover:text-brand-primary" title="Agregar Documentos"><Icon name="plus" className="w-6 h-6"/></button>
                                <Textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="Escribe un mensaje..." className={`!mt-0 w-full bg-transparent border-none focus:ring-0 text-[15px] py-3 resize-none ${agent.whatsappStyle ? 'dark:text-[#d1d7db]' : ''}`} rows={1} />
                            </div>
                            <div className="flex items-center">
                                {(input.trim() || voiceBlob || pendingFile) ? (
                                    <button onClick={() => handleSend()} disabled={isThinking} className={`p-3 text-white shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 ${agent.whatsappStyle ? 'bg-[#00a884] rounded-full w-12 h-12 flex justify-center items-center' : 'bg-brand-primary rounded-2xl'}`}>
                                        <Icon name={isThinking ? "sync" : "send"} className={`w-5 h-5 ${isThinking ? 'animate-spin' : ''} ${agent.whatsappStyle ? 'ml-1' : ''}`}/>
                                    </button>
                                ) : (
                                    <button onClick={toggleRecording} className={`flex flex-col items-center justify-center p-2 transition-all ${agent.whatsappStyle ? 'bg-[#00a884] rounded-full w-12 h-12 text-white' : 'rounded-xl ' + (isRecording ? 'text-red-500 animate-pulse bg-red-50 dark:bg-red-900/10' : 'text-neutral-400 hover:text-brand-primary')}`}>
                                        <Icon name={isRecording ? "stop" : "mic"} className="w-5 h-5"/>
                                        {!agent.whatsappStyle && <span className="text-[7px] font-black uppercase mt-0.5 whitespace-nowrap">{isRecording ? "DETENER" : "ENVIA VOZ"}</span>}
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {pendingFile && (
                            <div className="mt-2 flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 animate-slide-in-up">
                                <img src={pendingFile.previewUrl} className="w-10 h-10 object-contain rounded-lg" alt="Preview"/>
                                <span className="text-xs truncate flex-1 font-black uppercase">{pendingFile.file.name}</span>
                                <button onClick={() => setPendingFile(null)}><Icon name="close" className="w-4 h-4"/></button>
                            </div>
                        )}

                        {voicePreviewUrl && (
                            <div className="mt-2 flex items-center gap-2 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 animate-slide-in-up">
                                <Icon name="mic" className="w-4 h-4 text-brand-primary"/>
                                <audio src={voicePreviewUrl} controls className="h-8 flex-1" />
                                <button onClick={handleSendVoiceNote} className="p-2 bg-brand-primary text-white rounded-lg text-xs font-black uppercase">Enviar Voz</button>
                                <button onClick={() => { setVoicePreviewUrl(null); setVoiceBlob(null); }}><Icon name="close" className="w-4 h-4"/></button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <PublicAgentCTA />
        </div>
    );
};

export default AgentPublicPage;