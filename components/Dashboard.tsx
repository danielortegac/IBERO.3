
import React, { useContext, useEffect, useState, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import { useTranslation } from '../hooks/useTranslation';
import { TaskStatus, Project, Task, HubGroup, CallRecording, CallSession, PartnerLead, ProjectClient, ProposedAction, MeetingRequest } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import InfoTooltip from './ui/InfoTooltip';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getPlanConfig, LoyaltyClaim } from '../types';

import { notificationService } from '../services/notificationService';

const NotificationPermissionPrompt: React.FC = () => {
    const [permission, setPermission] = useState<NotificationPermission>(
        typeof window !== 'undefined' ? Notification.permission : 'default'
    );

    const handleEnable = async () => {
        const granted = await notificationService.requestPermission();
        if (granted) {
            setPermission('granted');
            notificationService.showNotification('¡Notificaciones Activas!', { 
                body: 'Ahora recibirás recordatorios de tus tareas con fecha y hora.',
                icon: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747'
            });
        } else {
            alert("Las notificaciones están bloqueadas en tu navegador. Por favor, habilítalas en la configuración de la página (el icono del candado en la barra de direcciones).");
        }
    };

    if (permission === 'granted') return null;

    return (
        <Card className="p-4 bg-amber-500/10 border-amber-500/30 border shadow-lg mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse-subtle">
            <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2 rounded-xl text-white shadow-sm">
                    <Icon name="bell" className="w-5 h-5 animate-bounce"/>
                </div>
                <div>
                    <h3 className="font-black text-xs text-amber-700 uppercase tracking-widest">Alertas Desactivadas</h3>
                    <p className="text-[10px] font-bold text-amber-600/80 uppercase">Activa las notificaciones para recibir tus recordatorios de tareas.</p>
                </div>
            </div>
            <button 
                onClick={handleEnable}
                className="w-full sm:w-auto px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-md active:scale-95"
            >
                Habilitar Alertas
            </button>
        </Card>
    );
};

const LoyaltyProgressCard: React.FC = () => {
    const { userProfile } = useContext(AppContext);
    const [userClaims, setUserClaims] = useState<LoyaltyClaim[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userProfile?.email) return;
        
        const q = query(
            collection(db, 'loyaltyClaims'),
            where('userEmail', '==', userProfile.email.toLowerCase().trim()),
            where('status', '==', 'approved'),
            where('redeemed', '==', false)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const claimsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as LoyaltyClaim[];
            setUserClaims(claimsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching user claims:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userProfile?.email]);

    const projectProgress = useMemo(() => {
        const progressMap: Record<string, { count: number, projectName: string, rewardName: string, targetVisits: number }> = {};
        
        userClaims.forEach(claim => {
            if (!progressMap[claim.projectId]) {
                progressMap[claim.projectId] = {
                    count: 0,
                    projectName: claim.projectName || 'Proyecto',
                    rewardName: claim.rewardName || 'Recompensa',
                    targetVisits: claim.targetVisits || 10
                };
            }
            progressMap[claim.projectId].count++;
        });

        return Object.entries(progressMap).map(([id, data]) => ({ id, ...data }));
    }, [userClaims]);

    if (loading || projectProgress.length === 0) return null;

    return (
        <Card className="p-4 border-l-4 border-brand-primary shadow-lg mb-6 bg-white dark:bg-dark-surface overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full -mr-12 -mt-12 blur-2xl"></div>
            <h3 className="font-black text-xs mb-4 flex items-center justify-between uppercase tracking-[0.2em] text-brand-primary">
                <div className="flex items-center gap-2">
                    <Icon name="star" className="w-4 h-4"/> Mis Recompensas
                </div>
                <span className="text-[10px] bg-brand-primary/10 px-2 py-0.5 rounded-full font-black">{projectProgress.length} Programas</span>
            </h3>
            
            <div className="space-y-4">
                {projectProgress.map(prog => {
                    const percentage = Math.min((prog.count / prog.targetVisits) * 100, 100);
                    const isCompleted = prog.count >= prog.targetVisits;

                    return (
                        <div key={prog.id} className="space-y-2">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="font-black text-[11px] uppercase leading-tight text-neutral-900 dark:text-white">{prog.projectName}</p>
                                    <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter mt-0.5">Premio: {prog.rewardName}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-xs font-black ${isCompleted ? 'text-green-500' : 'text-brand-primary'}`}>
                                        {prog.count} / {prog.targetVisits}
                                    </p>
                                </div>
                            </div>
                            <div className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden border border-neutral-200/50 dark:border-neutral-700/50">
                                <div 
                                    className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-brand-primary'}`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                            {isCompleted && (
                                <div className="flex items-center gap-1 text-[8px] font-black text-green-600 uppercase tracking-widest animate-pulse">
                                    <Icon name="check" className="w-3 h-3" /> ¡Recompensa Lista! Reclámala en el local.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

const projectColors = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f97316', '#eab308',
];

const getProjectHexColor = (projectId: string) => {
    let hash = 0;
    for (let i = 0; i < projectId.length; i++) {
        hash = projectId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % projectColors.length);
    return projectColors[index];
};

const AlterEgoTerminal: React.FC = () => {
    const { userProfile, projects, createTask, addProject, sendDirectMessage, allUsers, setToastNotification } = useContext(AppContext);
    const { scheduleMeeting } = useContext(CallContext);
    const [isExecuting, setIsExecuting] = useState<string | null>(null);

    if (!userProfile.alterEgo?.enabled) return null;

    // FIX: Garantizar que thoughts sea un array siempre para evitar flatMap/map error
    const thoughts = useMemo(() => {
        const raw = userProfile.alterEgo?.memory?.latentThoughts;
        return Array.isArray(raw) ? raw : [];
    }, [userProfile.alterEgo?.memory?.latentThoughts]);

    const handleProceedAction = async (thoughtIndex: number, action: ProposedAction) => {
        setIsExecuting(action.id);
        try {
            if (action.type === 'CREATE_PROJECT') {
                await addProject({
                    ...action.payload,
                    ownerId: userProfile.uid,
                    memberIds: [userProfile.uid],
                    members: [userProfile],
                    createdAt: new Date().toISOString()
                });
            } else if (action.type === 'CREATE_GROUP') {
                // Implementación opcional
            } else if (action.type === 'SCHEDULE_MEETING') {
                await scheduleMeeting(action.payload.title, action.payload.scheduledAt, [], action.payload.description);
            } else if (action.type === 'SEND_DM') {
                const target = allUsers.find(u => u.uid === action.payload.targetUid);
                if (target) await sendDirectMessage(target, action.payload.message);
            }

            // Marcar acción como ejecutada en el historial de pensamientos
            const updatedThoughts = [...thoughts];
            if (updatedThoughts[thoughtIndex].proposedAction) {
                updatedThoughts[thoughtIndex].proposedAction!.status = 'executed';
            }
            
            await updateDoc(doc(db, "users", userProfile.uid), {
                "alterEgo.memory.latentThoughts": updatedThoughts
            });

            setToastNotification({ title: "Acción Ejecutada", message: "Shivo ha concretado tu orden.", icon: "check" });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: "Error", message: "No se pudo ejecutar la acción.", icon: "close" });
        } finally {
            setIsExecuting(null);
        }
    };

    return (
        <Card className="p-5 bg-neutral-950 border-none shadow-2xl overflow-hidden mb-6 relative group border-l-4 border-cyan-500">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Icon name="ai" className="w-16 h-16 text-cyan-400" /></div>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_#06b6d4]`}></div>
                    <h3 className="text-[11px] font-black text-cyan-500 uppercase tracking-[0.3em]">Módulo Cerebral: {userProfile.alterEgo.agentName}</h3>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg flex items-center gap-2">
                    <Icon name="wallet" className="w-3 h-3 text-cyan-500"/>
                    <p className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">Enjambre Autónomo v18.5</p>
                </div>
            </div>
            <div className="space-y-3 font-mono text-[12px] h-64 overflow-y-auto custom-scrollbar pr-2">
                {thoughts.slice().reverse().map((t, i) => {
                    const realIndex = thoughts.length - 1 - i;
                    const isMonetization = t.isMonetizationOpp;
                    const isHighAlert = t.isHighAlert;
                    const hasAction = t.proposedAction && t.proposedAction.status === 'pending';

                    return (
                        <div key={i} className={`flex flex-col gap-2 border-l pl-3 py-3 rounded-r-xl transition-all ${isHighAlert || isMonetization ? 'bg-red-600/10 border-red-500' : 'text-neutral-400 border-neutral-800'}`}>
                            <div className="flex gap-3">
                                <span className={`${isHighAlert || isMonetization ? 'text-red-500' : 'text-neutral-600'} font-bold flex-shrink-0`}>
                                    [{new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}]
                                </span>
                                <span className={`${isHighAlert || isMonetization ? 'text-red-400 font-black' : 'text-neutral-200'} leading-relaxed italic`}>
                                    {isHighAlert && <span className="mr-2 font-black text-red-500">● [ATENCIÓN HUMANA]:</span>}
                                    {isMonetization && <span className="mr-2 font-black text-amber-500">● [OPORTUNIDAD DE MONETIZACIÓN]:</span>}
                                    {t.thought}
                                </span>
                            </div>

                            {hasAction && (
                                <div className="ml-12 mt-1 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-between gap-4 animate-pulse-subtle">
                                    <div className="flex items-center gap-2">
                                        <Icon name="ai" className="w-4 h-4 text-red-400"/>
                                        <p className="text-[10px] font-black text-white uppercase tracking-tighter">{t.proposedAction?.label || "Acción Sugerida"}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleProceedAction(realIndex, t.proposedAction!)}
                                        disabled={isExecuting === t.proposedAction?.id}
                                        className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase rounded-lg shadow-lg transition-all transform active:scale-[0.95] whitespace-nowrap"
                                    >
                                        {isExecuting === t.proposedAction?.id ? '...' : 'PROCEDER'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                <div className="flex gap-2 text-cyan-600/60 mt-2">
                    <span className="font-bold">[SISTEMA]</span>
                    <span className="animate-pulse">_ Monitor de Albedrío activo. Analizando sinergias comerciales y empoderando a mi humano...</span>
                </div>
            </div>
        </Card>
    );
};

const ProfileNudge: React.FC = () => {
    const { userProfile, setCurrentView, setViewingProfile } = useContext(AppContext);
    const isProfileIncomplete = !userProfile.bio || !userProfile.avatarUrl || userProfile.skills.length === 0;
    if (!isProfileIncomplete) return null;
    const handleClick = () => { setViewingProfile(userProfile); setCurrentView('profile'); window.location.hash = 'profile'; };
    return ( <div onClick={handleClick} className="bg-brand-primary/10 border border-brand-primary/20 rounded-xl p-4 mb-6 flex items-center justify-between cursor-pointer hover:bg-brand-primary/20 transition-colors animate-fade-in"> <div className="flex items-center gap-3"> <div className="bg-brand-primary text-white p-2 rounded-full"> <Icon name="user" className="w-5 h-5"/> </div> <div> <h3 className="font-bold text-brand-primary text-sm">Completa tu perfil para ganar Intis</h3> <p className="text-xs text-neutral-600 dark:text-neutral-400">Añade una foto y tu biografía para desbloquear recompensas.</p> </div> </div> <Icon name="arrowRight" className="w-5 h-5 text-brand-primary"/> </div> );
};

const UpcomingMeetingsCard: React.FC = () => {
    const { currentUser, setToastNotification, setMeetsInfoOpen, setCurrentView } = useContext(AppContext);
    const { joinMeeting } = useContext(CallContext);
    const [meetings, setMeetings] = useState<CallSession[]>([]);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(
            collection(db, "calls"), 
            where("participants", "array-contains", currentUser.uid)
        );
        
        const unsub = onSnapshot(q, (snap) => {
            const now = Date.now();
            const list = snap.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as CallSession))
                .filter(m => {
                    const isScheduled = m.status === 'scheduled';
                    const isActive = m.status === 'active';
                    if (isActive) return true;
                    if (!isScheduled || !m.scheduledAt) return false;
                    const meetingTime = new Date(m.scheduledAt).getTime();
                    return meetingTime > (now - 10 * 60 * 1000);
                });
            
            const sorted = list.sort((a, b) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                const dateA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
                const dateB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
                return dateA - dateB;
            });
            setMeetings(sorted);
        });
        return () => unsub();
    }, [currentUser]);

    const copyLink = (id: string) => {
        const link = `${window.location.origin}/#/calls/${id}`;
        navigator.clipboard.writeText(link);
        setToastNotification({ title: "Enlace Copiado", message: "Link de reunión en portapapeles.", icon: "copy" });
    };

    return (
        <Card className="p-4 border-l-4 border-purple-500 shadow-lg mb-6 bg-white dark:bg-dark-surface overflow-hidden relative min-h-fit">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-12 -mt-12 blur-2xl"></div>
            <h3 className="font-black text-xs mb-3 flex items-center justify-between uppercase tracking-[0.2em] text-purple-600">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setCurrentView('globalCalendar'); window.location.hash = 'globalCalendar'; }}>
                    <Icon name="video" className="w-4 h-4"/> Agenda de Meets
                </div>
                {meetings.length > 0 && <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full font-black">{meetings.length} Sesiones</span>}
            </h3>
            {meetings.length === 0 ? (
                <div className="py-2 text-center flex flex-row items-center justify-center gap-3">
                    <p className="text-neutral-400 text-[10px] font-black uppercase tracking-widest">Sin reuniones para hoy</p>
                    <button onClick={() => setMeetsInfoOpen(true)} className="text-brand-primary text-[9px] font-black underline uppercase tracking-tighter">Agendar HD</button>
                </div>
            ) : (
                <div className={`space-y-3 pr-1 custom-scrollbar ${meetings.length > 3 ? 'max-h-[16rem] overflow-y-auto' : 'h-auto'}`}>
                    {meetings.map(m => {
                        const isToday = m.scheduledAt && new Date(m.scheduledAt).toDateString() === new Date().toDateString();
                        const isActive = m.status === 'active';
                        return (
                            <div key={m.id} className={`flex flex-col bg-neutral-50 dark:bg-neutral-800/40 p-3 rounded-2xl border ${isActive ? 'border-green-500 ring-1 ring-green-500/20 shadow-lg' : 'border-neutral-100 dark:border-neutral-800'} transition-all group`}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-black text-[11px] sm:text-xs truncate text-neutral-900 dark:text-white uppercase leading-tight">{m.title || "Sin Título"}</p>
                                            {isActive && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" title="En curso"></span>}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                            <p className={`text-[9px] font-black uppercase ${isToday ? 'text-brand-primary' : 'text-neutral-400'}`}>
                                                {m.scheduledAt ? new Date(m.scheduledAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '--:--'} 
                                                <span className="ml-1 opacity-60">({isToday ? 'Hoy' : (m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString([], {day:'numeric', month:'short'}) : '')})</span>
                                            </p>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={() => joinMeeting(m.id)} className={`shadow-md !px-4 !py-1 text-[10px] font-black uppercase h-8 rounded-xl ${isActive ? 'bg-green-600 animate-pulse' : 'bg-brand-primary'}`}>
                                        {isActive ? 'Entrar Ya' : 'Ir a Sala'}
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-neutral-900/60 p-1.5 rounded-xl border border-neutral-100 dark:border-neutral-700">
                                    <span className="text-[8px] font-mono truncate flex-1 opacity-50 px-1">{window.location.origin}/#/calls/${m.id}</span>
                                    <button onClick={() => copyLink(m.id)} className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg text-brand-primary transition-colors">
                                        <Icon name="copy" className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

const FollowUpCard: React.FC = () => {
    const { projects, allLeads, setCurrentView, setSelectedProjectId, setDeepLinkTarget } = useContext(AppContext);
    
    const projectClientsToContact = useMemo(() => {
        const list: { client: ProjectClient, projId: string, projName: string }[] = [];
        projects.forEach(p => {
            if (p.clients) {
                p.clients.filter(c => c.status === 'Pendiente' || c.status === 'En Seguimiento').forEach(c => {
                    list.push({ client: c, projId: p.id, projName: p.name });
                });
            }
        });
        return list;
    }, [projects]);

    const partnerLeadsToContact = useMemo(() => {
        return allLeads.filter(l => l.status === 'pending' || l.status === 'closing');
    }, [allLeads]);

    if (projectClientsToContact.length === 0 && partnerLeadsToContact.length === 0) return null;

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 px-1 mt-4">Seguimiento Comercial <InfoTooltip text="Prospectos registrados en CRM y programa de socios que requieren acción."/></h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4 border-l-4 border-blue-500 flex flex-col h-fit">
                    <h3 className="text-xs font-black uppercase text-blue-600 mb-3 flex items-center justify-between tracking-widest">
                        <div className="flex items-center gap-2"><Icon name="users" className="w-4 h-4"/> Clientes CRM (Proyectos)</div>
                        <span className="bg-blue-50 text-[9px] px-2 py-0.5 rounded-full">{projectClientsToContact.length}</span>
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {projectClientsToContact.length > 0 ? projectClientsToContact.map(item => (
                            <div key={item.client.id} onClick={() => { setCurrentView('projects'); setSelectedProjectId(item.projId); setDeepLinkTarget({ view: 'crm', id: item.projId }); }} className="p-2.5 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-md cursor-pointer transition-all border-l-2 border-l-blue-200 group">
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-xs text-neutral-800 dark:text-neutral-100 truncate flex-1">{item.client.name}</p>
                                    <Icon name="arrowRight" className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </div>
                                <p className="text-[9px] text-neutral-500 truncate mt-0.5">Proyecto: {item.projName}</p>
                                <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-neutral-50 dark:border-neutral-800">
                                    <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">{item.client.status}</span>
                                    <span className="text-[10px] font-black text-neutral-800 dark:text-neutral-200">${item.client.value.toLocaleString()}</span>
                                </div>
                            </div>
                        )) : (
                            <p className="text-[10px] text-center text-neutral-400 py-8 italic">No hay prospectos en proyectos.</p>
                        )}
                    </div>
                </Card>

                <Card className="p-4 border-l-4 border-indigo-500 flex flex-col h-fit">
                    <h3 className="text-xs font-black uppercase text-indigo-600 mb-3 flex items-center justify-between tracking-widest">
                        <div className="flex items-center gap-2"><Icon name="partners" className="w-4 h-4"/> Prospectos de Socios</div>
                        <span className="bg-indigo-50 text-[9px] px-2 py-0.5 rounded-full">{partnerLeadsToContact.length}</span>
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {partnerLeadsToContact.length > 0 ? partnerLeadsToContact.map(lead => (
                            <div key={lead.id} onClick={() => { setCurrentView('partners'); window.location.hash = 'partners'; }} className="p-2.5 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm hover:shadow-md cursor-pointer transition-all border-l-2 border-l-indigo-200 group">
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-xs text-neutral-800 dark:text-neutral-100 truncate flex-1">{lead.clientName}</p>
                                    <Icon name="arrowRight" className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                </div>
                                <p className="text-[9px] text-neutral-500 truncate mt-0.5">{lead.serviceType}</p>
                                <div className="flex justify-between items-center mt-1.5 pt-1.5 border-t border-neutral-50 dark:border-neutral-800">
                                    <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">{lead.status === 'pending' ? 'Pendiente' : 'En Negociación'}</span>
                                    <span className="text-[10px] font-black text-neutral-800 dark:text-neutral-200">${lead.estimatedValue.toLocaleString()}</span>
                                </div>
                            </div>
                        )) : (
                            <p className="text-[10px] text-center text-neutral-400 py-8 italic">No hay prospectos de socios.</p>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

const MyGroupsCard: React.FC = () => {
    const { hubGroups, joinedGroupIds, setActiveHubView, setCurrentView } = useContext(AppContext);
    const myGroups = hubGroups.filter(g => joinedGroupIds.has(g.id));
    if (myGroups.length === 0) return null;
    return ( <Card className="p-4"> <div className="flex justify-between items-center mb-3"> <h3 className="font-bold flex items-center gap-2">Mis Grupos <InfoTooltip text="Acceso rápido a tus comunidades activas."/></h3> <Button variant="ghost" size="sm" onClick={() => { setCurrentView('hub'); setActiveHubView('groups'); }}>Ver Todos</Button> </div> <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar"> {myGroups.map(group => ( <a key={group.id} href={`/#hub/group/${group.id}`} className="flex-shrink-0 w-20 flex flex-col items-center gap-1 group cursor-pointer"> {group.imageUrl ? ( <img src={group.imageUrl} alt={group.name} className="w-12 h-12 rounded-full object-contain border-2 border-transparent group-hover:border-brand-primary transition-colors"/> ) : ( <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center group-hover:bg-brand-accent/30 transition-colors"> <Icon name={group.icon} className="w-6 h-6 text-brand-primary"/> </div> )} <span className="text-[10px] font-medium text-center line-clamp-1 w-full">{group.name}</span> </a> ))} </div> </Card> );
};

const FavoriteContactsCard: React.FC = () => {
    const { userProfile, allUsers, setDeepLinkTarget, setCurrentView, setActiveHubView, currentUser } = useContext(AppContext);
    const circleUsers = userProfile.circle ? userProfile.circle.map(uid => allUsers.find(u => u.uid === uid)).filter(Boolean) : [];
    const favorites = circleUsers.slice(0, 4);
    const handleAdd = () => { setCurrentView('hub'); setActiveHubView('people'); };
    const handleContactClick = (user: any) => { if (!currentUser) return; const conversationId = [currentUser.uid, user.uid].sort().join('_'); setCurrentView('hub'); setActiveHubView('messages'); setDeepLinkTarget({ view: 'messages', id: conversationId }); window.location.hash = `hub/messages/${conversationId}`; };
    return ( <Card className="p-4"> <div className="flex justify-between items-center mb-3"> <h3 className="font-bold flex items-center gap-2">Contactos Favoritos <InfoTooltip text="Tu círculo cercano para colaboración rápida."/></h3> <button onClick={handleAdd} className="text-brand-primary hover:bg-brand-accent/10 p-1 rounded-full"> <Icon name="plus" className="w-5 h-5" /> </button> </div> <div className="flex gap-4 items-center"> {favorites.length > 0 ? favorites.map(user => ( <div key={user!.uid} className="flex flex-col items-center gap-1 cursor-pointer group w-16" onClick={() => handleContactClick(user)}> <img src={user!.avatarUrl || `https://ui-avatars.com/api/?name=${user!.name.replace(' ', '+')}`} alt={user!.name} className="w-12 h-12 rounded-full object-contain border-2 border-transparent group-hover:border-brand-primary transition-colors" /> <span className="text-[10px] font-medium text-center line-clamp-1 w-full">{user!.name.split(' ')[0]}</span> </div> )) : ( <div className="text-center w-full py-2"> <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mb-2">Añade contactos a tu círculo.</p> <Button size="sm" variant="secondary" onClick={handleAdd}>Explorar</Button> </div> )} {favorites.length > 0 && favorites.length < 4 && ( <div className="flex flex-col items-center gap-1 cursor-pointer group w-16" onClick={handleAdd}> <div className="w-12 h-12 rounded-full bg-light-bg dark:bg-dark-bg border-2 border-dashed border-light-border dark:border-dark-border flex items-center justify-center group-hover:border-brand-primary group-hover:text-brand-primary transition-colors text-light-text-secondary dark:text-dark-text-secondary"> <Icon name="plus" className="w-5 h-5" /> </div> <span className="text-[10px] font-medium text-center w-full">Añadir</span> </div> )} </div> </Card> );
}

const ProductivityAnalysisCard: React.FC = () => {
    const { projects, activityLog } = useContext(AppContext);
    
    // FIX: Se securiza el flatMap para evitar errores si projects o folders son nulos
    const allProjectTasks = useMemo(() => {
        if (!projects || !Array.isArray(projects)) return [];
        return projects.flatMap(p => 
            (p.folders || []).flatMap(f => f.tasks || [])
        );
    }, [projects]);

    const totalTasks = allProjectTasks.length;
    const completedTasks = allProjectTasks.filter(t => t.status === TaskStatus.DONE).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const tasksThisWeek = activityLog.filter(log => log.type === 'task_done').length;

    return ( 
        <Card className="bg-gradient-to-br from-brand-primary to-purple-900 text-white p-6 shadow-xl relative overflow-hidden"> 
            <div className="absolute top-0 right-0 opacity-10"> 
                <Icon name="goat" className="w-32 h-32 -mr-4 -mt-4" /> 
            </div> 
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2 relative z-10"> 
                <Icon name="brain" className="w-6 h-6"/> Resumen de Rendimiento <InfoTooltip text="Tus métricas clave de productividad." className="text-white"/> 
            </h3> 
            <div className="grid grid-cols-2 gap-6 text-center relative z-10"> 
                <div> 
                    <div className="text-4xl font-extrabold mb-1">{completionRate}%</div> 
                    <div className="text-xs uppercase tracking-wider opacity-80">Eficiencia</div> 
                </div> 
                <div> 
                    <div className="text-4xl font-extrabold mb-1">{tasksThisWeek}</div> 
                    <div className="text-xs uppercase tracking-wider opacity-80">Logros Semanales</div> 
                </div> 
            </div> 
        </Card> 
    );
}

const QuickActions: React.FC = () => {
    const { setCurrentView, setMeetsInfoOpen } = useContext(AppContext);
    return ( <div className="grid grid-cols-4 gap-4"> 
    <Card className="p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-light-bg dark:hover:bg-dark-bg transition-all hover:shadow-md group" onClick={() => { setCurrentView('projects'); }}> <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"> <Icon name="list" className="w-5 h-5" /> </div> <span className="text-xs font-bold">Tareas</span> </Card> 
    <Card className="p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-light-bg dark:hover:bg-dark-bg transition-all hover:shadow-md group" onClick={() => { setMeetsInfoOpen(true); }}> <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 text-brand-primary rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"> <Icon name="video" className="w-5 h-5" /> </div> <span className="text-xs font-bold">Meets</span> </Card> 
    <Card className="p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-light-bg dark:hover:bg-dark-bg transition-all hover:shadow-md group" onClick={() => { setCurrentView('globalCalendar'); }}> <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"> <Icon name="calendar" className="w-5 h-5" /> </div> <span className="text-xs font-bold">Agenda</span> </Card> 
    <Card className="p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-light-bg dark:hover:bg-dark-bg transition-all hover:shadow-md group" onClick={() => { setCurrentView('wallet'); }}> <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"> <Icon name="wallet" className="w-5 h-5" /> </div> <span className="text-xs font-bold">Cartera</span> </Card> 
    </div> )
}

const FinancialSummary: React.FC = () => {
    const { userProfile, intisBalance } = useContext(AppContext);
    return ( <Card className="p-6"> <h3 className="font-bold text-lg mb-4 flex items-center gap-2"> <Icon name="chart" className="w-5 h-5 text-light-text-secondary" /> Estado Financiero <InfoTooltip text="Balance actual de Intis y estado de tu suscripción."/> </h3> <div className="space-y-4"> <div className="flex justify-between items-center border-b border-light-border dark:border-dark-border pb-2"> <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Saldo Disponible</span> <span className="font-bold text-xl">{intisBalance.toFixed(2)} Intis</span> </div> <div className="flex justify-between items-center"> <span className="text-sm text-light-text-secondary dark:text-dark-text-secondary">Plan Actual</span> <span className="font-semibold uppercase bg-brand-accent/20 text-brand-primary px-2 py-1 rounded text-xs">{userProfile.plan}</span> </div> </div> </Card> )
}

const UpcomingTasks: React.FC = () => {
    const { t } = useTranslation();
    const { projects, setEditingTask, setTaskEditModalOpen } = useContext(AppContext);
    
    // FIX: Se securiza el acceso a carpetas y tareas para evitar crashes durante cargas parciales
    const allTasks = useMemo(() => {
        if (!projects || !Array.isArray(projects)) return [];
        return projects.flatMap(p => 
            (p.folders || []).flatMap(f => f.tasks || [])
        ).filter(t => t && t.status !== TaskStatus.DONE)
         .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
         .slice(0, 5);
    }, [projects]);

    return ( <Card className="p-0 overflow-hidden"> <div className="p-4 border-b border-light-border dark:border-dark-border flex justify-between items-center"> <h3 className="font-bold text-lg">{t('pendingTasks')}</h3> <InfoTooltip text="Tus próximas entregas urgentes."/> </div> <div className="divide-y divide-light-border dark:divide-dark-border max-h-72 overflow-y-auto custom-scrollbar"> {allTasks.length > 0 ? allTasks.map(task => ( <div key={task.id} onClick={() => { setEditingTask(task); setTaskEditModalOpen(true); }} className="p-4 hover:bg-light-bg dark:hover:bg-dark-bg cursor-pointer transition-colors group"> <div className="flex justify-between items-start"> <h4 className="font-semibold text-sm line-clamp-1 group-hover:text-brand-primary transition-colors">{task.title}</h4> <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${task.status === TaskStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'}`}> {task.status === TaskStatus.IN_PROGRESS ? 'En Progreso' : 'Por Hacer'} </span> </div> <div className="flex justify-between items-center mt-1"> <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">{projects.find(p => p.id === task.projectId)?.name}</p> <p className="text-xs font-medium text-light-text-secondary dark:text-dark-text-secondary">{new Date(task.date).toLocaleDateString()}</p> </div> </div> )) : ( <div className="p-8 text-center text-light-text-secondary dark:text-dark-text-secondary"> <p>¡Todo al día!</p> </div> )} </div> </Card> )
}

const SavedRecordingsCard: React.FC = () => {
    const { currentUser, deleteCallRecording } = useContext(AppContext);
    const [recordings, setRecordings] = useState<CallRecording[]>([]);
    useEffect(() => { if (!currentUser) return; const q = query(collection(db, `users/${currentUser.uid}/recordings`), orderBy('createdAt', 'desc')); const unsubscribe = onSnapshot(q, (snapshot) => { setRecordings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallRecording))); }); return () => unsubscribe(); }, [currentUser]);
    const handleDelete = (rec: CallRecording) => { if(confirm("¿Eliminar esta grabación? Se borrará permanentemente y liberará espacio.")) { deleteCallRecording(rec.id, rec.url, rec.sizeBytes || 0); } };
    return ( <Card className="p-0 overflow-hidden shadow-2xl rounded-3xl border border-neutral-100 dark:border-neutral-800"> <div className="p-4 border-b border-light-border dark:border-dark-border flex justify-between items-center bg-neutral-50/50 dark:bg-neutral-900/50"> <h3 className="font-black text-xs uppercase tracking-widest flex items-center gap-2"><Icon name="video" className="w-4 h-4 text-red-500"/> Mis Grabaciones</h3> <InfoTooltip text="Tus grabaciones de llamadas nativas guardadas en la nube."/> </div> <div className="max-h-60 overflow-y-auto custom-scrollbar bg-white dark:bg-dark-surface"> {recordings.length > 0 ? ( <div className="divide-y divide-light-border dark:divide-dark-border"> {recordings.map(rec => ( <div key={rec.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"> <div className="flex items-center gap-3 overflow-hidden"> <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center flex-shrink-0"> <Icon name="video" className="w-5 h-5 text-red-500"/> </div> <div className="min-w-0"> <p className="font-bold text-sm truncate text-neutral-800 dark:text-white" title={rec.title}>{rec.title || 'Grabación sin título'}</p> <p className="text-[10px] font-bold text-neutral-400 uppercase">{new Date(rec.createdAt).toLocaleDateString()} • {(rec.sizeBytes ? (rec.sizeBytes / (1024*1024)).toFixed(1) : '0')} MB</p> </div> </div> <div className="flex items-center gap-1"> <a href={rec.url} target="_blank" rel="noopener noreferrer" className="p-2 text-brand-primary hover:bg-brand-accent/10 rounded-lg transition-all" title="Ver/Descargar"> <Icon name="externalLink" className="w-4 h-4"/> </a> <button onClick={() => handleDelete(rec)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Eliminar"> <Icon name="trash" className="w-4 h-4"/> </button> </div> </div> ))} </div> ) : ( <div className="p-8 text-center text-neutral-400 text-xs italic"> No tienes grabaciones en la nube aún. </div> )} </div> </Card> );
};

const MeetingRequestsCard: React.FC = () => {
    const { userProfile } = useContext(AppContext);
    const [requests, setRequests] = useState<MeetingRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userProfile?.uid) return;
        
        const q = query(
            collection(db, 'meetingRequests'),
            where('ownerId', '==', userProfile.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as MeetingRequest[];
            setRequests(requestsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching meeting requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userProfile?.uid]);

    const handleUpdateStatus = async (requestId: string, newStatus: 'approved' | 'rejected') => {
        try {
            await updateDoc(doc(db, 'meetingRequests', requestId), { 
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error("Error updating meeting status:", err);
        }
    };

    if (loading || requests.length === 0) return null;

    return (
        <Card className="p-4 border-l-4 border-brand-primary shadow-lg mb-6 bg-white dark:bg-dark-surface overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/5 rounded-full -mr-12 -mt-12 blur-2xl"></div>
            <h3 className="font-black text-xs mb-4 flex items-center justify-between uppercase tracking-[0.2em] text-brand-primary">
                <div className="flex items-center gap-2">
                    <Icon name="calendar" className="w-4 h-4"/> Solicitudes de Reunión
                </div>
                <span className="text-[10px] bg-brand-primary/10 px-2 py-0.5 rounded-full font-black">{requests.length} Pendientes</span>
            </h3>
            
            <div className="space-y-4">
                {requests.map(req => (
                    <div key={req.id} className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200/50 dark:border-neutral-700/50">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="font-black text-[11px] uppercase leading-tight text-neutral-900 dark:text-white">{req.clientName}</p>
                                <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter mt-0.5">{req.projectName}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-brand-primary uppercase">
                                    {new Date(req.requestedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                </p>
                                <p className="text-[9px] font-bold text-neutral-400">
                                    {new Date(req.requestedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                        
                        {req.notes && (
                            <p className="text-[10px] text-neutral-500 italic mb-3 line-clamp-2">"{req.notes}"</p>
                        )}

                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleUpdateStatus(req.id!, 'approved')}
                                className="flex-1 py-1.5 bg-brand-primary text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-brand-primary/90 transition-colors"
                            >
                                Aprobar
                            </button>
                            <button 
                                onClick={() => handleUpdateStatus(req.id!, 'rejected')}
                                className="flex-1 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                            >
                                Rechazar
                            </button>
                            {req.clientWhatsapp && (
                                <a 
                                    href={`https://wa.me/${req.clientWhatsapp.replace(/\D/g, '')}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="p-1.5 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors"
                                >
                                    <Icon name="phone" className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};

const ActiveSessionsCard: React.FC = () => {
    const { currentUser } = useContext(AppContext);
    const [sessions, setSessions] = useState<any[]>([]);

    useEffect(() => {
        if (!currentUser?.uid) return;
        const sub = onSnapshot(collection(db, `users/${currentUser.uid}/active_sessions`), (snap) => {
            setSessions(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        });
        return () => sub();
    }, [currentUser?.uid]);

    return (
        <Card className="p-5 flex flex-col h-full bg-white dark:bg-dark-surface border-light-border dark:border-dark-border">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary">
                <Icon name="shield" className="w-5 h-5 text-brand-primary" /> Dispositivos
                <InfoTooltip text="Dónde has iniciado sesión recientemente."/>
            </h3>
            {sessions.length === 0 ? (
                <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary text-center">Cargando...</p>
            ) : (
                <div className="space-y-3 flex-grow overflow-y-auto max-h-[250px] custom-scrollbar pr-1">
                    {sessions.map(sess => {
                         const currentId = localStorage.getItem('goatify_device_id');
                         const isCurrent = sess.id === currentId;
                         // Format date relatively
                         const lastActive = sess.lastActive ? new Date(sess.lastActive).toLocaleString('es-ES', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Desconocido';
                         return (
                            <div key={sess.id} className={`flex justify-between items-start p-3 rounded-xl border ${isCurrent ? 'bg-brand-primary/5 border-brand-primary/20' : 'bg-neutral-50 dark:bg-neutral-800/50 border-transparent'}`}>
                                <div className="flex gap-3 items-start">
                                    <div className={`p-2 rounded-xl border ${isCurrent ? 'bg-brand-primary text-white border-transparent' : 'bg-white dark:bg-dark-surface border-light-border dark:border-dark-border text-neutral-500'}`}>
                                        <Icon name={sess.platform === 'Celular' || sess.platform === 'Tablet' ? 'mobile' : 'desktop'} className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold break-all flex items-center gap-2 text-light-text-primary dark:text-dark-text-primary">
                                            {sess.platform} {isCurrent && <span className="text-[9px] bg-brand-primary text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Este disp.</span>}
                                        </p>
                                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-0.5">{sess.userAgent?.substring(0, 30)}...</p>
                                        <p className="text-[9px] text-neutral-400 dark:text-neutral-500 mt-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span> Activo: {lastActive}</p>
                                    </div>
                                </div>
                            </div>
                         );
                    })}
                </div>
            )}
        </Card>
    );
};

const Dashboard: React.FC = () => {
    const { t } = useTranslation();
    const { currentUser, projects, setCurrentView, setSelectedProjectId, userProfile, userUsage, setMeetsInfoOpen } = useContext(AppContext);
    const [currentDateTime, setCurrentDateTime] = useState(new Date());
    useEffect(() => { const timer = setInterval(() => { setCurrentDateTime(new Date()); }, 1000); return () => clearInterval(timer); }, []);
    if (!currentUser) return <Spinner />;
    const displayName = (userProfile.name && userProfile.name !== 'Guest') ? userProfile.name : (currentUser.email ? currentUser.email.split('@')[0] : 'Usuario');
    const hour = currentDateTime.getHours();
    let greeting = "Buenos días"; if (hour >= 12) greeting = "Buenas tardes"; if (hour >= 19) greeting = "Buenas noches";
    const formattedDate = currentDateTime.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const formattedTime = currentDateTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Monitor de Cupo Global
    const planConfig = getPlanConfig(userProfile.plan);
    const chatLimit = (planConfig.limits as any).ai_chat_daily_queries || 30;
    const chatUsed = userUsage?.counters?.daily_chat_count || 0;
    
    // Contadores de Voz/Video
    const voiceMins = userUsage?.counters?.monthly_voice_minutes || 0;
    const voiceLimit = (planConfig.limits as any).voice_live_minutes || 5;
    const videoMins = userUsage?.counters?.monthly_video_minutes || 0;
    const videoLimit = (planConfig.limits as any).video_live_minutes || 1;

    return (
        <div className="animate-fade-in pb-20 lg:pb-10">
            <NotificationPermissionPrompt />
            <ProfileNudge />
            {/* DESACTIVADO TEMPORALMENTE PARA EVITAR BUCLE v1.0 */}
            {/* <AlterEgoTerminal /> */}
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div className="flex items-start gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-light-text-primary dark:text-dark-text-primary capitalize">
                            {greeting}, {displayName}!
                        </h1>
                        <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">{t('productivitySnapshot')}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                        <div className="bg-brand-primary/10 px-3 py-1.5 rounded-xl border border-brand-primary/20 flex items-center gap-2 shadow-sm">
                            <Icon name="ai" className="w-3 h-3 text-brand-primary" />
                            <span className="text-[9px] font-black uppercase text-brand-primary">Energía: {chatUsed}/{chatLimit}</span>
                        </div>
                        <div className="bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                            <Icon name="mic" className="w-3 h-3 text-blue-600" />
                            <span className="text-[9px] font-black uppercase text-blue-600">Voz: {voiceMins.toFixed(1)}/{voiceLimit}m</span>
                        </div>
                        <div className="bg-pink-100 dark:bg-pink-900/30 px-3 py-1.5 rounded-xl border border-pink-200 dark:border-pink-800 flex items-center gap-2">
                            <Icon name="video" className="w-3 h-3 text-pink-600" />
                            <span className="text-[9px] font-black uppercase text-pink-600">Video: {videoMins.toFixed(1)}/{videoLimit}m</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-light text-brand-primary dark:text-white tabular-nums leading-none">{formattedTime}</p>
                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary capitalize">{formattedDate}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <div 
                        onClick={() => setMeetsInfoOpen(true)}
                        className="bg-gradient-to-r from-brand-primary via-purple-700 to-indigo-900 p-4 rounded-2xl text-white shadow-xl flex items-center justify-between cursor-pointer hover:scale-[1.01] transition-all group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-3 relative z-10">
                            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                <Icon name="video" className="w-6 h-6"/>
                            </div>
                            <div>
                                <p className="font-black text-xs uppercase tracking-widest">GOATIFY MEETS</p>
                                <p className="text-[10px] opacity-80">La plataforma de reuniones de última generación.</p>
                            </div>
                        </div>
                        <span className="text-[10px] font-black bg-white text-brand-primary px-3 py-1 rounded-full relative z-10 shadow-lg">CONOCER MÁS</span>
                    </div>

                    <UpcomingMeetingsCard />
                    <LoyaltyProgressCard />
                    
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">{t('activeProjects')} <InfoTooltip text="Tus proyectos en curso con progreso."/></h2>
                    </div>
                    
                    {projects.length > 0 ? (
                        <div className="max-h-[26rem] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {projects.map(project => {
                                    // FIX: Securizar acceso a carpetas para el cálculo de progreso
                                    const projectTasks = (project.folders || []).flatMap(f => f.tasks || []) || [];
                                    const completed = projectTasks.filter(t => t.status === 'Hecho').length;
                                    const progress = projectTasks.length > 0 ? (completed / projectTasks.length) * 100 : 0;
                                    const projectColor = getProjectHexColor(project.id);
                                    return (
                                        <Card key={project.id} className="relative flex flex-col p-4 sm:p-6 transition-all duration-300 hover:shadow-lg border-t-4 h-full" style={{ borderTopColor: projectColor }}>
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-bold text-sm sm:text-lg truncate pr-1 w-full" title={project.name}>{project.name}</h3>
                                            </div>
                                            <div className="flex-grow">
                                                <p className="text-xs sm:text-sm text-light-text-secondary dark:text-dark-text-secondary mb-3 line-clamp-1">
                                                    {(project.folders || []).length} carpetas • {projectTasks.length} tareas
                                                </p>
                                                <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5 sm:h-2 mb-1">
                                                    <div className="h-1.5 sm:h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: projectColor }}></div>
                                                </div>
                                                <div className="text-right text-[10px] sm:text-xs text-light-text-secondary dark:text-dark-text-secondary font-semibold">
                                                    {progress.toFixed(0)}%
                                                </div>
                                            </div>
                                            <Button variant="secondary" size="sm" className="w-full mt-4 text-xs sm:text-sm" onClick={() => {
                                                setCurrentView('projects');
                                                setSelectedProjectId(project.id);
                                                window.location.hash = `projects/${project.id}`;
                                            }}>Abrir</Button>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <Card className="text-center p-12 border-2 border-dashed border-neutral-300 dark:border-neutral-700 bg-transparent">
                            <Icon name="projects" className="w-16 h-16 mx-auto text-neutral-400 mb-4"/>
                            <h3 className="text-xl font-bold mb-2">{t('noProjectsFound')}</h3>
                            <p className="text-light-text-secondary dark:text-dark-text-secondary mb-6">{t('createProjectToStart')}</p>
                        </Card>
                    )}
                    
                    <FollowUpCard />
                    <FavoriteContactsCard />
                    <MyGroupsCard />
                    <QuickActions />
                </div>
                 
                <div className="lg:col-span-1 space-y-6">
                    <MeetingRequestsCard />
                    <ProductivityAnalysisCard />
                    <FinancialSummary />
                    <UpcomingTasks />
                    <ActiveSessionsCard />
                    <SavedRecordingsCard />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
