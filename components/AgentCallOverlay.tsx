import React, { useState, useRef, useEffect, useContext } from 'react';
import { doc, getDoc, addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { createPcmBlob, startLiveSession } from '../services/geminiService';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import { getPlanConfig, TtsVoice } from '../types';
import { searchWithPerplexity } from '../services/perplexityService';
import { consumeAgentOwnerFeature, canUseAgentOwnerFeature } from '../services/usageService';

interface AgentCallOverlayProps {
    agentId: string;
    agentName: string;
    agentPersona: string;
    agentAvatar: string | null;
    agentVoice: TtsVoice;
    userName: string | null;
    onSessionEnd: (transcript: string) => void;
    ownerId?: string; 
    ownerPlan?: string; 
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
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

const AgentCallOverlay: React.FC<AgentCallOverlayProps> = ({ agentId, agentName, agentPersona, agentAvatar, agentVoice, userName: initialUserName, onSessionEnd, ownerId, ownerPlan }) => {
    const { setToastNotification, currentUser } = useContext(AppContext);
    
    const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'no_credits'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [isModelSpeaking, setIsModelSpeaking] = useState(false);
    const [currentUserName, setCurrentUserName] = useState<string | null>(initialUserName);

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const transcriptsRef = useRef<{speaker: string, text: string}[]>([]);
    const turnCompleteRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);
    const lastActivityTimeRef = useRef<number>(Date.now());
    const textHistoryRef = useRef<string>("");

    const GUEST_MAX_SECONDS = 60; 
    const INACTIVITY_TIMEOUT = 10000; 

    const billingId = ownerId || currentUser?.uid;

    useEffect(() => {
        const init = async () => {
            if (agentId && currentUser) {
                const convoId = `public_${agentId}_${localStorage.getItem(`goatify_vid_${agentId}`)}`;
                const convoSnap = await getDoc(doc(db, 'agentConversations', convoId));
                if (convoSnap.exists()) {
                    const data = convoSnap.data();
                    if (data.userName) setCurrentUserName(data.userName);
                    if (data.history) {
                        textHistoryRef.current = data.history.slice(-10).map((m: any) => `${m.role === 'user' ? 'Cliente' : 'Tú'}: ${m.text}`).join('\n');
                    }
                }
            }
            if (billingId && agentId) {
                const canCall = await canUseAgentOwnerFeature(billingId, agentId, 'voice_live_minute', 0.1);
                if (!canCall) {
                    setStatus('no_credits');
                    await addDoc(collection(db, `users/${billingId}/notifications`), {
                        type: 'general',
                        text: `⚠️ **Aviso de Vendedor**: Alguien intentó llamar a tu agente **${agentName}**, pero no tienes créditos de voz disponibles.`,
                        timestamp: new Date().toISOString(),
                        read: false,
                        link: '/#aiStudio/agents'
                    });
                    return;
                }
            }
            startCall();
        };
        init();
        return () => { stopCallInternal(); };
    }, []);

    useEffect(() => {
        let interval: number | null = null;
        if (status === 'active') {
            interval = window.setInterval(async () => {
                const now = Date.now();
                setElapsedSeconds(s => {
                    const next = s + 1;
                    if (ownerId && next >= GUEST_MAX_SECONDS) {
                        stopCallInternal("Sesión de cortesía finalizada.");
                        return GUEST_MAX_SECONDS;
                    }
                    return next;
                });
                if (now - lastActivityTimeRef.current > INACTIVITY_TIMEOUT) {
                    stopCallInternal("Llamada finalizada por inactividad.");
                }
            }, 1000);
        }
        return () => { if (interval) clearInterval(interval); };
    }, [status]);

    const stopCallInternal = async (reason?: string) => {
        if (!startTimeRef.current && status !== 'no_credits') return;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => { track.stop(); track.enabled = false; });
            streamRef.current = null;
        }
        if (inputAudioContextRef.current) { await inputAudioContextRef.current.close().catch(() => {}); inputAudioContextRef.current = null; }
        stopAllModelAudio();
        if (outputAudioContextRef.current) { await outputAudioContextRef.current.close().catch(() => {}); outputAudioContextRef.current = null; }
        if (billingId && startTimeRef.current && agentId) {
            const duration = (Date.now() - startTimeRef.current) / 1000;
            const minutesToBill = Math.max(0.1, duration / 60);
            try { await consumeAgentOwnerFeature(billingId, agentId, 'voice_live_minute', minutesToBill, { action: 'agent_voice_call' }); } catch (e) {}
        }
        const finalHistory = [...transcriptsRef.current];
        const speakerLabel = currentUserName || 'Visitante';
        const formattedTranscript = finalHistory.map(t => `**${t.speaker === 'user' ? speakerLabel : 'Agente'}**: ${t.text}`).join('\n\n');
        sessionPromiseRef.current?.then(session => { try { session.close(); } catch(e) {} });
        if (reason) setToastNotification({ title: "Fin de Sesión", message: reason, icon: 'clock' });
        startTimeRef.current = null;
        onSessionEnd(formattedTranscript);
    };

    const stopAllModelAudio = () => {
        audioSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
        audioSourcesRef.current.clear();
        if (outputAudioContextRef.current) nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
        setIsModelSpeaking(false);
    };

    const startCall = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            streamRef.current = stream;
            inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
            startTimeRef.current = Date.now();
            lastActivityTimeRef.current = Date.now();
            let sysInstr = `SANDBOX_AGENT_MODE\nIDENTIDAD: ${agentPersona}\nREGLA: Responde rápido. Si el cliente interrumpe, cállate.`;
            if (textHistoryRef.current) {
                sysInstr += `\n\n[CONTEXTO PREVIO DEL CHAT DE TEXTO]:\n${textHistoryRef.current}\n\nREGLA CRÍTICA: El usuario ya ha hablado contigo por texto. NO preguntes información que ya se dio (como su nombre si ya lo sabes). Salúdalo por su nombre si ya lo conoces.`;
            }
            if (currentUserName) { sysInstr += `\n\nEl usuario se llama: ${currentUserName}.`; }
            const callbacks = {
                onopen: () => {
                    if (!inputAudioContextRef.current) return;
                    const source = inputAudioContextRef.current.createMediaStreamSource(stream);
                    const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(1024, 1, 1);
                    scriptProcessor.onaudioprocess = (e) => {
                        if (isMuted) return;
                        const inputData = e.inputBuffer.getChannelData(0);
                        let maxAmplitude = 0;
                        for (let i = 0; i < inputData.length; i++) if (Math.abs(inputData[i]) > maxAmplitude) maxAmplitude = Math.abs(inputData[i]);
                        if (maxAmplitude > 0.08) lastActivityTimeRef.current = Date.now(); 
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ audio: pcmBlob }));
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current.destination);
                    setStatus('active');
                },
                onmessage: async (message: any) => {
                    if (message.serverContent || message.toolCall) lastActivityTimeRef.current = Date.now();
                    if (message.serverContent?.interrupted) stopAllModelAudio();
                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (fc.name === 'search_internet') {
                                try {
                                    const { query: searchQuery } = fc.args as any;
                                    const searchResult = await searchWithPerplexity(searchQuery);
                                    sessionPromiseRef.current?.then(session => { session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: searchResult.text } }] }); });
                                } catch (e) {
                                    sessionPromiseRef.current?.then(session => session.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { result: "Error de red." } }] }));
                                }
                            }
                        }
                    }
                    if (message.serverContent?.inputTranscription) {
                        stopAllModelAudio();
                        const text = message.serverContent.inputTranscription.text;
                        if (transcriptsRef.current.length > 0 && transcriptsRef.current[transcriptsRef.current.length-1].speaker === 'user' && !turnCompleteRef.current) {
                            transcriptsRef.current[transcriptsRef.current.length-1].text += text;
                        } else { transcriptsRef.current.push({ speaker: 'user', text }); turnCompleteRef.current = false; }
                    } else if (message.serverContent?.outputTranscription) {
                        const text = message.serverContent.outputTranscription.text;
                        if (transcriptsRef.current.length > 0 && transcriptsRef.current[transcriptsRef.current.length-1].speaker === 'model' && !turnCompleteRef.current) {
                            transcriptsRef.current[transcriptsRef.current.length-1].text += text;
                        } else { transcriptsRef.current.push({ speaker: 'model', text }); turnCompleteRef.current = false; }
                    }
                    if (message.serverContent?.turnComplete) turnCompleteRef.current = true;
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
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
                onerror: () => setStatus('error'),
                onclose: () => stopCallInternal()
            };
            sessionPromiseRef.current = startLiveSession(callbacks, sysInstr, agentVoice);
        } catch (e) { setStatus('error'); }
    };

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (status === 'no_credits') {
        return (
            <div className="fixed inset-0 z-[1000000] bg-neutral-950 flex flex-col items-center justify-center p-8 text-white animate-fade-in font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/40"> <Icon name="lock" className="w-10 h-10 text-red-500" /> </div>
                <h2 className="text-2xl font-black uppercase text-center mb-2">Vendedor fuera de línea</h2>
                <p className="text-neutral-400 text-center max-w-xs text-sm">Este vendedor no tiene créditos disponibles. Por favor, comunícate con el dueño de este agente.</p>
                <button onClick={() => stopCallInternal()} className="mt-8 px-8 py-3 bg-white text-black font-black uppercase text-xs rounded-xl">Volver</button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[1000000] bg-neutral-950 flex flex-col items-center justify-center p-8 text-white animate-fade-in font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden">
            <div className="text-center space-y-4 mb-16 mt-[env(safe-area-inset-top)]">
                <p className="text-brand-accent text-[10px] font-black uppercase tracking-[0.4em] animate-pulse"> {status === 'connecting' ? 'Estableciendo Conexión...' : 'Llamada Activa'} </p>
                <div className={`bg-white/5 backdrop-blur-3xl px-12 py-6 rounded-[2.5rem] border border-white/10 ${ownerId && elapsedSeconds > 50 ? 'ring-2 ring-red-500 animate-pulse' : ''}`}>
                    <p className="text-5xl sm:text-7xl font-mono font-black tabular-nums leading-none">{formatTime(elapsedSeconds)}</p>
                </div>
            </div>
            <div className="relative flex items-center justify-center h-32 w-full mb-20">
                <div className={`absolute w-32 h-32 bg-brand-primary/20 rounded-full animate-ping ${isModelSpeaking ? 'opacity-60 scale-150' : 'opacity-0'}`}></div>
                <div className={`p-8 rounded-full border-2 transition-all ${isModelSpeaking ? 'border-brand-accent bg-brand-primary/10' : 'border-neutral-800'}`}> <Icon name="mic" className={`w-16 h-16 ${isModelSpeaking ? 'text-brand-accent' : 'text-neutral-600'}`} /> </div>
            </div>
            <div className="flex flex-row items-center justify-center gap-6 w-full max-w-sm mb-20 pb-[env(safe-area-inset-bottom)]">
                <button onClick={() => setIsMuted(!isMuted)} className={`flex-1 p-6 rounded-[2rem] transition-all h-24 ${isMuted ? 'bg-white text-black' : 'bg-white/10 text-white border border-white/20'}`}> <Icon name={isMuted ? "micSlash" : "mic"} className="w-8 h-8 mx-auto"/> <p className="text-[9px] font-black uppercase tracking-widest mt-2">Silenciar</p> </button>
                <button onClick={() => stopCallInternal()} className="flex-1 p-6 bg-red-600 hover:bg-red-700 text-white rounded-[2rem] shadow-xl transform active:scale-95 transition-all h-24"> <Icon name="phoneOff" className="w-8 h-8 mx-auto"/> <p className="text-[9px] font-black uppercase tracking-widest mt-2">Colgar</p> </button>
            </div>
        </div>
    );
};

export default AgentCallOverlay;