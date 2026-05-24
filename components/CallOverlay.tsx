import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import { CallContext } from '../context/CallContext';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import type { UserProfile } from '../types';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import Modal from './ui/Modal';
import Input from './ui/Input';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const CallTimer: React.FC = () => {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setSeconds(s => s + 1), 1000);
        return () => clearInterval(interval);
    }, []);
    const formatTime = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    return <span className="font-mono text-sm sm:text-lg font-bold tracking-wider opacity-90">{formatTime(seconds)}</span>;
};

const PulsingAvatar: React.FC<{ user: UserProfile | null, size?: 'md' | 'lg' }> = ({ user, size = 'md' }) => {
    const getInitials = (name: string = "") => {
        if (!name) return "U";
        return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    };

    return (
        <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 bg-brand-primary/20 rounded-full animate-ping"></div>
            <div className="absolute inset-[-10px] bg-brand-primary/10 rounded-full animate-pulse delay-75"></div>
            <div className={`relative ${size === 'lg' ? 'w-32 h-32' : 'w-24 h-24'} rounded-full border-4 border-brand-primary overflow-hidden shadow-2xl z-10 bg-neutral-800 flex items-center justify-center`}>
                {user?.avatarUrl ? (
                    <img src={user.avatarUrl} className="w-full h-full object-cover" alt={user.name}/>
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white uppercase bg-gradient-to-br from-brand-primary to-brand-secondary">
                        {getInitials(user?.name)}
                    </div>
                )}
            </div>
        </div>
    );
};

const VideoFrame: React.FC<{ 
    stream: MediaStream | null; 
    user: UserProfile | null; 
    isLocal?: boolean; 
    isCameraOff: boolean;
    callType: 'audio' | 'video';
    isScreenSharing?: boolean;
    isAdmin?: boolean; 
    onKick?: () => void;
    onMute?: () => void;
    isMeetingMode?: boolean;
    isVisible?: boolean;
}> = ({ stream, user, isLocal, isCameraOff, callType, isScreenSharing, isAdmin, onKick, onMute, isMeetingMode, isVisible = true }) => {
    const videoElRef = useRef<HTMLVideoElement>(null);
    
    useEffect(() => {
        if (videoElRef.current && stream) {
            if (isVisible) {
                videoElRef.current.srcObject = stream;
                videoElRef.current.muted = !!isLocal;
                videoElRef.current.play().catch(() => {});
            } else {
                videoElRef.current.srcObject = null;
            }
        }
    }, [stream, isCameraOff, isLocal, isVisible]);

    const hasVideoTrack = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled;
    const showVideo = isVisible && (callType === 'video' || hasVideoTrack) && !isCameraOff;
    const shouldMirror = isLocal && !isScreenSharing;
    const aspectClass = isMeetingMode ? 'aspect-video' : 'aspect-[3/4]';

    return (
        <div className={`relative w-full h-full bg-[#0a0a0a] overflow-hidden flex items-center justify-center rounded-[1rem] border border-white/5 group shadow-2xl transition-all duration-300 ${aspectClass}`}>
             <video 
                ref={videoElRef} autoPlay playsInline 
                className={`absolute inset-0 w-full h-full object-cover bg-black ${shouldMirror ? 'transform scale-x-[-1]' : ''} ${showVideo ? 'block' : 'hidden'}`}
            />
             {(!showVideo || !isVisible) && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-10">
                     <PulsingAvatar user={user} size="md" />
                     <p className="mt-4 text-white font-black text-[10px] sm:text-sm tracking-tight uppercase px-2 text-center truncate w-full">{user?.name || "Usuario"}</p>
                 </div>
             )}
             <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-[9px] font-black px-3 py-1 rounded-lg z-20 flex items-center gap-2 border border-white/10 shadow-lg">
                 <div className={`w-2 h-2 rounded-full ${stream ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 {isLocal ? "TÚ" : user?.name?.toUpperCase()} 
                 {isScreenSharing && <span className="text-brand-accent text-[8px] uppercase font-black px-1.5 py-0.5 bg-brand-primary/20 rounded">Pantalla</span>}
             </div>
             {isAdmin && !isLocal && (
                 <div className="absolute top-2 right-2 z-30 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={onMute} className="p-2 bg-neutral-800 text-white rounded-full shadow-lg border border-white/10 hover:bg-neutral-700"><Icon name="micSlash" className="w-4 h-4"/></button>
                     <button onClick={onKick} className="p-2 bg-red-600 text-white rounded-full shadow-lg border border-white/10 hover:bg-red-700"><Icon name="close" className="w-4 h-4"/></button>
                 </div>
             )}
        </div>
    );
};

const AddParticipantModal: React.FC<{ isOpen: boolean; onClose: () => void; onAdd: (uid: string) => void }> = ({ isOpen, onClose, onAdd }) => {
    const { allUsers, currentUser, userProfile } = useContext(AppContext);
    const [search, setSearch] = useState('');
    const circle = userProfile.circle || [];
    const filtered = allUsers.filter(u => u.uid !== currentUser?.uid && (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Invitar a la Llamada">
            <div className="space-y-4">
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contacto..." />
                <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                    {filtered.map(u => (
                        <div key={u.uid} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl">
                            <div className="flex items-center gap-3">
                                <img src={u.avatarUrl || `https://ui-avatars.com/api/?name=${u.name}`} className="w-10 h-10 rounded-full" alt={u.name} />
                                <div><p className="font-bold text-sm">{u.name}</p><p className="text-[10px] text-neutral-500 uppercase">{circle.includes(u.uid) ? 'Círculo' : 'Goatify'}</p></div>
                            </div>
                            <Button size="sm" onClick={() => { onAdd(u.uid); onClose(); }}>Invitar</Button>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

const ParticipantsListModal: React.FC<{ isOpen: boolean; onClose: () => void; participants: UserProfile[]; isAdmin: boolean; onKick: (id: string) => void }> = ({ isOpen, onClose, participants, isAdmin, onKick }) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Lista de Participantes">
            <div className="space-y-3">
                {participants.map(user => (
                    <div key={user.uid} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-2xl border border-neutral-100 dark:border-neutral-700">
                        <div className="flex items-center gap-3">
                            <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-10 h-10 rounded-full object-contain" />
                            <span className="font-bold text-sm">{user.name}</span>
                        </div>
                        {isAdmin && user.uid !== (participants[0]?.uid) && (
                            <button onClick={() => onKick(user.uid)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                                <Icon name="trash" className="w-4 h-4"/>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </Modal>
    );
};

const CallOverlay: React.FC = () => {
    const { 
        activeCall, incomingCall, answerCall, rejectCall, endCall, 
        localStream, remoteStreams, isMuted, toggleMute, isCameraOff, toggleCamera, 
        switchCamera, isScreenSharing, toggleScreenShare, isRecording, toggleRecording, 
        kickParticipant, isPreJoin, enterCall, cancelJoin, addParticipant, 
        remoteMute, respondVideoUpgrade, isMinimized, setIsMinimized,
        waitingForHost
    } = useContext(CallContext);
    const { userProfile, currentUser, setToastNotification } = useContext(AppContext);

    const [showChat, setShowChat] = useState(false);
    const [showAddParticipant, setShowAddParticipant] = useState(false);
    const [showParticipantsList, setShowParticipantsList] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<any[]>([]);
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);

    const [minPos, setMinPos] = useState({ x: window.innerWidth - 150, y: window.innerHeight - 250 });
    const [isDraggingMin, setIsDraggingMin] = useState(false);
    const dragStartOffset = useRef({ x: 0, y: 0 });

    const handleMinStart = (clientX: number, clientY: number) => {
        setIsDraggingMin(true);
        dragStartOffset.current = { x: clientX - minPos.x, y: clientY - minPos.y };
    };
    const handleMinMove = (clientX: number, clientY: number) => {
        if (!isDraggingMin) return;
        setMinPos({
            x: Math.max(0, Math.min(clientX - dragStartOffset.current.x, window.innerWidth - 140)),
            y: Math.max(0, Math.min(clientY - dragStartOffset.current.y, window.innerHeight - 220))
        });
    };
    const handleMinEnd = () => setIsDraggingMin(false);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleMinMove(e.clientX, e.clientY);
        const onMouseUp = () => handleMinEnd();
        if (isDraggingMin) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDraggingMin, minPos]);

    const prevMessagesLength = useRef(0);

    useEffect(() => {
        if (!activeCall) return;
        const q = query(collection(db, 'calls', activeCall.id, 'messages'), orderBy('timestamp', 'asc'));
        return onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => d.data());
            setMessages(list);
            if (!showChat && list.length > prevMessagesLength.current && list.length > 0) {
                const lastMsg = list[list.length - 1];
                if (lastMsg.senderId !== currentUser?.uid) setUnreadMessages(prev => prev + 1);
            }
            prevMessagesLength.current = list.length;
        });
    }, [activeCall?.id, showChat, currentUser?.uid]);

    useEffect(() => { if (showChat) setUnreadMessages(0); }, [showChat]);

    const handleSendChatMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !activeCall) return;
        await addDoc(collection(db, 'calls', activeCall.id, 'messages'), { senderId: currentUser?.uid, senderName: userProfile.name, text: chatInput, timestamp: serverTimestamp() });
        setChatInput('');
    };

    const activeParticipants = useMemo(() => {
        if (!activeCall) return [];
        return activeCall.participants.map((uid: string) => {
            if (uid === currentUser?.uid) return userProfile;
            return (window as any).allUsersCached?.find((u:any) => u.uid === uid) || { uid, name: 'Participante', avatarUrl: null };
        });
    }, [activeCall?.participants, currentUser, userProfile]);

    const isMobile = window.innerWidth < 768;
    const itemsPerPage = isMobile ? 4 : 12;
    const totalPages = Math.ceil(activeParticipants.length / itemsPerPage);
    const paginatedParticipants = useMemo(() => {
        const start = currentPage * itemsPerPage;
        return activeParticipants.slice(start, start + itemsPerPage);
    }, [activeParticipants, currentPage, itemsPerPage]);

    const handleCopyLink = () => {
        if (!activeCall) return;
        const link = `${window.location.origin}/#/calls/${activeCall.id}`;
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Enlace Copiado", message: "Link de reunión en portapapeles.", icon: "copy" });
    };

    const isMeetingMode = activeCall ? !!activeCall.isMeeting : false;

    if (activeCall && !isPreJoin) {
        const isAdmin = activeCall.adminId === currentUser?.uid;

        if (isMinimized) {
            return (
                <div 
                    onMouseDown={(e) => handleMinStart(e.clientX, e.clientY)}
                    onTouchStart={(e) => handleMinStart(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchMove={(e) => handleMinMove(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchEnd={handleMinEnd}
                    style={{ left: minPos.x, top: minPos.y }}
                    className="fixed z-[1000000] w-32 h-48 bg-black rounded-[2rem] shadow-2xl border-4 border-brand-primary overflow-hidden cursor-move animate-scale-in touch-none select-none"
                >
                    <button 
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setIsMinimized(false)} 
                        className="absolute top-2 right-2 z-20 p-1.5 bg-brand-primary text-white rounded-full shadow-lg"
                    >
                        <Icon name="expand" className="w-4 h-4"/>
                    </button>
                    <VideoFrame isVisible={true} stream={localStream} user={userProfile} isLocal isCameraOff={isCameraOff} callType={activeCall.type} isMeetingMode={isMeetingMode} />
                </div>
            );
        }

        if (activeCall.status === 'ringing' && activeCall.adminId === currentUser?.uid) {
            return (
                <div className="fixed inset-0 z-[1000000] bg-[#050505] flex flex-col items-center justify-center font-sans p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                    <PulsingAvatar user={null} size="lg" />
                    <h2 className="text-white text-4xl font-black mt-10 mb-2 uppercase tracking-tighter text-center">Conectando...</h2>
                    <p className="text-neutral-500 font-bold uppercase tracking-widest text-center animate-pulse">Esperando a que se unan</p>
                    <div className="mt-20">
                        <button onClick={endCall} className="p-7 bg-red-600 text-white rounded-full shadow-[0_0_40px_rgba(220,38,38,0.4)] hover:scale-110 transition-all border-4 border-white/10"><Icon name="close" className="w-10 h-10"/></button>
                    </div>
                </div>
            );
        }
        
        return (
            <div className="fixed inset-0 z-[1000000] bg-[#050505] flex flex-col h-full w-full overflow-hidden font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <AddParticipantModal isOpen={showAddParticipant} onClose={() => setShowAddParticipant(false)} onAdd={addParticipant} />
                <ParticipantsListModal isOpen={showParticipantsList} onClose={() => setShowParticipantsList(false)} participants={activeParticipants} isAdmin={isAdmin} onKick={(uid) => kickParticipant(uid)} />

                <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex justify-between items-center z-[10000] pointer-events-none bg-gradient-to-b from-black/90 via-black/40 to-transparent pt-[calc(env(safe-area-inset-top)+1rem)]">
                    <div className="flex items-center gap-4 pointer-events-auto">
                        <div className="bg-brand-primary p-2.5 rounded-2xl shadow-xl shadow-brand-primary/30 border border-white/20"><Icon name="goat" className="w-6 h-6 text-white"/></div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-white font-black text-sm sm:text-xl tracking-tighter uppercase truncate max-w-[120px] sm:max-w-xs">{activeCall.title || "Goatify Meet"}</h3>
                                {isMeetingMode && (
                                    <button onClick={handleCopyLink} className="p-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all border border-white/10" title="Copiar Link">
                                        <Icon name="copy" className="w-3 h-3"/>
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-green-400 text-[9px] font-black uppercase tracking-widest mt-0.5">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> <CallTimer />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 items-center pointer-events-auto">
                        <button onClick={() => setShowAddParticipant(true)} className="p-3 bg-white/10 backdrop-blur-xl text-white rounded-2xl hover:bg-brand-primary transition-all shadow-xl border border-white/10" title="Invitar"><Icon name="plus" className="w-5 h-5"/></button>
                        <button onClick={() => setShowParticipantsList(true)} className="p-3 bg-white/10 backdrop-blur-xl text-white rounded-2xl hover:bg-brand-primary transition-all shadow-xl border border-white/10 relative" title="Participantes"><Icon name="users" className="w-5 h-5" />{activeParticipants.length > 1 && <span className="absolute -top-1 -right-1 bg-brand-primary text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white/20 shadow-lg">{activeParticipants.length}</span>}</button>
                        <button onClick={() => setIsMinimized(true)} className="p-3 bg-white/10 backdrop-blur-xl text-white rounded-2xl hover:bg-neutral-800 transition-all shadow-xl border border-white/10" title="Minimizar"><Icon name="chevronDown" className="w-5 h-5" /></button>
                    </div>
                </div>

                <div className="flex-1 w-full h-full relative flex flex-col items-center justify-center p-2 sm:p-6 overflow-hidden pt-28">
                    <div className={`grid gap-3 sm:gap-6 w-full h-full max-w-7xl mx-auto transition-all duration-700 flex-1 content-center ${
                        paginatedParticipants.length === 1 ? 'grid-cols-1 max-w-4xl' : 
                        isMeetingMode ? (isMobile ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2 grid-rows-auto') : 
                        (isMobile ? 'grid-cols-1 grid-rows-2' : 'grid-cols-3 xl:grid-cols-4')
                    }`}>
                        {paginatedParticipants.map((user) => {
                            const isLocal = user.uid === currentUser?.uid;
                            return (
                                <div key={user.uid} className={`relative rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 h-full min-h-[160px] transform hover:scale-[1.01] transition-all duration-500 ${isMeetingMode ? 'aspect-video' : 'aspect-[3/4]'}`}>
                                    <VideoFrame isVisible={true} stream={isLocal ? localStream : (remoteStreams.get(user.uid) || null)} user={user as UserProfile} isLocal={isLocal} isCameraOff={isLocal ? isCameraOff : false} callType={activeCall.type} isScreenSharing={isLocal ? isScreenSharing : false} isAdmin={isAdmin} onKick={() => kickParticipant(user.uid)} onMute={() => remoteMute(user.uid)} isMeetingMode={isMeetingMode} />
                                </div>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center gap-4 mt-6 py-3 px-8 bg-black/60 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 z-30 shadow-2xl">
                            <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="p-2 text-white disabled:opacity-30 hover:bg-white/10 rounded-full transition-all"><Icon name="chevronLeft" className="w-5 h-5"/></button>
                            <span className="text-[11px] text-white font-black uppercase tracking-[0.3em]">Página {currentPage + 1} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage === totalPages - 1} className="p-2 text-white disabled:opacity-30 hover:bg-white/10 rounded-full transition-all"><Icon name="chevronLeft" className="w-5 h-5 rotate-180"/></button>
                        </div>
                    )}
                </div>

                <div className="flex-none p-6 lg:p-12 bg-gradient-to-t from-black via-black/80 to-transparent flex justify-center items-center z-[10001] pointer-events-none pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                    <div className="flex items-center gap-3 bg-[#0a0a0a]/90 backdrop-blur-3xl px-4 sm:px-6 py-4 rounded-[4rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] pointer-events-auto transform hover:scale-[1.02] transition-transform max-w-[95vw]">
                        <button onClick={() => setShowChat(!showChat)} className={`p-4 rounded-full transition-all relative group ${showChat ? 'bg-brand-primary text-white' : 'bg-white/5 text-neutral-400 hover:bg-white/10'}`}><Icon name="message" className="w-6 h-6"/>{unreadMessages > 0 && <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#0a0a0a] shadow-lg animate-bounce">{unreadMessages}</span>}</button>
                        <div className="w-px h-8 bg-white/10 mx-1"></div>
                        <button onClick={toggleMute} className={`p-4 rounded-full transition-all shadow-xl hover:scale-110 group ${isMuted ? 'bg-red-600 text-white animate-pulse' : 'bg-white/5 text-white hover:bg-white/10'}`}><Icon name={isMuted ? "micSlash" : "mic"} className="w-6 h-6"/></button>
                        <button onClick={toggleCamera} className={`p-4 rounded-full transition-all shadow-xl hover:scale-110 group ${isCameraOff ? 'bg-red-600 text-white' : 'bg-white/5 text-white hover:bg-white/10'}`}><Icon name="video" className="w-6 h-6"/></button>
                        <button onClick={switchCamera} className={`p-4 rounded-full transition-all shadow-xl hover:scale-110 group bg-white/5 text-white hover:bg-white/10 ${activeCall.type !== 'video' ? 'hidden' : ''}`}><Icon name="sync" className="w-6 h-6" /></button>
                        <button onClick={toggleScreenShare} className={`p-4 rounded-full transition-all shadow-xl hover:scale-110 group ${isScreenSharing ? 'bg-blue-600 text-white shadow-blue-500/40' : 'bg-white/5 text-white hover:bg-white/10'}`}><Icon name="monitor" className="w-6 h-6"/></button>
                        {isAdmin && <button onClick={toggleRecording} className={`p-4 rounded-full transition-all shadow-xl hover:scale-110 group ${isRecording ? 'bg-red-600 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.5)]' : 'bg-white/5 text-white hover:bg-white/10'}`}><Icon name="radio" className="w-6 h-6"/></button>}
                        <div className="w-px h-8 bg-white/10 mx-1"></div>
                        <button onClick={endCall} className="p-5 bg-red-600 text-white rounded-full shadow-[0_10px_40px_rgba(220,38,38,0.4)] active:scale-95 transition-all transform hover:scale-110 border-2 border-white/20"><Icon name="phoneOff" className="w-7 h-7"/></button>
                    </div>
                </div>

                {showChat && (
                    <div className="absolute top-24 right-4 bottom-32 w-full sm:w-96 bg-black/90 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 z-[10002] flex flex-col shadow-2xl animate-slide-in-right overflow-hidden mt-[env(safe-area-inset-top)]">
                         <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                             <div className="flex items-center gap-2"><h4 className="text-white font-black uppercase text-xs tracking-[0.2em]">Chat de Reunión</h4><span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse"></span></div>
                             <button onClick={() => setShowChat(false)} className="text-neutral-500 hover:text-white transition-colors p-2"><Icon name="close" className="w-5 h-5"/></button>
                         </div>
                         <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                             {messages.map((m, i) => {
                                 const isMe = m.senderId === currentUser?.uid;
                                 return (
                                     <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-subtle-slide-in-up`}>
                                         <div className={`p-4 rounded-[1.5rem] text-sm max-w-[85%] shadow-md ${isMe ? 'bg-brand-primary text-white rounded-tr-none' : 'bg-white/10 text-white rounded-tl-none border border-white/5'}`}>
                                             {!isMe && <p className="font-black text-[9px] text-brand-accent mb-1.5 uppercase tracking-wider">{m.senderName}</p>}
                                             <p className="font-medium leading-relaxed">{m.text}</p>
                                         </div>
                                         <span className="text-[8px] font-black text-neutral-500 mt-1 uppercase tracking-widest px-2">{m.timestamp ? new Date(m.timestamp.seconds * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Ahora'}</span>
                                     </div>
                                 );
                             })}
                         </div>
                         <form onSubmit={handleSendChatMessage} className="p-5 border-t border-white/10 bg-white/5">
                             <div className="bg-neutral-900 rounded-3xl flex items-center p-2 shadow-inner border border-white/5">
                                 <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Mensaje a todos..." className="flex-1 bg-transparent border-none text-white text-sm px-4 py-2 focus:ring-0 placeholder-neutral-600" />
                                 <button type="submit" className="p-3 bg-brand-primary text-white rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-all"><Icon name="send" className="w-5 h-5 translate-x-0.5"/></button>
                             </div>
                         </form>
                    </div>
                )}
            </div>
        );
    }

    if (incomingCall) {
        return (
            <div className="fixed bottom-24 right-6 left-6 sm:left-auto z-[1000001] w-auto sm:w-[380px] bg-white/95 dark:bg-[#111]/95 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.5)] p-8 text-center animate-slide-in-right border border-neutral-200 dark:border-white/10 backdrop-blur-2xl group overflow-hidden mb-[env(safe-area-inset-bottom)]">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-transparent opacity-50"></div>
                <div className="w-24 h-24 mx-auto mb-6 relative z-10">
                     <div className="absolute inset-0 bg-brand-primary rounded-full animate-ping opacity-20"></div>
                     <img src={incomingCall.caller.avatarUrl || `https://ui-avatars.com/api/?name=${incomingCall.caller.name}`} className="w-full h-full rounded-full object-contain ring-4 ring-brand-primary shadow-2xl relative z-20" alt="Caller"/>
                     <div className="absolute bottom-0 right-0 bg-brand-primary text-white p-2 rounded-full border-4 border-white dark:border-[#111] shadow-lg animate-bounce z-30"><Icon name={incomingCall.type === 'video' ? "video" : "phone"} className="w-5 h-5"/></div>
                </div>
                <div className="relative z-10">
                    <h3 className="text-2xl font-black mb-1 text-neutral-900 dark:text-white uppercase tracking-tighter truncate">{incomingCall.caller.name}</h3>
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.4em] mb-8">Llamada Entrante</p>
                    <div className="flex justify-center gap-8">
                        <button onClick={rejectCall} className="p-5 bg-red-500 text-white rounded-full shadow-[0_10px_30px_rgba(239,68,68,0.4)] active:scale-90 transition-all border-2 border-white/20"><Icon name="close" className="w-7 h-7"/></button>
                        <button onClick={answerCall} className="p-5 bg-green-500 text-white rounded-full shadow-[0_10px_30px_rgba(34,197,94,0.4)] active:scale-90 transition-all border-2 border-white/20"><Icon name="phone" className="w-7 h-7"/></button>
                    </div>
                </div>
            </div>
        );
    }
    
    if (waitingForHost) {
        return (
            <div className="fixed inset-0 z-[1000000] bg-black/95 flex items-center justify-center p-4 backdrop-blur-2xl">
                <div className="text-center text-white max-w-sm w-full bg-neutral-900/60 p-12 rounded-[3.5rem] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] flex flex-col items-center">
                    <div className="mb-10"><Spinner text="Cargando acceso..." className="text-brand-primary" /></div>
                    <PulsingAvatar user={userProfile} size="lg" />
                    <h2 className="text-3xl font-black mt-10 mb-2 tracking-tighter uppercase italic">Sala de Espera</h2>
                    <p className="text-neutral-500 text-xs font-bold uppercase tracking-[0.3em] mb-12">El anfitrión te admitirá pronto</p>
                    <Button onClick={cancelJoin} variant="secondary" className="w-full py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest bg-white/5 border-white/10 text-white hover:bg-red-600 transition-all">Abandonar</Button>
                </div>
            </div>
        );
    }

    if (isPreJoin && activeCall) {
        return (
            <div className="fixed inset-0 z-[1000000] bg-[#050505] flex flex-col items-center justify-center p-4 sm:p-10 font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
                <div className="max-w-6xl w-full flex flex-col lg:flex-row gap-12 lg:gap-24 items-center justify-center">
                    {activeCall.type === 'audio' ? (
                         <div className="w-full lg:w-1/2 flex flex-col items-center text-center space-y-10 animate-fade-in">
                            <PulsingAvatar user={userProfile} size="lg" />
                            <div className="space-y-3">
                                <h3 className="text-white font-black text-4xl uppercase tracking-tighter leading-none">Modo de Audio</h3>
                                <p className="text-neutral-500 text-sm font-bold uppercase tracking-[0.4em]">Goatify Meet HD</p>
                            </div>
                         </div>
                    ) : (
                        <div className="w-full lg:w-2/3 aspect-video bg-neutral-900 rounded-[3rem] overflow-hidden relative shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/5 group">
                            <VideoFrame isVisible={true} stream={localStream} user={userProfile} isLocal isCameraOff={isCameraOff} callType={activeCall.type} isMeetingMode={isMeetingMode} />
                            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={toggleCamera} className={`p-4 rounded-2xl shadow-xl transition-all ${isCameraOff ? 'bg-red-600' : 'bg-black/60 backdrop-blur-md border border-white/20'} text-white`}><Icon name="video" className="w-6 h-6"/></button>
                            </div>
                        </div>
                    )}
                    <div className="w-full lg:w-1/3 text-center lg:text-left space-y-10">
                        <div className="space-y-4"><h2 className="text-5xl sm:text-7xl font-black text-white leading-none tracking-tighter">¿Todo <br/> listo?</h2><p className="text-neutral-400 font-medium text-lg">Únete a la conversación ahora.</p></div>
                        <div className="flex flex-col gap-5">
                            <Button onClick={enterCall} className="w-full py-7 rounded-[2rem] text-2xl font-black bg-brand-primary text-white border-none shadow-[0_20px_50px_rgba(124,58,237,0.4)] transition-all hover:scale-[1.03] active:scale-95">Entrar Ahora</Button>
                            <button onClick={cancelJoin} className="text-neutral-500 hover:text-white text-xs font-black uppercase tracking-[0.4em] transition-all py-2 text-center w-full">Volver al Dashboard</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default CallOverlay;