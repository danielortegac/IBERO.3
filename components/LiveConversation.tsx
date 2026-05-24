
import React, { useState, useRef, useEffect, useContext } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Icon from './Icon';
import { startLiveSession, createPcmBlob, buildPersonalizedSystemInstruction } from '../services/geminiService';
import { AppContext } from '../context/AppContext';
import LinkRenderer from './ui/LinkRenderer';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, collection, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getPlanConfig, ChatMessage, TtsVoice, GlobalChat } from '../types';
import Button from './ui/Button';
import { searchWithPerplexity } from '../services/perplexityService';
import { consumeServerFeature } from '../services/usageService';

interface Transcript {
    id: string;
    speaker: 'user' | 'model';
    text: string;
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

type Status = 'idle' | 'connecting' | 'active' | 'error';

const StatusIndicator: React.FC<{status: Status, isModelSpeaking: boolean, isMuted: boolean, isVideo: boolean}> = ({status, isModelSpeaking, isMuted, isVideo}) => {
    if (status === 'error') return <p className="text-red-500 font-bold animate-pulse">Error de Conexión</p>;
    if (status === 'connecting') return <p className="text-light-text-secondary dark:text-dark-text-secondary animate-pulse">Sincronizando vendedor...</p>;
    if (status === 'active') {
        if (isModelSpeaking && !isMuted) return <p className="text-brand-primary animate-pulse font-bold">Respondiendo...</p>;
        return <p className="text-green-500 font-bold">{isVideo ? "Viendo entorno..." : "Escuchando..."}</p>;
    }
    return null;
};

interface LiveConversationProps {
    autoStart?: boolean;
    systemInstruction?: string;
    userName?: string | null;
    onSessionEnd?: (transcript: string) => void;
    agentId?: string; 
    isVideoModeInitial?: boolean;
}

const LiveConversation: React.FC<LiveConversationProps> = ({ autoStart, systemInstruction, userName, onSessionEnd, agentId, isVideoModeInitial = false }) => {
    const { t } = useTranslation();
    const { 
        userProfile, 
        checkLiveConversationLimit, 
        setIsLiveSessionActive, 
        registerLiveSession, 
        userUsage, 
        setProModalOpen, 
        setToastNotification, 
        projects,
        createTask,
        addProject,
        setLiveSessionMode,
        setLiveSessionContext,
        liveSessionContext,
        allLeads,
        allUsers,
        language,
        setActiveGlobalChatId,
        currentUser,
        checkAndConsumeLimit,
        mailLists,
        mailContacts,
        setMailDraft,
        setCurrentView,
        emailAccounts
    } = useContext(AppContext);
    
    const [status, setStatus] = useState<Status>('idle');
    const [selectedVoice, setSelectedVoice] = useState<TtsVoice>('Zephyr');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isModelSpeaking, setIsModelSpeaking] = useState(false);
    const [isVideoMode, setIsVideoMode] = useState(isVideoModeInitial);
    const isVideoModeRef = useRef(isVideoModeInitial);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    const transcriptsRef = useRef<Transcript[]>([]);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoIntervalRef = useRef<number | null>(null);
    
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const isMicMutedRef = useRef(isMicMuted);
    const sessionStartTimeRef = useRef<number | null>(null);
    const turnCompleteRef = useRef(false);
    const hasBilledSessionRef = useRef(false);

    const INACTIVITY_TIMEOUT = 10000; // 10 SEGUNDOS ESTRICTOS SIN INTERACCIÓN

    useEffect(() => { isVideoModeRef.current = isVideoMode; }, [isVideoMode]);

    useEffect(() => {
        if (autoStart) {
            startSession(isVideoModeInitial);
        }
    }, [autoStart]);

    // MONITOR DE TIEMPO REAL Y CIERRE POR INACTIVIDAD
    useEffect(() => {
        let interval: number | null = null;
        if (status === 'active') {
            interval = window.setInterval(async () => {
                const now = Date.now();
                setElapsedSeconds(prev => prev + 1);
                
                // REGLA DE 10 SEGUNDOS DE INACTIVIDAD REAL (Voz clara o Clics)
                // Si la IA está hablando, no cerramos la sesión (se considera actividad)
                if (!isModelSpeaking && (now - lastActivityRef.current > INACTIVITY_TIMEOUT)) {
                    stopSession(false, true);
                    setToastNotification({
                        title: "Sesión Finalizada",
                        message: "Goatify cerró la conexión por inactividad (10s).",
                        icon: "clock"
                    });
                    return;
                }

                if (remainingSeconds !== null) {
                    const newRemaining = remainingSeconds - 1;
                    setRemainingSeconds(newRemaining);
                    if (newRemaining <= 0) {
                        stopSession(true);
                        setToastNotification({ title: "Límite Alcanzado", message: "Has consumido los minutos de tu plan.", icon: "lock" });
                    }
                }
            }, 1000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status, remainingSeconds, elapsedSeconds, isModelSpeaking]);

    useEffect(() => { isMicMutedRef.current = isMicMuted; }, [isMicMuted]);
    useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcripts]);

    // Función para detectar interacción física
    const handleUserInteraction = () => {
        if (status === 'active') {
            lastActivityRef.current = Date.now();
        }
    };

    const stopAllModelAudio = () => {
        audioSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
        audioSourcesRef.current.clear();
        if (outputAudioContextRef.current) {
            nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        }
        setIsModelSpeaking(false);
    };

    const startVideoCapture = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const video = videoRef.current;
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = window.setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA && ctx && !isMicMutedRef.current) {
                canvas.width = 480; canvas.height = 360;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const base64Data = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
                sessionPromiseRef.current?.then(session => {
                    try {
                        session.sendRealtimeInput({ video: { mimeType: 'image/jpeg', data: base64Data } });
                    } catch (e) {
                        console.warn("WS error sending video. Possibly closed.", e);
                    }
                });
            }
        }, 1000); 
    };

    // FUNCIÓN PARA DAR VUELTA A LA CÁMARA
    const handleSwitchCamera = async () => {
        handleUserInteraction();
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        
        if (status === 'active' && isVideoMode && streamRef.current) {
            try {
                // Detener solo el track de video
                const oldVideoTrack = streamRef.current.getVideoTracks()[0];
                if (oldVideoTrack) {
                    oldVideoTrack.stop();
                    streamRef.current.removeTrack(oldVideoTrack);
                }

                // Obtener nuevo track
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: newMode }
                });
                const newVideoTrack = newStream.getVideoTracks()[0];
                streamRef.current.addTrack(newVideoTrack);
                
                if (videoRef.current) {
                    videoRef.current.srcObject = streamRef.current;
                }
                setToastNotification({ title: "Cámara Girada", message: `Modo: ${newMode === 'user' ? 'Frontal' : 'Trasera'}`, icon: "sync" });
            } catch (e) {
                console.error("Error switching camera:", e);
            }
        }
    };

    const stopSession = async (limitReached = false, inactivity = false) => {
        if (videoIntervalRef.current) {
            clearInterval(videoIntervalRef.current);
            videoIntervalRef.current = null;
        }

        if (!hasBilledSessionRef.current && sessionStartTimeRef.current && currentUser) {
            const durationSeconds = Math.max(0, (Date.now() - sessionStartTimeRef.current) / 1000);
            if (durationSeconds > 0) {
                const minutesToBill = Math.ceil((durationSeconds / 60) * 10) / 10;
                const usageKey = isVideoModeRef.current ? "monthly_video_minutes" : "monthly_voice_minutes";
                try {
                    await consumeServerFeature(isVideoModeRef.current ? 'video_live_minute' : 'voice_live_minute' as any, minutesToBill, { module: 'live_conversation', action: usageKey });
                    hasBilledSessionRef.current = true;
                } catch (error) {
                    console.warn("Live session billing failed:", error);
                }
            }
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => { track.stop(); track.enabled = false; });
            streamRef.current = null;
        }
        
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.onaudioprocess = null;
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }

        if (inputAudioContextRef.current) {
            await inputAudioContextRef.current.close().catch(() => {});
            inputAudioContextRef.current = null;
        }

        stopAllModelAudio();
        
        if (outputAudioContextRef.current) {
            await outputAudioContextRef.current.close().catch(() => {});
            outputAudioContextRef.current = null;
        }

        sessionPromiseRef.current?.then(session => { try { session.close(); } catch(e) {} });

        const finalHistory = [...transcriptsRef.current];
        const speakerName = userName || userProfile.name || 'Cliente';
        let formattedTranscriptText = finalHistory.map(t => `**${t.speaker === 'user' ? speakerName : 'Vendedor'}**: ${t.text}`).join('\n\n');
        
        // GUARDAR HISTORIAL EN CHAT AVANZADO
        if (finalHistory.length > 0 && currentUser) {
            const newChatId = `chat-live-${Date.now()}`;
            const history: ChatMessage[] = finalHistory.map(t => ({
                id: t.id,
                role: t.speaker === 'user' ? 'user' : 'model',
                text: t.text,
                timestamp: new Date().toISOString()
            }));
            const newChat: GlobalChat = {
                id: newChatId,
                name: `Sesión Live (${new Date().toLocaleString()})`,
                history,
                updatedAt: new Date().toISOString()
            };
            try {
                await setDoc(doc(db, `users/${currentUser.uid}/globalChats`, newChatId), newChat);
                setActiveGlobalChatId(newChatId);
                setToastNotification({ title: "Sesión Guardada", message: "La conversación está disponible en tu historial.", icon: "check" });
            } catch (e) {
                console.error("Error saving live session history:", e);
            }
        }

        if (onSessionEnd) onSessionEnd(formattedTranscriptText);

        setLiveSessionMode(null);
        setLiveSessionContext(null);
        setStatus('idle');
        setIsLiveSessionActive(false);
        setIsVideoMode(false);
        setRemainingSeconds(null);
        transcriptsRef.current = [];
        
        // VOLVER A LA PANTALLA DE EMPEZAR (DASHBOARD)
        setCurrentView('dashboard');
    };

    const startSession = async (video: boolean = false) => {
        if (status !== 'idle' && status !== 'error') return;
        
        const planConfig = getPlanConfig(userProfile.plan);
        const limitMins = video ? (planConfig.limits as any).video_live_minutes : (planConfig.limits as any).voice_live_minutes;
        const usedMins = video ? (userUsage?.counters?.monthly_video_minutes || 0) : (userUsage?.counters?.monthly_voice_minutes || 0);
        
        if (limitMins !== 999999 && usedMins >= limitMins) {
            setToastNotification({ title: "Límite Alcanzado", message: "Ya no tienes minutos disponibles.", icon: "lock" });
            setProModalOpen(true);
            return;
        }

        if (limitMins !== 999999) {
            const availableSeconds = Math.floor((limitMins - usedMins) * 60);
            setRemainingSeconds(availableSeconds);
        }
        
        setIsVideoMode(video);
        setStatus('connecting');
        setIsLiveSessionActive(true);
        setTranscripts([]);
        transcriptsRef.current = [];
        setElapsedSeconds(0);
        lastActivityRef.current = Date.now();
        sessionStartTimeRef.current = Date.now();
        hasBilledSessionRef.current = false;
        
        registerLiveSession(() => stopSession());
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, 
                video: video ? { width: 640, height: 480, facingMode: facingMode } : false 
            });
            streamRef.current = stream;
            if (video && videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }

            inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
            
            const callbacks = {
                onopen: () => {
                    if (!inputAudioContextRef.current) return;
                    micSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
                    scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(2048, 1, 1);
                    scriptProcessorRef.current.onaudioprocess = (e) => {
                        if (isMicMutedRef.current) return;
                        const inputData = e.inputBuffer.getChannelData(0);
                        
                        // DETECCIÓN DE VOZ REAL (Umbral 0.15 para ignorar ruido ambiente)
                        let maxAmp = 0;
                        for(let i=0; i<inputData.length; i++) if(Math.abs(inputData[i]) > maxAmp) maxAmp = Math.abs(inputData[i]);
                        if (maxAmp > 0.15) {
                            lastActivityRef.current = Date.now();
                        }

                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromiseRef.current?.then((session) => { 
                            try {
                                session.sendRealtimeInput({ audio: pcmBlob }); 
                            } catch (e) {
                                console.warn("WS error sending audio. Possibly closed.", e);
                            }
                        });
                    };
                    micSourceRef.current.connect(scriptProcessorRef.current);
                    scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    if (video) startVideoCapture();
                    setStatus('active');
                },
                onmessage: async (message: any) => {
                    // Actividad de la IA reinicia el tiempo
                    if (message.serverContent || message.toolCall) {
                        lastActivityRef.current = Date.now();
                    }

                    if (message.serverContent?.interrupted) stopAllModelAudio();
                    
                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'search_internet') {
                                try {
                                    const { query: searchQuery } = fc.args as any;
                                    const searchResult = await searchWithPerplexity(searchQuery);
                                    sessionPromiseRef.current?.then(session => {
                                        try {
                                            session.sendToolResponse({
                                                functionResponses: [{ id: fc.id, name: fc.name, response: { result: searchResult.text } }]
                                            });
                                        } catch(e){}
                                    });
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error." } }] }); } catch(err){} });
                                }
                            } else if (fc.name === 'create_task') {
                                try {
                                    const { title, description, date, projectId } = fc.args as any;
                                    let targetPid = projectId;
                                    let targetFolderId = null;

                                    if (!targetPid && projects.length > 0) {
                                        targetPid = projects[0].id;
                                        targetFolderId = projects[0].folders?.[0]?.id;
                                    } else if (targetPid) {
                                        targetFolderId = projects.find(p => p.id === targetPid)?.folders?.[0]?.id;
                                    }

                                    if (targetPid && targetFolderId) {
                                        await createTask({ 
                                            title, 
                                            description: description || '', 
                                            projectId: targetPid, 
                                            folderId: targetFolderId, 
                                            date: date || new Date().toISOString().split('T')[0] 
                                        }, targetFolderId);
                                        setToastNotification({ title: "Tarea Creada", message: `Tarea "${title}" añadida al proyecto.`, icon: "check" });
                                        sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Tarea creada en proyecto exitosamente." } }] }); } catch(e){} });
                                    } else {
                                        // Fallback a tarea personal
                                        await addDoc(collection(db, `users/${currentUser.uid}/tasks`), {
                                            title,
                                            description: description || '',
                                            date: date || new Date().toISOString().split('T')[0],
                                            status: 'Por Hacer',
                                            createdAt: serverTimestamp(),
                                            projectId: 'personal' // Marcamos como personal
                                        });
                                        setToastNotification({ title: "Tarea Personal", message: `Tarea "${title}" añadida a tu agenda personal.`, icon: "check" });
                                        sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Tarea creada en agenda personal exitosamente." } }] }); } catch(e){} });
                                    }
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error al crear la tarea." } }] }); } catch(err){} });
                                }
                            } else if (fc.name === 'send_email') {
                                const { to, subject, body } = fc.args as any;
                                try {
                                    await addDoc(collection(db, `users/${currentUser.uid}/outbox`), {
                                        to, subject, body, status: 'pending', createdAt: serverTimestamp()
                                    });
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Correo enviado correctamente." } }] }); } catch(e){} });
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error al enviar correo." } }] }); } catch(e){} });
                                }
                            } else if (fc.name === 'create_draft') {
                                const { to, subject, body } = fc.args as any;
                                setMailDraft({ to: to || '', subject: subject || '', htmlBody: body || '' });
                                setToastNotification({ title: "Borrador Creado", message: "Se ha guardado un borrador de correo.", icon: "mail" });
                                sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Borrador guardado." } }] }); } catch(e){} });
                            } else if (fc.name === 'create_project') {
                                try {
                                    const { name, industry, objective } = fc.args as any;
                                    const token = await currentUser?.getIdToken();
                                    const res = await fetch('/api/projects/create', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ name, industry, objective })
                                    });
                                    const data = await res.json();
                                    if (data.ok) {
                                        setToastNotification({ title: "Proyecto Creado", message: `Se ha creado el proyecto ${name}`, icon: "check" });
                                        sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Proyecto creado exitosamente." } }] }); } catch(e){} });
                                    } else {
                                        throw new Error(data.error);
                                    }
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error al crear proyecto." } }] }); } catch(err){} });
                                }
                            } else if (fc.name === 'create_event') {
                                try {
                                    const { title, description, startDate, endDate, videoCall } = fc.args as any;
                                    const token = await currentUser?.getIdToken();
                                    const res = await fetch('/api/calendar/events/create', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ title, description, startDate, endDate, videoCall: !!videoCall })
                                    });
                                    const data = await res.json();
                                    if (data.ok) {
                                        setToastNotification({ title: "Evento Agendado", message: `Se ha agendado: ${title}`, icon: "calendar" });
                                        sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Evento creado exitosamente." } }] }); } catch(e){} });
                                    } else {
                                        throw new Error(data.error);
                                    }
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => { try { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error al crear evento." } }] }); } catch(err){} });
                                }
                            }
                        }
                    }

                    setTranscripts(prev => {
                        let newHistory = [...prev];
                        const last = prev.length > 0 ? prev[prev.length - 1] : null;
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            stopAllModelAudio();
                            if (last?.speaker === 'user' && !turnCompleteRef.current) newHistory = prev.map((t, i) => i === prev.length - 1 ? { ...t, text: t.text + text } : t);
                            else { turnCompleteRef.current = false; newHistory = [...prev, { id: `u-${Date.now()}`, speaker: 'user', text }]; }
                        } else if (message.serverContent?.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            if (last?.speaker === 'model' && !turnCompleteRef.current) newHistory = prev.map((t, i) => i === prev.length - 1 ? { ...t, text: t.text + text } : t);
                            else { turnCompleteRef.current = false; newHistory = [...prev, { id: `m-${Date.now()}`, speaker: 'model', text }]; }
                        }
                        transcriptsRef.current = newHistory;
                        return newHistory;
                    });

                    if (message.serverContent?.turnComplete) turnCompleteRef.current = true;
                    
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        setIsModelSpeaking(true);
                        const ctx = outputAudioContextRef.current;
                        const now = ctx.currentTime;
                        if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;
                        const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                        const source = ctx.createBufferSource();
                        source.buffer = buffer; source.playbackRate.value = 1.3; source.connect(ctx.destination);
                        source.onended = () => { audioSourcesRef.current.delete(source); if (audioSourcesRef.current.size === 0) setIsModelSpeaking(false); };
                        source.start(nextStartTimeRef.current); nextStartTimeRef.current += (buffer.duration / 1.3); audioSourcesRef.current.add(source);
                    }
                },
                onerror: (err) => {
                    console.error("[LIVE FRONTEND] WebSocket error event:", err);
                    stopSession();
                },
                onclose: (event: any) => {
                    console.log("[LIVE FRONTEND] Session closed. Code:", event?.code, "Reason:", event?.reason);
                    stopSession();
                }
            };
            
            let contextualInstruction = systemInstruction || 'Responde de forma ágil y ejecutiva.';
            if (userName || userProfile.name) contextualInstruction += `\n\nEl usuario se llama: ${userName || userProfile.name}.`;
            const fullInstruction = systemInstruction?.includes('SANDBOX_AGENT') 
                ? contextualInstruction 
                : buildPersonalizedSystemInstruction(userProfile, contextualInstruction, { projects: projects.map(p => ({ id: p.id, name: p.name })), leads: allLeads, user: userProfile, allUsers, mailLists, mailContacts, accounts: emailAccounts }, language);

            sessionPromiseRef.current = startLiveSession(callbacks, fullInstruction, selectedVoice);
            await sessionPromiseRef.current;
        } catch (err) { 
            console.error("[LIVE FRONTEND] Session start error:", err);
            setStatus('error'); 
            setIsLiveSessionActive(false); 
        }
    };

    const formatSeconds = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div 
            className={`flex flex-col h-full bg-light-bg dark:bg-[#050505] relative z-[250000] overflow-hidden`}
            onClick={handleUserInteraction}
        >
            {status === 'active' && (
                <div className="absolute top-6 left-6 z-[26000]">
                    <div className={`bg-black/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 ${remainingSeconds !== null && remainingSeconds < 30 ? 'border-red-500 animate-pulse' : ''}`}>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Duración: {formatSeconds(elapsedSeconds)}</p>
                        {remainingSeconds !== null && <p className={`text-xl font-black tabular-nums ${remainingSeconds < 30 ? 'text-red-500' : 'text-white'}`}>Resta {formatSeconds(remainingSeconds)}</p>}
                    </div>
                </div>
            )}

            {isVideoMode && (status === 'active' || status === 'connecting') && (
                <div className="absolute inset-0 z-0 bg-black">
                     <video ref={videoRef} muted playsInline className="w-full h-full object-cover opacity-60" />
                     <canvas ref={canvasRef} className="hidden" />
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 relative z-10 custom-scrollbar pb-40">
            {status === 'error' && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 animate-fade-in">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                        <Icon name="phoneOff" className="w-10 h-10 text-red-600"/>
                    </div>
                    <h3 className="text-xl font-black text-neutral-800 dark:text-white uppercase">Error de Conexión</h3>
                    <p className="text-sm text-neutral-500 mt-2 max-w-xs">No se pudo establecer la conexión con Gemini Live. Por favor, verifica tu conexión o intenta más tarde.</p>
                    <button 
                        onClick={() => setStatus('idle')}
                        className="mt-8 px-8 py-3 bg-brand-primary text-white font-black rounded-2xl shadow-lg hover:scale-105 transition-all text-xs uppercase"
                    >
                        Volver a Intentar
                    </button>
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-100 dark:border-red-900/30 max-w-md overflow-x-auto">
                        <p className="text-[9px] font-mono text-red-700 dark:text-red-400">LOG DE DEBUG: Revisa la consola para más detalles (Code/Reason).</p>
                    </div>
                </div>
            )}

            {transcripts.length === 0 && status === 'idle' && (
                    <div className="h-full flex flex-col items-center justify-center text-center animate-scale-in">
                        <div className="w-24 h-24 bg-brand-primary/10 rounded-[2.5rem] flex items-center justify-center mb-6 shadow-inner"><Icon name="mic" className="w-12 h-12 text-brand-primary"/></div>
                        <h3 className="text-2xl font-black text-neutral-800 dark:text-white uppercase tracking-tighter">Conversación en Vivo</h3>
                        <p className="text-sm text-neutral-500 max-w-xs mt-2 font-medium">Habla con Shivo en tiempo real. 10s de inactividad cerrarán la sesión.</p>
                        
                        <div className="mt-6 flex flex-col items-center gap-2">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Seleccionar Voz</span>
                            <select 
                                value={selectedVoice}
                                onChange={(e) => setSelectedVoice(e.target.value as TtsVoice)}
                                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 ring-brand-primary outline-none transition-all"
                            >
                                <option value="Zephyr">Zephyr (Masculina)</option>
                                <option value="Aoede">Aoede (Femenina Suave)</option>
                                <option value="Charon">Charon (Masculina Profunda)</option>
                                <option value="Fenrir">Fenrir (Masculina Áspera)</option>
                                <option value="Kore">Kore (Femenina Brillante)</option>
                                <option value="Puck">Puck (Juvenil)</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 w-full max-w-md">
                            <button onClick={(e) => { e.stopPropagation(); startSession(false); }} className="p-6 bg-white dark:bg-dark-surface rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl hover:-translate-y-1 transition-all group flex flex-col items-center">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Icon name="mic" className="w-6 h-6 text-blue-600"/></div>
                                <span className="font-black text-xs uppercase tracking-widest">Solo Voz</span>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); startSession(true); }} className="p-6 bg-white dark:bg-dark-surface rounded-[2rem] border border-neutral-200 dark:border-neutral-800 shadow-xl hover:-translate-y-1 transition-all group flex flex-col items-center">
                                <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900/30 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Icon name="video" className="w-6 h-6 text-pink-600"/></div>
                                <span className="font-black text-xs uppercase tracking-widest">Video + Voz</span>
                            </button>
                        </div>
                    </div>
                )}
                {transcripts.map((t) => (
                    <div key={t.id} className={`flex ${t.speaker === 'user' ? 'justify-end' : 'justify-start'} animate-subtle-slide-in-up`}>
                        <div className={`p-4 rounded-[1.5rem] max-w-[85%] shadow-sm ${t.speaker === 'user' ? 'bg-brand-primary text-white rounded-tr-none' : 'bg-white dark:bg-dark-surface text-neutral-800 dark:text-white rounded-tl-none'}`}>
                            <LinkRenderer text={t.text} />
                        </div>
                    </div>
                ))}
                <div ref={transcriptEndRef}></div>
            </div>

            {status !== 'idle' && (
                <div className={`p-6 lg:p-10 z-[26001] flex flex-col items-center gap-4 transition-all ${isVideoMode ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/40 to-transparent' : 'bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl border-t border-light-border dark:border-dark-border shadow-2xl'}`}>
                    <StatusIndicator status={status} isModelSpeaking={isModelSpeaking} isMuted={false} isVideo={isVideoMode} />
                    <div className="flex items-center gap-6">
                        <button onClick={(e) => { e.stopPropagation(); setIsMicMuted(!isMicMuted); handleUserInteraction(); }} className={`p-4 rounded-full transition-all ${isMicMuted ? 'bg-red-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`} title="Silenciar Micrófono">
                            <Icon name={isMicMuted ? 'micSlash' : 'mic'} className="w-6 h-6"/>
                        </button>
                        
                        <button onClick={(e) => { e.stopPropagation(); stopSession(); }} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-2xl bg-red-600 scale-110 active:scale-95`} title="Colgar">
                            <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-ping"></div>
                            <Icon name="phoneOff" className="w-10 h-10 text-white"/>
                        </button>

                        {isVideoMode && (
                            <button onClick={(e) => { e.stopPropagation(); handleSwitchCamera(); }} className="p-4 rounded-full bg-brand-primary text-white shadow-lg animate-fade-in" title="Girar Cámara">
                                <Icon name="sync" className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveConversation;
