
// FIX: Added missing React imports and hooks to resolve namespace and undefined name errors
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { db, storage } from '../firebaseConfig';
import { 
    collection, addDoc, onSnapshot, doc, updateDoc, 
    arrayUnion, arrayRemove, deleteDoc, query, where, getDoc, setDoc,
    serverTimestamp, increment
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { AppContext } from './AppContext';
import { getPlanConfig } from '../types';
import type { UserProfile, CallSession, CallType } from '../types';

interface CallContextType {
    activeCall: CallSession & { videoUpgradeRequest?: { fromUid: string; status: 'pending' | 'accepted' | 'rejected' } | null } | null;
    incomingCall: CallSession | null;
    waitingForHost: boolean;
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    isMuted: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
    isRecording: boolean;
    isNoiseCancelled: boolean;
    callStatusInfo: string | null;
    facingMode: 'user' | 'environment';
    isPreJoin: boolean;
    isMinimized: boolean;
    setIsMinimized: (val: boolean) => void;
    
    startCall: (participants: UserProfile[], type: CallType) => Promise<void>;
    startInstantMeeting: () => Promise<string>;
    joinMeeting: (callId: string) => Promise<void>;
    scheduleMeeting: (title: string, scheduledAt: string, invitees: UserProfile[], description: string, isPrivate?: boolean) => Promise<string>;
    acceptMeeting: (callId: string) => Promise<void>;
    declineMeeting: (callId: string) => Promise<void>;
    answerCall: () => Promise<void>;
    rejectCall: () => Promise<void>;
    endCall: () => Promise<void>;
    
    toggleMute: () => void;
    toggleCamera: () => void;
    switchCamera: () => void;
    toggleScreenShare: () => void;
    toggleRecording: () => void;
    toggleNoiseCancellation: () => void;
    
    addParticipant: (userId: string) => Promise<void>;
    kickParticipant: (userId: string) => Promise<void>;
    admitParticipant: (userId: string) => Promise<void>;
    denyParticipant: (userId: string) => Promise<void>;
    
    enterCall: () => Promise<void>;
    cancelJoin: () => void;

    remoteMute: (targetUid: string) => Promise<void>;
    requestVideoUpgrade: () => Promise<void>;
    respondVideoUpgrade: (accept: boolean) => Promise<void>;
}

export const CallContext = createContext<CallContextType>({} as CallContextType);

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    ],
    iceCandidatePoolSize: 10,
};

const RINGTONE_URL = 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/gentle-ring.mp3?alt=media&token=subtle-ring';
const CALLING_URL = 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/outgoing-soft.mp3?alt=media&token=outgoing-soft';

const FALLBACK_RINGTONE = 'https://actions.google.com/sounds/v1/communication/phone_ringing.ogg';
const FALLBACK_CALLING = 'https://actions.google.com/sounds/v1/communication/outgoing_call_ring.ogg';

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { currentUser, userProfile, allUsers, setToastNotification, checkMeetingLimit, createNotification, sendDirectMessage, saveCallRecording } = useContext(AppContext);
    
    const [activeCall, setActiveCall] = useState<any>(null);
    const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
    const [waitingForHost, setWaitingForHost] = useState(false);
    const [isPreJoin, setIsPreJoin] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isNoiseCancelled, setIsNoiseCancelled] = useState(true);
    const [callStatusInfo, setCallStatusInfo] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const callUnsubscribe = useRef<() => void>();
    const timerIntervalRef = useRef<number | null>(null);
    const ringingTimeoutRef = useRef<number | null>(null);
    const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);
    
    const playSound = (url: string, fallback: string, loop: boolean = true) => {
        stopSound();
        const audio = new Audio(url);
        audio.loop = loop;
        audio.volume = 0.25;
        audio.play().catch(e => {
            const fallbackAudio = new Audio(fallback);
            fallbackAudio.loop = loop;
            fallbackAudio.volume = 0.2;
            fallbackAudio.play().catch(() => {});
            ringtoneAudioRef.current = fallbackAudio;
        });
        ringtoneAudioRef.current = audio;
    };

    const stopSound = () => {
        if (ringtoneAudioRef.current) {
            ringtoneAudioRef.current.pause();
            ringtoneAudioRef.current.currentTime = 0;
            ringtoneAudioRef.current = null;
        }
    };

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const recordingStreamRef = useRef<MediaStream | null>(null);

    const setupLocalStream = async (type: 'audio' | 'video', noiseCancellation = true, overrideFacingMode?: 'user' | 'environment') => {
        try {
            const participantCount = activeCall?.participants?.length || 1;
            const isLargeMeeting = participantCount > 5;
            
            const currentMode = overrideFacingMode || facingMode;
            const constraints = {
                audio: {
                    echoCancellation: noiseCancellation,
                    noiseSuppression: noiseCancellation,
                    autoGainControl: noiseCancellation,
                },
                video: type === 'video' ? { 
                    facingMode: currentMode, 
                    width: { ideal: isLargeMeeting ? 320 : 1280 }, 
                    height: { ideal: isLargeMeeting ? 240 : 720 },
                    frameRate: { ideal: isLargeMeeting ? 15 : 30 }
                } : false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (isMuted && stream.getAudioTracks()[0]) {
                stream.getAudioTracks()[0].enabled = false;
            }

            setLocalStream(stream);
            localStreamRef.current = stream;
            
            peerConnections.current.forEach(pc => {
                const senders = pc.getSenders();
                stream.getTracks().forEach(track => {
                    const sender = senders.find(s => s.track?.kind === track.kind);
                    if (sender) {
                        sender.replaceTrack(track);
                        applyBitrateLimit(sender, isLargeMeeting);
                    }
                    else pc.addTrack(track, stream);
                });
            });

            return stream;
        } catch (err) {
            console.error("Error accessing media devices", err);
            setToastNotification({ title: "Error de Cámara", message: "No se pudo acceder a los dispositivos. Revisa permisos.", icon: "close" });
            return null;
        }
    };

    const applyBitrateLimit = async (sender: RTCRtpSender, isLargeMeeting: boolean) => {
        if (sender.track?.kind !== 'video') return;
        try {
            const parameters = sender.getParameters();
            if (!parameters.encodings) parameters.encodings = [{}];
            parameters.encodings[0].maxBitrate = isLargeMeeting ? 150000 : 1500000;
            await sender.setParameters(parameters);
        } catch (e) {
            console.warn("Could not set bitrate limits", e);
        }
    };

    const cleanupCall = () => {
        stopSound();
        if (ringingTimeoutRef.current) {
            clearTimeout(ringingTimeoutRef.current);
            ringingTimeoutRef.current = null;
        }
        if (isRecording) stopRecordingInternal();
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
        }
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        
        setLocalStream(null);
        localStreamRef.current = null;
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();
        setRemoteStreams(new Map());
        setActiveCall(null);
        setIncomingCall(null);
        setWaitingForHost(false);
        setIsPreJoin(false);
        setIsMuted(false);
        setIsCameraOff(false);
        setIsScreenSharing(false);
        setIsRecording(false);
        setCallStatusInfo(null);
        setIsMinimized(false);
        
        if (callUnsubscribe.current) {
            callUnsubscribe.current();
            callUnsubscribe.current = undefined;
        }
    };

    const startRecordingInternal = async () => {
        if (!currentUser) return;
        if (activeCall?.adminId !== currentUser?.uid) {
            setToastNotification({ title: "Acción Denegada", message: "Solo el anfitrión puede grabar esta sesión.", icon: "lock" });
            return;
        }

        try {
            const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });
            
            recordingStreamRef.current = displayStream;
            const recorder = new MediaRecorder(displayStream, { mimeType: 'video/webm;codecs=vp9,opus' });
            recordedChunksRef.current = [];
            
            recorder.ondataavailable = (e) => { 
                if (e.data.size > 0) recordedChunksRef.current.push(e.data); 
            };

            recorder.onstop = async () => {
                const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                displayStream.getTracks().forEach(t => t.stop());
                
                if (currentUser && blob.size > 0) {
                    const fileName = `meeting_record_${activeCall?.id || Date.now()}.webm`;
                    setToastNotification({ title: "Guardando grabación", message: "Subiendo archivo a la nube...", icon: 'sync', isLoading: true });
                    try {
                        const { url } = await uploadWithQuotaCheck({
                            userId: currentUser.uid,
                            data: blob,
                            path: safeStoragePath('users', currentUser.uid, 'recordings', fileName),
                            sizeBytes: blob.size,
                            metadata: { contentType: 'video/webm' },
                            plan: userProfile.plan
                        });
                        await saveCallRecording(url, blob.size, activeCall?.title || "Grabación de Goatify Meet");
                        setToastNotification({ title: "Grabación Guardada", message: "El video está disponible en tu Dashboard y Hub de Meets.", icon: 'check' });
                    } catch (e) {
                        console.error("Upload failed", e);
                        setToastNotification({ title: "Error", message: "No se pudo guardar la grabación.", icon: 'close' });
                    }
                }
                setIsRecording(false);
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            setToastNotification({ title: "Grabando", message: "Se está capturando toda la pantalla de la reunión.", icon: 'radio' });
        } catch (e) {
            console.error("Recorder start failed", e);
            setIsRecording(false);
        }
    };

    const stopRecordingInternal = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (recordingStreamRef.current) {
            recordingStreamRef.current.getTracks().forEach(t => t.stop());
            recordingStreamRef.current = null;
        }
        setIsRecording(false);
    };

    const createPeerConnection = (targetUid: string, callId: string) => {
        const pc = new RTCPeerConnection(servers);
        peerConnections.current.set(targetUid, pc);
        
        const participantCount = activeCall?.participants?.length || 1;
        const isLargeMeeting = participantCount > 5;

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                const sender = pc.addTrack(track, localStreamRef.current!);
                applyBitrateLimit(sender, isLargeMeeting);
            });
        }
        pc.ontrack = (event) => {
            setRemoteStreams(prev => {
                const next = new Map(prev);
                next.set(targetUid, event.streams[0]);
                return next;
            });
        };
        pc.onicecandidate = (event) => {
            if (event.candidate && currentUser) {
                addDoc(collection(db, 'calls', callId, 'candidates'), {
                    candidate: event.candidate.toJSON(),
                    fromUid: currentUser.uid,
                    toUid: targetUid
                });
            }
        };
        pc.onnegotiationneeded = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await addDoc(collection(db, 'calls', callId, 'offers'), { 
                    offer: { sdp: offer.sdp, type: offer.type }, 
                    fromUid: currentUser?.uid, toUid: targetUid 
                });
            } catch (err) { console.error(err); }
        };
        return pc;
    };

    useEffect(() => {
        if (!currentUser || !activeCall) return;
        const callId = activeCall.id;
        const unsubOffers = onSnapshot(collection(db, 'calls', callId, 'offers'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.fromUid === currentUser.uid) return;
                    let pc = peerConnections.current.get(data.fromUid);
                    if (!pc) pc = createPeerConnection(data.fromUid, callId);
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answerDescription = await pc.createAnswer();
                    await pc.setLocalDescription(answerDescription);
                    await setDoc(doc(db, 'calls', callId, 'answers', data.fromUid), { 
                        answer: { type: answerDescription.type, sdp: answerDescription.sdp }, 
                        fromUid: currentUser.uid 
                    });
                }
            });
        });
        const unsubAnswers = onSnapshot(collection(db, 'calls', callId, 'answers'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.fromUid === currentUser.uid) return;
                    const pc = peerConnections.current.get(data.fromUid);
                    if (pc && !pc.currentRemoteDescription) {
                        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    }
                }
            });
        });
        const unsubCandidates = onSnapshot(collection(db, 'calls', callId, 'candidates'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.fromUid === currentUser.uid) return;
                    const pc = peerConnections.current.get(data.fromUid);
                    if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.warn("Ice candidate error", e));
                }
            });
        });
        return () => { unsubOffers(); unsubAnswers(); unsubCandidates(); };
    }, [activeCall?.id, currentUser]);

    useEffect(() => {
        if (!activeCall || !currentUser || isPreJoin || activeCall.status !== 'active') return;
        
        // El Administrador inicia las conexiones enviando ofertas
        if (activeCall.adminId === currentUser.uid) {
            activeCall.participants.forEach(async (uid: string) => {
                if (uid !== currentUser.uid && !peerConnections.current.has(uid)) {
                    createPeerConnection(uid, activeCall.id);
                }
            });
        }
    }, [activeCall?.participants, activeCall?.status, currentUser, isPreJoin]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, 'calls'), where('participants', 'array-contains', currentUser.uid), where('status', '==', 'ringing'));
        const unsub = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const callData = change.doc.data() as CallSession;
                    const createdAt = callData.createdAt ? new Date(callData.createdAt).getTime() : 0;
                    if (callData.caller.uid !== currentUser.uid && Date.now() - createdAt < 120000) {
                        setIncomingCall({ ...callData, id: change.doc.id });
                        playSound(RINGTONE_URL, FALLBACK_RINGTONE);
                    }
                }
            });
        });
        return () => unsub();
    }, [currentUser]);

    const startCall = async (participants: UserProfile[], type: 'audio' | 'video') => {
        if (await checkMeetingLimit()) return;
        const stream = await setupLocalStream(type, isNoiseCancelled);
        if (!stream) return;
        const planConfig = getPlanConfig(userProfile.plan);
        const maxDur = (planConfig.limits as any).meeting_duration_minutes || 20;
        
        const callDocRef = await addDoc(collection(db, 'calls'), {
            caller: { uid: currentUser?.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl },
            participants: [currentUser?.uid, ...participants.map(p => p.uid)], 
            type,
            status: 'ringing',
            isActive: true,
            createdAt: new Date().toISOString(),
            adminId: currentUser?.uid,
            isMeeting: false,
            maxDurationMinutes: maxDur,
            waitingRoom: [],
            videoUpgradeRequest: null
        });

        playSound(CALLING_URL, FALLBACK_CALLING);

        ringingTimeoutRef.current = window.setTimeout(() => {
            const ref = doc(db, 'calls', callDocRef.id);
            getDoc(ref).then(snap => {
                 if (snap.exists() && snap.data().status === 'ringing') {
                      updateDoc(ref, { status: 'ended' });
                      stopSound();
                      setToastNotification({ title: "Llamada sin respuesta", message: "El usuario no contestó.", icon: "close" });
                 }
            });
        }, 30000);

        proceedToCall({ id: callDocRef.id, caller: { uid: currentUser!.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }, participants: [currentUser!.uid], type, status: 'ringing', isActive: true, createdAt: new Date().toISOString(), adminId: currentUser!.uid, maxDurationMinutes: maxDur, waitingRoom: [] } as any);
    };

    const startInstantMeeting = async (): Promise<string> => {
        if (await checkMeetingLimit()) throw new Error("Limit reached");
        const planConfig = getPlanConfig(userProfile.plan);
        const maxDur = (planConfig.limits as any).meeting_duration_minutes || 20;
        
        const callDocRef = await addDoc(collection(db, 'calls'), {
            caller: { uid: currentUser?.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl },
            participants: [currentUser?.uid], 
            type: 'video',
            status: 'active',
            isActive: true,
            isMeeting: true,
            title: `Reunión Instantánea de ${userProfile.name}`,
            createdAt: new Date().toISOString(),
            scheduledAt: new Date().toISOString(),
            adminId: currentUser?.uid,
            waitingRoom: [],
            maxDurationMinutes: maxDur
        });
        
        return `${window.location.origin}/#/calls/${callDocRef.id}`;
    };

    const joinMeeting = async (callId: string) => {
        const callRef = doc(db, 'calls', callId);
        const callSnap = await getDoc(callRef);
        if (!callSnap.exists()) {
             setToastNotification({ title: "Reunión Finalizada", message: "Este link ya no está vigente.", icon: "close" });
             return;
        }
        const callData = { ...callSnap.data(), id: callId } as CallSession;
        if (callData.status === 'ended') {
             setToastNotification({ title: "Expirado", message: "Esta sesión ha concluido.", icon: "close" });
             return;
        }
        setIsPreJoin(true);
        setActiveCall(callData);
        await setupLocalStream(callData.type, isNoiseCancelled);
    };

    const enterCall = async () => {
        if (!activeCall || !currentUser) return;
        stopSound();
        
        // Habilitar audio explícitamente tras interacción
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        await audioCtx.resume();

        const callRef = doc(db, 'calls', activeCall.id);
        if (activeCall.adminId !== currentUser.uid && (activeCall.isMeeting || activeCall.isPrivate)) {
             setWaitingForHost(true);
             await updateDoc(callRef, { waitingRoom: arrayUnion(currentUser.uid) });
             const unsub = onSnapshot(callRef, (snap) => {
                 const data = snap.data() as CallSession;
                 if (data?.participants.includes(currentUser.uid)) {
                     setWaitingForHost(false); setIsPreJoin(false); unsub(); proceedToCall({ ...data, id: activeCall.id });
                 }
             });
        } else {
             await updateDoc(callRef, { status: 'active', participants: arrayUnion(currentUser.uid) });
             setIsPreJoin(false);
             const snap = await getDoc(callRef);
             if (snap.exists()) proceedToCall({ ...snap.data(), id: activeCall.id } as CallSession);
        }
    };

    const cancelJoin = () => {
        if (activeCall && currentUser && waitingForHost) {
            updateDoc(doc(db, 'calls', activeCall.id), { waitingRoom: arrayRemove(currentUser.uid) });
        }
        cleanupCall();
    };

    const proceedToCall = (callData: CallSession) => {
        setActiveCall(callData);
        callUnsubscribe.current = onSnapshot(doc(db, 'calls', callData.id), async (snapshot) => {
             if (!snapshot.exists()) { cleanupCall(); return; }
             const data = snapshot.data() as any;
             const fullData = { ...data, id: snapshot.id };
             
             if (data.status === 'ended') {
                 cleanupCall();
                 setToastNotification({ title: "Llamada Finalizada", message: "La sesión ha concluido.", icon: "phoneOff" });
                 return;
             }

             if (data.type === 'video') {
                 const isCameraActive = localStreamRef.current?.getVideoTracks().some(t => t.enabled);
                 if (!isCameraActive && !isCameraOff) {
                      await setupLocalStream('video', isNoiseCancelled);
                      setIsCameraOff(false);
                 }
             }

             if (data.status === 'active') stopSound();

             setActiveCall(fullData);
        });

        const start = new Date(callData.createdAt).getTime();
        const maxMs = (callData.maxDurationMinutes || 20) * 60 * 1000;
        timerIntervalRef.current = window.setInterval(() => {
            if (Date.now() - start >= maxMs) {
                setToastNotification({ title: "Límite Alcanzado", message: "La reunión ha excedido el tiempo permitido.", icon: "clock" });
                endCall();
            }
        }, 10000);
    };

    const scheduleMeeting = async (title: string, scheduledAt: string, invitees: UserProfile[], description: string, isPrivate: boolean = false) => {
        if (await checkMeetingLimit()) throw new Error("Limit reached");
        const planConfig = getPlanConfig(userProfile.plan);
        const maxDur = (planConfig.limits as any).meeting_duration_minutes || 20;
        const callDocRef = await addDoc(collection(db, 'calls'), {
            caller: { uid: currentUser?.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl },
            participants: [currentUser?.uid], 
            invited: invitees.map(p => p.uid),
            type: 'video',
            status: 'scheduled',
            isActive: true,
            isMeeting: true,
            title, description, scheduledAt,
            createdAt: new Date().toISOString(),
            adminId: currentUser?.uid,
            waitingRoom: [], isPrivate, maxDurationMinutes: maxDur
        });
        
        invitees.forEach(async user => {
            await createNotification(user.uid, {
                type: 'project_invite',
                text: `📅 **Invitación a Reunión**: "${title}".`,
                link: `/#/calls/${callDocRef.id}`,
                fromUser: { uid: currentUser!.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl },
                metadata: { meetingId: callDocRef.id, isMeetingInvite: true }
            });
        });
        return `${window.location.origin}/#/calls/${callDocRef.id}`;
    };

    const acceptMeeting = async (callId: string) => {
        if (!currentUser) return;
        await updateDoc(doc(db, 'calls', callId), {
            participants: arrayUnion(currentUser.uid),
            invited: arrayRemove(currentUser.uid)
        });
        setToastNotification({ title: "Reunión Aceptada", message: "Se ha añadido a tu calendario.", icon: "calendar" });
    };

    const declineMeeting = async (callId: string) => {
        if (!currentUser) return;
        const ref = doc(db, 'calls', callId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
             const data = snap.data();
             await createNotification(data.adminId, {
                 type: 'general',
                 text: `❌ **Reunión Rechazada**: ${userProfile.name} no podrá asistir a "${data.title}".`,
                 fromUser: { uid: currentUser.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
             });
             await updateDoc(ref, { invited: arrayRemove(currentUser.uid) });
        }
        setToastNotification({ title: "Invitación Rechazada", message: "Has declinado la invitación.", icon: "close" });
    };

    const answerCall = async () => { 
        if (!incomingCall) return; 
        stopSound();
        await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'active', participants: arrayUnion(currentUser?.uid) });
        await joinMeeting(incomingCall.id); 
        setIncomingCall(null);
    };

    const rejectCall = async () => { 
        if (!incomingCall) return; 
        stopSound();
        await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'ended' }); 
        await createNotification(incomingCall.caller.uid, {
            type: 'missed_call',
            text: `📞 **Llamada Perdida**: ${userProfile.name} no pudo contestar.`,
            fromUser: { uid: currentUser!.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
        });
        setIncomingCall(null); 
    };

    const endCall = async () => {
        stopSound();
        if (activeCall) {
            const callRef = doc(db, 'calls', activeCall.id);
            const isOneToOne = !activeCall.isMeeting;
            const isHost = activeCall.adminId === currentUser?.uid;

            if (isOneToOne || isHost) {
                await updateDoc(callRef, { status: 'ended', endedAt: new Date().toISOString(), isActive: false }).catch(() => {});
                
                if (isOneToOne) {
                    const startTime = new Date(activeCall.createdAt).getTime();
                    const diffSeconds = Math.floor((Date.now() - startTime) / 1000);
                    const durationText = `${Math.floor(diffSeconds / 60)} min ${diffSeconds % 60} seg`;
                    const logMessage = `📞 **Llamada finalizada**\n**Duración:** ${durationText}`;
                    
                    const otherUid = activeCall.participants.find((uid: string) => uid !== currentUser?.uid);
                    if (otherUid) {
                        const otherUser = allUsers.find(u => u.uid === otherUid);
                        if (otherUser) await sendDirectMessage(otherUser, logMessage);
                    }
                }
            } else {
                await updateDoc(callRef, { participants: arrayRemove(currentUser?.uid) }).catch(() => {});
            }
        }
        cleanupCall();
    };

    const toggleMute = () => { if (localStreamRef.current) { localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !t.enabled); setIsMuted(!localStreamRef.current.getAudioTracks()[0].enabled); } };
    
    const toggleCamera = async () => { 
        if (activeCall?.type === 'audio') { await requestVideoUpgrade(); return; }
        if (localStreamRef.current) { 
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOff(!videoTrack.enabled);
            }
        } 
    };

    const requestVideoUpgrade = async () => {
        if (!activeCall || !currentUser) return;
        await updateDoc(doc(db, 'calls', activeCall.id), {
            videoUpgradeRequest: { fromUid: currentUser.uid, status: 'pending' }
        });
        setToastNotification({ title: "Petición Enviada", message: "Esperando que el otro usuario acepte el video.", icon: "video" });
    };

    const respondVideoUpgrade = async (accept: boolean) => {
        if (!activeCall) return;
        if (accept) {
            await updateDoc(doc(db, 'calls', activeCall.id), { type: 'video', videoUpgradeRequest: null });
        } else {
            await updateDoc(doc(db, 'calls', activeCall.id), { videoUpgradeRequest: null });
        }
    };

    const switchCamera = async () => { 
        if (activeCall?.type !== 'video') return; 
        const newMode = facingMode === 'user' ? 'environment' : 'user'; 
        setFacingMode(newMode); 
        await setupLocalStream('video', isNoiseCancelled, newMode); 
    };
    
    const toggleScreenShare = async () => { 
        if (isScreenSharing) { 
            await setupLocalStream(activeCall.type, isNoiseCancelled); 
            setIsScreenSharing(false); 
        } else {
            try {
                const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({ 
                    video: { cursor: 'always' }, 
                    audio: false 
                });
                
                const screenTrack = screenStream.getVideoTracks()[0];
                
                if (localStreamRef.current) {
                    const videoTrack = localStreamRef.current.getVideoTracks()[0];
                    if (videoTrack) {
                        localStreamRef.current.removeTrack(videoTrack);
                        videoTrack.stop();
                    }
                    localStreamRef.current.addTrack(screenTrack);
                } else {
                    setLocalStream(screenStream);
                    localStreamRef.current = screenStream;
                }

                setIsScreenSharing(true);
                
                screenTrack.onended = () => {
                    toggleScreenShare();
                };

                peerConnections.current.forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });

            } catch (e) { 
                console.error(e); 
                setToastNotification({ title: "Error", message: "No se pudo compartir pantalla en este dispositivo.", icon: 'close' });
            }
        }
    };

    const toggleRecording = () => { 
        if (isRecording) stopRecordingInternal(); 
        else startRecordingInternal(); 
    };
    
    const toggleNoiseCancellation = async () => {
        const nextState = !isNoiseCancelled;
        setIsNoiseCancelled(nextState);
        if (localStreamRef.current) {
            await setupLocalStream(activeCall.type, nextState);
            setToastNotification({ title: "Audio Profesional", message: nextState ? "Filtros HD activados." : "Filtros HD desactivados.", icon: "volume" });
        }
    };

    const addParticipant = async (userId: string) => { if (activeCall) await updateDoc(doc(db, 'calls', activeCall.id), { participants: arrayUnion(userId) }); };
    const kickParticipant = async (userId: string) => { if (activeCall) await updateDoc(doc(db, 'calls', activeCall.id), { participants: arrayRemove(userId) }); };
    const admitParticipant = async (userId: string) => { if (activeCall) await updateDoc(doc(db, 'calls', activeCall.id), { waitingRoom: arrayRemove(userId), participants: arrayUnion(userId) }); };
    const denyParticipant = async (userId: string) => { if (activeCall) await updateDoc(doc(db, 'calls', activeCall.id), { waitingRoom: arrayRemove(userId) }); };
    const remoteMute = async (targetUid: string) => { if (!activeCall || activeCall.adminId !== currentUser?.uid) return; await updateDoc(doc(db, 'calls', activeCall.id), { mutedParticipants: arrayUnion(targetUid) }); };

    return (
        <div className="CallProvider">
            <CallContext.Provider value={{
                activeCall, incomingCall, waitingForHost, localStream, remoteStreams,
                isMuted, isCameraOff, isScreenSharing, isRecording, isNoiseCancelled, callStatusInfo, facingMode, isPreJoin,
                isMinimized, setIsMinimized,
                startCall, startInstantMeeting, joinMeeting, scheduleMeeting, acceptMeeting, declineMeeting, answerCall, rejectCall, endCall,
                toggleMute, toggleCamera, switchCamera, toggleScreenShare, toggleRecording, toggleNoiseCancellation,
                addParticipant, kickParticipant, admitParticipant, denyParticipant,
                enterCall, cancelJoin, remoteMute, requestVideoUpgrade, respondVideoUpgrade
            }}>
                {children}
            </CallContext.Provider>
        </div>
    );
};
