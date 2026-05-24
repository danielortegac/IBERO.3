import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Icon from './Icon';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { CallSession, CallRecording } from '../types';

const MeetsInfoModal: React.FC = () => {
    const { isMeetsInfoOpen, setMeetsInfoOpen, setProModalOpen, setScheduleModalOpen, userProfile, setCurrentView, setActiveHubView, currentUser, setToastNotification, deleteCallRecording, setMailDraft } = useContext(AppContext);
    const { joinMeeting, startInstantMeeting } = useContext(CallContext);
    const [upcomingMeetings, setUpcomingMeetings] = useState<CallSession[]>([]);
    const [recordings, setRecordings] = useState<CallRecording[]>([]);
    const [isGeneratingInstant, setIsGeneratingInstant] = useState(false);

    useEffect(() => {
        if (!currentUser || !isMeetsInfoOpen) return;
        
        // Fetch Upcoming
        const q = query(
            collection(db, 'calls'), 
            where('participants', 'array-contains', currentUser.uid),
            where('status', 'in', ['scheduled', 'active']),
            orderBy('scheduledAt', 'asc')
        );

        const unsub = onSnapshot(q, (snap) => {
            setUpcomingMeetings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallSession)));
        });

        // Fetch Recordings
        const qRec = query(collection(db, `users/${currentUser.uid}/recordings`), orderBy('createdAt', 'desc'));
        const unsubRec = onSnapshot(qRec, (snap) => {
            setRecordings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallRecording)));
        });

        return () => { unsub(); unsubRec(); };
    }, [currentUser, isMeetsInfoOpen]);

    if (!isMeetsInfoOpen) return null;

    const isPremium = userProfile.plan === 'premium';

    const handleInstantMeeting = async () => {
        setIsGeneratingInstant(true);
        try {
            const link = await startInstantMeeting();
            setCurrentView('globalCalendar');
            window.location.hash = 'globalCalendar';
            setMeetsInfoOpen(false);
            
            const callId = link.split('/calls/')[1];
            if (callId) joinMeeting(callId);
            
            setToastNotification({ 
                title: "Reunión Lista", 
                message: "Se ha generado una sala HD. Copia el link arriba.", 
                icon: 'check' 
            });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo generar la sala.", icon: 'close' });
        } finally {
            setIsGeneratingInstant(false);
        }
    };

    const handleScheduleMeetingNav = () => {
        setCurrentView('globalCalendar');
        window.location.hash = 'globalCalendar';
        setScheduleModalOpen(true);
        setMeetsInfoOpen(false);
    };

    const handleGoToMessages = () => {
        setCurrentView('hub');
        setActiveHubView('messages');
        window.location.hash = 'hub/messages';
        setMeetsInfoOpen(false);
    };

    const handleGoToCalendar = () => {
        setCurrentView('globalCalendar');
        window.location.hash = 'globalCalendar';
        setMeetsInfoOpen(false);
    };

    const handleCopyLink = (id: string) => {
        const link = `${window.location.origin}/#/calls/${id}`;
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Copiado", message: "Enlace de reunión copiado.", icon: 'copy' });
    };

    const handleDeleteRecording = (rec: CallRecording) => {
        if (window.confirm("¿Eliminar esta grabación permanentemente?")) {
            deleteCallRecording(rec.id, rec.url, rec.sizeBytes || 0);
        }
    };

    const mirrorShineEffect = (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
    );

    return (
        <Modal 
            isOpen={isMeetsInfoOpen} 
            onClose={() => setMeetsInfoOpen(false)} 
            title="Goatify Meets Hub"
            className="max-w-5xl !rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl"
            noPadding
        >
            <div className="flex flex-col h-full max-h-[92vh] bg-white dark:bg-[#050505] font-sans">
                {/* Premium Visual Header */}
                <div className="relative flex-shrink-0 h-48 sm:h-56 bg-gradient-to-br from-[#1a0b35] via-[#4C1D95] to-black flex items-center px-6 sm:px-10 overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
                    <div className="absolute top-[-50%] right-[-10%] w-80 h-80 bg-brand-primary/30 rounded-full blur-[110px] animate-pulse"></div>
                    
                    <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 animate-fade-in">
                        <div className="p-3 sm:p-5 bg-white/10 backdrop-blur-2xl rounded-2xl sm:rounded-[2.5rem] border border-white/20 shadow-2xl transform hover:scale-105 transition-transform">
                             <Icon name="video" className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                        </div>
                        <div className="text-center sm:text-left">
                            <h2 className="text-3xl sm:text-6xl font-black tracking-tighter uppercase leading-none text-white">
                                GOATIFY <span className="text-brand-accent">MEETS</span>
                            </h2>
                            <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-brand-accent mt-2 sm:mt-3">Comunicación Empresarial de Alto Impacto</p>
                            <p className="hidden sm:block text-xs text-white/60 max-w-lg mt-2 font-medium">Ecosistema de videollamadas HD con persistencia de enlaces, grabación segura en la nube y optimización para cierres comerciales.</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-8 sm:space-y-12 custom-scrollbar">
                    {/* Action Cards - lg:grid-cols-4 for thinner desktop look */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                        <button 
                            onClick={handleInstantMeeting}
                            disabled={isGeneratingInstant}
                            className="p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] bg-brand-primary text-white text-left transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 group relative overflow-hidden disabled:opacity-50"
                        >
                            {mirrorShineEffect}
                            <div className="absolute top-0 right-0 w-24 sm:w-40 h-24 sm:h-40 bg-white/10 rounded-full -mr-8 sm:-mr-12 -mt-8 sm:-mt-12 blur-2xl group-hover:bg-white/20 transition-colors"></div>
                            <Icon name="video" className="w-6 h-6 sm:w-10 sm:h-10 mb-2 sm:mb-6 group-hover:rotate-12 transition-transform duration-500" />
                            <h4 className="font-black text-xs sm:text-xl uppercase mb-1 sm:mb-2">{isGeneratingInstant ? "..." : "INICIAR AHORA"}</h4>
                            <p className="hidden sm:block text-[10px] lg:text-xs text-white/70 font-medium leading-relaxed">Genera una sala HD instantánea.</p>
                        </button>

                        <button 
                            onClick={handleScheduleMeetingNav}
                            className="p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] bg-neutral-900 text-white text-left transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 group relative overflow-hidden border border-white/5"
                        >
                            {mirrorShineEffect}
                            <div className="absolute top-0 right-0 w-24 sm:w-40 h-24 sm:h-40 bg-brand-primary/20 rounded-full -mr-8 sm:-mr-12 -mt-8 sm:-mt-12 blur-2xl"></div>
                            <Icon name="calendar" className="w-6 h-6 sm:w-10 sm:h-10 mb-2 sm:mb-6 group-hover:rotate-12 transition-transform duration-500" />
                            <h4 className="font-black text-xs sm:text-xl uppercase mb-1 sm:mb-2">AGENDAR REUNIÓN</h4>
                            <p className="hidden sm:block text-[10px] lg:text-xs text-white/70 font-medium leading-relaxed">Programa sesiones sincronizadas.</p>
                        </button>

                        <button 
                            onClick={handleGoToMessages}
                            className="p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 text-white text-left transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 group relative overflow-hidden border border-white/10"
                        >
                            {mirrorShineEffect}
                            <div className="absolute top-0 right-0 w-24 sm:w-40 h-24 sm:h-40 bg-white/5 rounded-full -mr-8 sm:-mr-12 -mt-8 sm:-mt-12 blur-2xl"></div>
                            <Icon name="message" className="w-6 h-6 sm:w-10 sm:h-10 mb-2 sm:mb-6 group-hover:rotate-12 transition-transform duration-500" />
                            <h4 className="font-black text-xs sm:text-xl uppercase mb-1 sm:mb-2">IR A MENSAJES</h4>
                            <p className="hidden sm:block text-[10px] lg:text-xs text-white/70 font-medium leading-relaxed">Accede a tus chats directos.</p>
                        </button>

                        <button 
                            onClick={handleGoToCalendar}
                            className="p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-[2.5rem] bg-orange-600 text-white text-left transition-all hover:scale-[1.02] hover:shadow-2xl active:scale-95 group relative overflow-hidden border border-white/5"
                        >
                            {mirrorShineEffect}
                            <div className="absolute top-0 right-0 w-24 sm:w-40 h-24 sm:h-40 bg-white/10 rounded-full -mr-8 sm:-mr-12 -mt-8 sm:-mt-12 blur-2xl"></div>
                            <Icon name="calendar" className="w-6 h-6 sm:w-10 sm:h-10 mb-2 sm:mb-6 group-hover:rotate-12 transition-transform duration-500" />
                            <h4 className="font-black text-xs sm:text-xl uppercase mb-1 sm:mb-2">IR AL CALENDARIO</h4>
                            <p className="hidden sm:block text-[10px] lg:text-xs text-white/70 font-medium leading-relaxed">Visualiza tu agenda completa.</p>
                        </button>
                    </div>

                    {/* Upcoming Meetings Section */}
                    <div>
                        <h3 className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-neutral-400 flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
                            <span className="w-8 sm:w-12 h-px bg-neutral-200 dark:bg-neutral-800"></span>
                            PRÓXIMAS SESIONES
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:gap-4">
                            {upcomingMeetings.length > 0 ? upcomingMeetings.map(m => (
                                <div key={m.id} className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 flex items-center justify-between group hover:border-brand-primary/50 transition-all shadow-sm">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <p className="font-black text-xs sm:text-base truncate text-neutral-900 dark:text-white uppercase tracking-tight">{m.title || "Reunión de Proyecto"}</p>
                                            {m.status === 'active' && <span className="flex h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-green-500 animate-ping"></span>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 sm:mt-2">
                                            <p className="text-[8px] sm:text-[11px] text-brand-primary font-black uppercase bg-brand-primary/10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg">
                                                {new Date(m.scheduledAt!).toLocaleDateString([], {day: 'numeric', month: 'short'})} • {new Date(m.scheduledAt!).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                            </p>
                                            <span className="text-[8px] sm:text-[10px] text-neutral-400 font-bold uppercase tracking-[0.1em]">{m.durationMinutes || 30} MIN</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 sm:gap-3 ml-2">
                                        <button 
                                            onClick={() => {
                                                const guestEmail = m.guestInfo?.email || '';
                                                const notes = m.description || m.guestInfo?.notes || '';
                                                setMeetsInfoOpen(false);
                                                setMailDraft({
                                                    to: guestEmail,
                                                    subject: `Minuta de la Reunión: ${m.title || 'Sesión programada'}`,
                                                    htmlBody: `
                                                        <div style="text-align:center; margin-bottom: 20px;">
                                                            <h2 style="margin:0;color:#111827;font-size:24px;">Minuta de Reunión</h2>
                                                            <p style="margin:5px 0 0;color:#6B7280;font-size:14px;text-transform:uppercase;letter-spacing:1px;">${new Date(m.scheduledAt!).toLocaleDateString()}</p>
                                                        </div>
                                                        <p style="color:#374151;">Hola ${m.guestInfo?.name || 'equipo'},</p>
                                                        <p style="color:#374151;">A continuación, el resumen y las notas tomadas durante nuestra sesión:</p>
                                                        <div style="background:#F3F4F6;padding:20px;border-radius:12px;margin:20px 0;border-left:4px solid #10B981;">
                                                            <p style="margin:0;color:#374151;white-space:pre-wrap;">${notes || '[Escribe los detalles aquí]'}</p>
                                                        </div>
                                                        <p style="color:#374151;">Por favor confirmar recepción y cualquier duda adicional.</p>
                                                    `
                                                });
                                                setCurrentView('mail');
                                            }}
                                            className="p-2 sm:p-3 text-neutral-400 hover:text-brand-primary hover:bg-white dark:hover:bg-black rounded-xl transition-all border border-transparent hover:border-neutral-200" 
                                            title="Enviar Minuta por Email"
                                        >
                                            <Icon name="mail" className="w-4 h-4 sm:w-5 sm:h-5"/>
                                        </button>
                                        <button onClick={() => handleCopyLink(m.id)} className="p-2 sm:p-3 text-neutral-400 hover:text-brand-primary hover:bg-white dark:hover:bg-black rounded-xl transition-all border border-transparent hover:border-neutral-200" title="Copiar Link"><Icon name="copy" className="w-4 h-4 sm:w-5 sm:h-5"/></button>
                                        <Button size="sm" onClick={() => { setMeetsInfoOpen(false); joinMeeting(m.id); }} className={`font-black text-[9px] sm:text-[11px] uppercase px-3 sm:px-8 h-9 sm:h-12 rounded-xl sm:rounded-2xl shadow-xl transform active:scale-95 transition-all ${m.status === 'active' ? 'bg-green-600 animate-pulse' : 'bg-brand-primary'}`}>
                                            {m.status === 'active' ? 'Unirse' : 'Ir a Sala'}
                                        </Button>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-6 sm:py-8 bg-neutral-50/20 dark:bg-neutral-900/5 rounded-2xl border border-dashed border-neutral-200/50 dark:border-neutral-800/50 opacity-60">
                                    <Icon name="clock" className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 text-neutral-300" />
                                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-neutral-400 tracking-widest">Sin reuniones programadas</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recordings Section */}
                    <div>
                        <h3 className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-neutral-400 flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
                            <span className="w-8 sm:w-12 h-px bg-neutral-200 dark:bg-neutral-800"></span>
                            ARCHIVO DE GRABACIONES
                        </h3>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                            {recordings.length > 0 ? recordings.map(rec => (
                                <div key={rec.id} className="p-3 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 flex flex-col shadow-sm group hover:shadow-xl transition-all border-b-2 sm:border-b-4 border-b-transparent hover:border-b-red-500">
                                    <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-5">
                                        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center text-red-600 shadow-inner group-hover:scale-110 transition-transform flex-shrink-0">
                                            <Icon name="video" className="w-4 h-4 sm:w-6 sm:h-6"/>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-black text-[10px] sm:text-sm truncate text-neutral-900 dark:text-white uppercase tracking-tight">{rec.title}</p>
                                            <p className="text-[8px] sm:text-[9px] text-neutral-400 font-bold uppercase mt-0.5">{(rec.sizeBytes ? (rec.sizeBytes / (1024*1024)).toFixed(1) : '0')} MB</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 sm:gap-2 mt-auto">
                                        <a href={rec.url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 sm:gap-2 bg-neutral-100 dark:bg-neutral-800 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-[8px] sm:text-[10px] font-black uppercase hover:bg-brand-primary hover:text-white transition-all shadow-sm">
                                            <Icon name="expand" className="w-3 h-3 sm:w-4 sm:h-4"/> <span className="hidden sm:inline">Reproducir</span>
                                        </a>
                                        <button onClick={() => handleDeleteRecording(rec)} className="p-2 sm:p-3 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-xl sm:rounded-2xl transition-all" title="Eliminar"><Icon name="trash" className="w-3.5 h-3.5 sm:w-4 sm:h-4"/></button>
                                    </div>
                                </div>
                            )) : (
                                <div className="col-span-full text-center py-8 sm:py-12 bg-neutral-50/30 dark:bg-neutral-900/10 rounded-2xl sm:rounded-[3rem] border-2 border-dashed border-neutral-200 dark:border-neutral-800 opacity-60">
                                    <p className="text-[9px] sm:text-[10px] font-black uppercase text-neutral-400 tracking-widest">Archivo de video vacío</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {!isPremium && (
                        <div className="p-6 sm:p-10 bg-gradient-to-r from-purple-900 via-indigo-950 to-black rounded-2xl sm:rounded-[3rem] border border-white/10 text-center relative overflow-hidden shadow-2xl transform hover:scale-[1.01] transition-all">
                            <div className="absolute top-0 right-0 w-60 h-60 bg-brand-accent/20 rounded-full blur-[80px]"></div>
                            <p className="text-[9px] sm:text-[11px] font-black text-brand-accent uppercase tracking-[0.3em] sm:tracking-[0.4em] mb-3 sm:mb-4">Potencia tu Negocio</p>
                            <h4 className="text-xl sm:text-4xl font-black text-white mb-6 sm:mb-10 tracking-tighter leading-tight uppercase">MEETS PREMIUM <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-purple-400">SIN LÍMITES</span></h4>
                            <Button 
                                onClick={() => { setMeetsInfoOpen(false); setProModalOpen(true); }}
                                className="w-full py-4 sm:py-6 bg-white text-black font-black uppercase text-xs sm:text-sm tracking-widest rounded-xl sm:rounded-3xl shadow-2xl hover:bg-neutral-100 transition-all border-none"
                            >
                                ACTIVAR PRUEBA GRATIS
                            </Button>
                            <p className="text-[8px] sm:text-[10px] text-white/40 uppercase font-bold mt-4 sm:mt-5 tracking-[0.2em]">REUNIONES DE HASTA 4 HORAS • ARCHIVO HD</p>
                        </div>
                    )}
                </div>

                <div className="p-4 sm:p-6 border-t border-neutral-100 dark:border-neutral-900 flex justify-center bg-white dark:bg-[#050505] flex-none">
                    <button 
                        onClick={() => setMeetsInfoOpen(false)}
                        className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white text-[9px] sm:text-[11px] font-black uppercase tracking-[0.3em] sm:tracking-[0.5em] transition-all py-3 px-8 sm:px-12 hover:tracking-[0.5em] sm:hover:tracking-[0.8em] bg-neutral-50 dark:bg-neutral-900/50 rounded-full border border-neutral-200 dark:border-neutral-800 shadow-sm"
                    >
                        Cerrar Hub
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default MeetsInfoModal;