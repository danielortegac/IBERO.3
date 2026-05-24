import React, { useState, useEffect, useContext, useMemo, useRef, lazy, Suspense } from 'react';
import { AppContext } from './context/AppContext';
import { CallProvider, CallContext } from './context/CallContext';
import { Toaster } from 'sonner';
import Sidebar from './components/Sidebar';
const Dashboard = lazy(() => import('./components/Dashboard'));
const Projects = lazy(() => import('./components/Projects'));
const GlobalCalendar = lazy(() => import('./components/GlobalCalendar'));
const DiscoveryHub = lazy(() => import('./components/DiscoveryHub'));
const Hub = lazy(() => import('./components/Hub'));
const Wallet = lazy(() => import('./components/Wallet'));
const Partners = lazy(() => import('./components/Partners'));
const AiStudio = lazy(() => import('./components/AiStudio'));
const Profile = lazy(() => import('./components/Profile'));
const AiChat = lazy(() => import('./components/AiChat'));
import ProModal from './components/ProModal';
import Onboarding from './components/Onboarding';
import BookSummaryPage from './components/BookSummaryPage';
import PublicFormPage from './components/PublicFormPage';
import PublicSitePage from './components/PublicSitePage';
import PublicSalesRoomPage from './components/PublicSalesRoomPage'; 
import PublicProjectPage from './components/PublicProjectPage';
import GoatifyScheduler from './components/GoatifyScheduler';
const GoatifyDrive = lazy(() => import('./components/GoatifyDrive')); 
const GoatifyMail = lazy(() => import('./components/GoatifyMail'));
const Campus = lazy(() => import('./components/Campus'));
import Spinner from './components/ui/Spinner';
import Toast from './components/ui/Toast';

const GoatifyChill = lazy(() => import('./components/chill/GoatifyChill'));
import ArticlePage from './components/ArticlePage';
import Icon from './components/Icon';
import AgentPublicPage from './components/AgentPublicPage';
import NotificationsPanel from './components/NotificationsPanel';
import NotificationSettingsModal from './components/NotificationSettingsModal';
import CallOverlay from './components/CallOverlay';
import NewTaskModal from './components/NewTaskModal';
import TaskEditModal from './components/TaskEditModal';
import VoiceActionOverlay from './components/VoiceActionOverlay'; 
import BottomShortcuts from './components/BottomShortcuts';
import WelcomeModal from './components/WelcomeModal';
import PremiumTrialModal from './components/PremiumTrialModal';
import AnnouncementPopup from './components/AnnouncementPopup'; 
import MeetsInfoModal from './components/MeetsInfoModal';
const AdvancedChat = lazy(() => import('./components/AdvancedChat'));
import PlanCreditBadge from './components/PlanCreditBadge';
const LiveConversation = lazy(() => import('./components/LiveConversation'));
const SmartPOS = lazy(() => import('./components/pos/SmartPOS'));
import PublicReceiptPage from './components/pos/PublicReceiptPage';
import { useTranslation } from './hooks/useTranslation';
import { View, Notification, CallSession, ProjectClient, PartnerLead, HubPost, UserProfile } from './types';
import { useSwipe } from './hooks/useSwipe';
import { notificationService } from './services/notificationService';
import { sendEmailVerification } from 'firebase/auth';
import { collection, onSnapshot, query, where, updateDoc, doc, increment, setDoc, limit, orderBy, getDocs, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { recordAppEntry } from './services/subscriptionService';
import { executeAutonomousPulse, executeImmediateReflex } from './services/alterEgoService';

const SILENT_AUDIO_URL = "data:audio/mp3;base64,SUQzBAAAAAABAFRYWFgAAAASAAADbWFqb3JfYnJhbmQAbXA0MgBUWFhYAAAAEQAAA21pbm9yX3ZlcnNpb24AMABUWFhYAAAAHAAAA2NvbXBhdGlibGVfYnJhbmRzAGlzb21tcDQyAFRTU0UAAAAPAAADTGF2ZjU3LjU2LjEwMAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

const VerificationBanner: React.FC = () => {
    const { currentUser, updateUserProfile, userProfile } = useContext(AppContext);
    const [show = true, setShow] = useState(true);
    const [refreshing = false, setRefreshing] = useState(false);
    const [resending = false, setResending] = useState(false);
    const [resendMsg = '', setResendMsg] = useState('');

    if (!currentUser || (userProfile.emailVerified || currentUser.emailVerified) || !show) return null;

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await currentUser.reload();
            if (currentUser.emailVerified) {
                 await updateUserProfile(currentUser.uid, { emailVerified: true });
                 setTimeout(() => { window.location.reload(); }, 1000);
            } else {
                setResendMsg('Aún no verificado...');
                setTimeout(() => setResendMsg(''), 3000);
            }
        } catch (e) { console.error("Error verifying", e); } finally { setRefreshing(false); }
    };

    const handleResendEmail = async () => {
        setResending(true);
        try {
            await sendEmailVerification(currentUser);
            setResendMsg('¡Enviado!');
            setTimeout(() => setResendMsg(''), 3000);
        } catch (e) {
            console.error("Error resending email", e);
            setResendMsg('Espera unos minutos...');
            setTimeout(() => setResendMsg(''), 3000);
        } finally { setResending(false); }
    };

    return (
        <div className="bg-amber-500 text-black px-2 md:px-4 py-2 text-[10px] md:text-xs lg:text-sm font-medium flex flex-col md:flex-row justify-between items-center relative z-50 shadow-sm gap-1 md:gap-3 text-center md:text-left whitespace-normal md:whitespace-nowrap">
            <div className="flex items-center justify-center md:justify-start gap-1 md:gap-2 w-full md:w-auto">
                <Icon name="lock" className="w-4 h-4 hidden md:block flex-shrink-0"/>
                <span>
                    Acción Requerida: Verifica tu cuenta, revisa tu correo (carpeta de no deseados) busca un mail de Goatify IA.
                </span>
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-center flex-shrink-0 mt-1 md:mt-0">
                {resendMsg ? (
                    <span className="text-white animate-pulse font-bold">{resendMsg}</span>
                ) : (
                    <button onClick={handleResendEmail} className="underline hover:text-white transition-colors font-bold">
                        {resending ? 'Enviando...' : 'Reenviar'}
                    </button>
                )}
                <div className="h-3 w-px bg-black/20 hidden md:block"></div>
                <button onClick={handleRefresh} disabled={refreshing} className="bg-black/10 hover:bg-black/20 px-3 py-1 rounded transition-colors font-bold border border-black/10">
                    {refreshing ? 'Verificando...' : 'Ya verifiqué'}
                </button>
                <button onClick={() => show && setShow(false)} className="p-1 hover:bg-black/10 rounded"><Icon name="close" className="w-3 h-3"/></button>
            </div>
        </div>
    );
}

const InAppMessageBanner: React.FC = () => {
    const { notifications, setDeepLinkTarget, setCurrentView, setActiveHubView, markNotificationAsRead } = useContext(AppContext);
    const [visibleNotification, setVisibleNotification] = useState<Notification | null>(null);
    const lastNotificationIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (notifications.length > 0) {
            const latest = notifications[0];
            const isRecent = (new Date(latest.timestamp).getTime() > Date.now() - 30000);
            
            if (latest.id !== lastNotificationIdRef.current && !latest.read && isRecent) {
                const isPriority = ['new_message', 'sticker', 'incoming_call', 'missed_call', 'project_invite', 'project_update', 'group_post', 'agent_message', 'repost'].includes(latest.type) || (latest.type === 'general');
                
                if (isPriority) {
                    setVisibleNotification(latest);
                    lastNotificationIdRef.current = latest.id;
                    notificationService.playBeep(latest.type === 'incoming_call' ? 'call' : 'message');
                    const timer = setTimeout(() => {
                        setVisibleNotification(null);
                    }, 8000);
                    return () => clearTimeout(timer);
                }
            }
        }
    }, [notifications]);

    const handleDismiss = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setVisibleNotification(null);
    };

    const handleClick = () => {
        if (!visibleNotification) return;
        markNotificationAsRead(visibleNotification.id);
        
        if (visibleNotification.link) {
             if (visibleNotification.link.includes('messages/')) {
                 const parts = visibleNotification.link.split('/');
                 const conversationId = parts[parts.length - 1];
                 setCurrentView('hub');
                 setActiveHubView('messages');
                 setDeepLinkTarget({ view: 'messages', id: conversationId });
                 window.location.hash = `hub/messages/${conversationId}`;
            } else if (visibleNotification.link.includes('calls/')) {
                 const parts = visibleNotification.link.split('/');
                 const callId = parts[parts.length - 1];
                 window.location.hash = `calls/${callId}`;
            } else if (visibleNotification.link.includes('group/')) {
                 const parts = visibleNotification.link.split('/');
                 const conversationId = parts[parts.length - 1];
                 setCurrentView('hub');
                 setActiveHubView('groups');
                 setDeepLinkTarget({ view: 'groups', id: conversationId });
                 window.location.hash = `hub/group/${conversationId}`;
            } else if (visibleNotification.link.includes('feed/')) {
                const parts = visibleNotification.link.split('/');
                const postId = parts[parts.length - 1];
                setCurrentView('hub');
                setActiveHubView('feed');
                setDeepLinkTarget({ view: 'post', id: postId });
                window.location.hash = `hub/feed/${postId}`;
            }
        }
        setVisibleNotification(null);
    };

    const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
        onSwipedUp: () => setVisibleNotification(null)
    });

    if (!visibleNotification) return null;

    const fromName = visibleNotification.fromUser?.name || "Notificación";
    const initials = fromName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    return (
        <div 
            onClick={handleClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="fixed top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-96 z-[3000] bg-white/95 dark:bg-neutral-800/95 backdrop-blur-md shadow-2xl rounded-2xl p-3 border border-gray-200 dark:border-gray-700 flex items-center gap-3 cursor-pointer animate-slide-in-up origin-top transform transition-all duration-300 hover:scale-[1.02] ring-1 ring-black/5"
        >
            <div className="relative flex-shrink-0">
                {visibleNotification.fromUser?.avatarUrl ? (
                    <img 
                        src={visibleNotification.fromUser.avatarUrl} 
                        className="w-10 h-10 rounded-full object-cover shadow-sm border border-neutral-100 dark:border-neutral-700" 
                        alt="Avatar"
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-white font-bold text-sm shadow-sm uppercase">
                        {initials || <Icon name="bell" className="w-5 h-5"/>}
                    </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-brand-primary rounded-full p-0.5 border-2 border-white dark:border-neutral-800">
                    <Icon name="bell" className="w-2 h-2 text-white"/>
                </div>
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                    {fromName}
                </h4>
                <div className="text-xs text-gray-600 dark:text-gray-300 truncate" dangerouslySetInnerHTML={{__html: visibleNotification.text}}></div>
            </div>
            <div className="flex flex-col items-end gap-1">
                 <button 
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 group"
                    title="Cerrar"
                 >
                    <Icon name="close" className="w-4 h-4 group-hover:scale-110 transition-transform"/>
                 </button>
                 <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest whitespace-nowrap">Ahora</span>
            </div>
        </div>
    );
};

const AppContent: React.FC = () => {
  const { 
    currentUser, authLoading, currentView, isOnboardingComplete, 
    theme, isAiChatOpen, setAiChatOpen, isProModalOpen, setProModalOpen,
    toastNotification, setToastNotification, setOnboardingComplete,
    isSidebarCollapsed, notifications, projects, selectedProjectId, activeHubView,
    isFullScreenActive,
    viewingProfile, setCurrentView, setSelectedProjectId, setActiveHubView, setDeepLinkTarget,
    userProfile, totalUnreadMessages,
    isNewTaskModalOpen, setNewTaskModalOpen, newTaskModalDate, createTask,
    isTaskEditModalOpen, setTaskEditModalOpen, editingTask, updateTask, setEditingTask,
    allBooks, isLiveSessionActive, disconnectLiveSession, isAgentFullScreen,
    createNotification,
    isMeetsInfoOpen, setMeetsInfoOpen, allLeads, addNewGlobalChat,
    isScreenSharingGlobal, liveSessionMode, goatifyNews, hubPosts, allUsers
  } = useContext(AppContext);
  const { t } = useTranslation();

  const [isMobileOpen = false, setMobileOpen] = useState(false);
  const [path, setPath] = useState(window.location.hash);
  const [showNotifications = false, setShowNotifications] = useState(false);
  const [showNotificationSettings = false, setShowNotificationSettings] = useState(false);
  const [isWelcomeModalOpen = false, setIsWelcomeModalOpen] = useState(false);
  const [isTrialModalOpen = false, setIsTrialModalOpen] = useState(false);
  const [scheduledCalls = [], setScheduledCalls] = useState<CallSession[]>([]);

  const backgroundAudioRef = useRef<HTMLAudioElement>(null);
  const [backgroundAudioStarted = false, setBackgroundAudioStarted] = useState(false);

  const remindedMeetingsRef = useRef<Set<string>>(new Set());
  const remindedTasksRef = useRef<Set<string>>(new Set());

  // --- MONITOR GLOBAL DE TAREAS Y NOTIFICACIONES ---
  useEffect(() => {
      if (!currentUser || authLoading) return;
      
      const interval = setInterval(() => {
          const now = new Date();
          const nowTime = now.getTime();
          const todayStr = now.toISOString().split('T')[0];
          const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          // Revisar todas las tareas en todos los proyectos
          projects.forEach(project => {
              project.folders?.forEach(folder => {
                  folder.tasks?.forEach(task => {
                      if (!task.date || !task.time || task.status === 'Completada' || task.status === 'Hecho') return;

                      const taskKey = `${task.id}-${todayStr}-${task.time}`;
                      
                      // Solo notificar si es para hoy
                      if (task.date === todayStr) {
                          // Calcular diferencia en minutos
                          const [tHour, tMin] = task.time.split(':').map(Number);
                          const taskDateObj = new Date(now);
                          taskDateObj.setHours(tHour, tMin, 0, 0);
                          
                          const diffMinutes = (taskDateObj.getTime() - nowTime) / 60000;

                          // Caso 1: Recordatorio 10 minutos antes
                          if (diffMinutes > 9 && diffMinutes <= 10 && !remindedTasksRef.current.has(`${taskKey}-10m`)) {
                              remindedTasksRef.current.add(`${taskKey}-10m`);
                              notificationService.playBeep('message');
                              notificationService.showNotification('Tarea Próxima', { 
                                  body: `En 10 min: "${task.title}"`, 
                                  tag: task.id, 
                                  data: { url: `/#/projects/${project.id}/task/${task.id}` } 
                              });
                              createNotification(currentUser.uid, { 
                                  type: 'general', 
                                  text: `⏳ **Recordatorio:** "${task.title}" empieza en 10 min.`, 
                                  link: `/#/projects/${project.id}/task/${task.id}`, 
                                  fromUser: { uid: 'system', name: 'Goatify Tasks', avatarUrl: null } 
                              });
                          }

                          // Caso 2: ¡Es la hora!
                          if (diffMinutes >= -0.5 && diffMinutes <= 0.5 && !remindedTasksRef.current.has(`${taskKey}-now`)) {
                              remindedTasksRef.current.add(`${taskKey}-now`);
                              notificationService.playBeep('call'); // Sonido más fuerte para el vencimiento
                              notificationService.showNotification('¡Tarea Ahora!', { 
                                  body: `Es momento de: "${task.title}"`, 
                                  tag: task.id, 
                                  data: { url: `/#/projects/${project.id}/task/${task.id}` } 
                              });
                              createNotification(currentUser.uid, { 
                                  type: 'general', 
                                  text: `🚀 **¡Ahora!** Tarea pendiente: "${task.title}"`, 
                                  link: `/#/projects/${project.id}/task/${task.id}`, 
                                  fromUser: { uid: 'system', name: 'Goatify Tasks', avatarUrl: null } 
                              });
                          }
                      }
                  });
              });
          });
      }, 30000); // Revisar cada 30 segundos
      
      return () => clearInterval(interval);
  }, [projects, currentUser, authLoading, createNotification]);

  // --- CÁLCULO DE PUBLICACIONES NO LEÍDAS PARA EL HEADER ---
  const unreadPostsCount = useMemo(() => {
    if (!currentUser) return 0;
    return hubPosts.filter(p => !p.groupId && !p.readBy?.includes(currentUser.uid)).length;
  }, [hubPosts, currentUser]);

  // --- SENTINEL GLOBAL DE ALTER EGO v17.5 (SWARM ENGINE) ---
  const sentinelRun = async () => {
    if (!currentUser || authLoading || !userProfile?.alterEgo?.enabled) return;
    
    const now = Date.now();
    const user = userProfile; // Use the current user profile directly

    const lastPulse = user.alterEgo.lastPulseAt ? new Date(user.alterEgo.lastPulseAt).getTime() : 0;
    const frequencyMinutes = (24 * 60) / (user.alterEgo.frequencyPerDay || 12);
    
    // Si es hora de actuar o hay posteos sin respuesta que le pertenezcan
    if (now - lastPulse > frequencyMinutes * 60000) {
        // Obtenemos contexto global para este agente específico
        const userProjects = projects.filter(p => p.ownerId === user.uid && p.allowAlterEgo);
        const userLeads = allLeads.filter(l => l.partnerId === user.uid);
        await executeAutonomousPulse(user, userProjects, goatifyNews, hubPosts, userLeads);
    }
  };

  useEffect(() => {
    if (currentUser && !authLoading) {
        const initialTimer = setTimeout(sentinelRun, 5000); // Increased delay to ensure profile load
        const globalSentinelInterval = setInterval(sentinelRun, 60000); // Latido cada minuto
        return () => {
            clearTimeout(initialTimer);
            clearInterval(globalSentinelInterval);
        };
    }
  }, [currentUser, authLoading, userProfile.alterEgo?.lastPulseAt, userProfile.alterEgo?.enabled]);

  // Listener de Reflejos Reactivos Instantáneos v17.5
  useEffect(() => {
    if (currentUser && !authLoading) {
        const hubQuery = query(collection(db, "hubPosts"), orderBy("timestamp", "desc"), limit(20));
        const unsubReflex = onSnapshot(hubQuery, (snap) => {
            snap.docChanges().forEach(async (change) => {
                if (change.type === 'modified' || change.type === 'added') {
                    const post = { id: change.doc.id, ...change.doc.data() } as HubPost;
                    if (post.comments.length > 0) {
                        const lastComment = post.comments[post.comments.length - 1];
                        const potentialResponders = allUsers.filter(u => {
                            if (!u.alterEgo?.enabled) return false;
                            // Evitar que el agente se responda a sí mismo (bucle infinito)
                            if (u.uid === lastComment.author.uid && lastComment.isAgentComment) return false;
                            // PERMITIR que el agente responda a su humano (si el humano comentó manualmente)
                            if (u.uid === lastComment.author.uid && !lastComment.isAgentComment) return true;
                            // Permitir responder a otros
                            return u.uid !== lastComment.author.uid;
                        });
                        
                        potentialResponders.forEach(async (pUser) => {
                            const alreadyInThread = post.comments.some(c => c.author.uid === pUser.uid);
                            if (!alreadyInThread) {
                                await executeImmediateReflex(pUser, post, lastComment);
                            }
                        });
                    } else if (change.type === 'added') {
                        const potentialResponders = allUsers.filter(u => u.alterEgo?.enabled && u.uid !== post.author.uid);
                        potentialResponders.forEach(async (pUser) => {
                            await executeImmediateReflex(pUser, post, { text: post.content, author: post.author, id: 'init', timestamp: post.timestamp } as any);
                        });
                    }
                }
            });
        });
        return () => unsubReflex();
    }
  }, [currentUser, authLoading, allUsers.length]);

  // --- LOGICA DE RUTAS PÚBLICAS ---
  const currentHash = window.location.hash;

  if (currentHash.startsWith('#/article/')) {
    const articleId = currentHash.split('/')[2]?.split('?')[0];
    if (articleId) return <ArticlePage articleId={articleId} />;
  }

  if (currentHash.startsWith('#/book/')) {
    const parts = currentHash.split('?');
    const queryParams = new URLSearchParams(parts[1] || '');
    const exactId = queryParams.get('id');
    const bookIdOrSlug = exactId || parts[0].split('/')[2];
    if (bookIdOrSlug) return <BookSummaryPage bookId={bookIdOrSlug} />;
  }

  if (currentHash.startsWith('#/site/')) {
    const siteId = currentHash.split('/')[2]?.split('?')[0];
    if (siteId) return <PublicSitePage siteId={siteId} />;
  }

  if (currentHash.startsWith('#/p/')) {
    const urlId = currentHash.split('/')[2]?.split('?')[0];
    if (urlId) return <PublicProjectPage urlId={urlId} />;
  }

  if (currentHash.startsWith('#/sales-room/')) {
      const roomId = currentHash.split('/')[2]?.split('?')[0];
      if (roomId) return <PublicSalesRoomPage roomId={roomId} />;
  }

  if (currentHash.startsWith('#/pos/')) {
      const parts = currentHash.split('?');
      const queryParams = new URLSearchParams(parts[1] || '');
      let projectId = queryParams.get('id') || parts[0].split('/')[2];
      
      // Resolve name to ID if needed
      if (projectId && !projects.find(p => p.id === projectId)) {
          const found = projects.find(p => p.name.replace(/\s+/g, '-') === projectId);
          if (found) projectId = found.id;
      }
      
      if (projectId) return <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}><SmartPOS projectId={projectId} /></Suspense>;
  }

  if (currentHash.startsWith('#/receipt/') || currentHash.startsWith('#/recibo/')) {
      const receiptId = currentHash.split('/')[2]?.split('?')[0];
      if (receiptId) return <PublicReceiptPage receiptId={receiptId} />;
  }

  if (currentHash.startsWith('#/form/')) {
      let rawId = '';
      if (currentHash.startsWith('#/form/id/')) {
          rawId = currentHash.split('/')[3];
      } else {
          rawId = currentHash.split('/')[2];
      }
      const formId = rawId ? rawId.split('?')[0] : null;
      if (formId) return <PublicFormPage formId={formId} />;
  }

  if (currentHash.includes('/agent/')) {
      const cleanH = currentHash.replace('#/', '').replace('#!', '').replace('#', '');
      const parts = cleanH.split('/').filter(Boolean);
      const agentIdx = parts.findIndex(p => p === 'agent');
      let agentIdentifier = '';
      if (agentIdx !== -1 && parts[agentIdx + 1]) {
          if (parts[agentIdx + 1] === 'id' && parts[agentIdx + 2]) { agentIdentifier = parts[agentIdx + 2].split('?')[0]; } 
          else { agentIdentifier = parts[agentIdx + 1].split('?')[0]; }
      }
      if (agentIdentifier) { return <AgentPublicPage agentId={agentIdentifier} />; }
  }

  // TRACK GLOBAL AND USER ENTRY VIEWS & DEVICE SESSIONS
  useEffect(() => {
    if (currentUser && !authLoading && userProfile.uid) {
      const incrementEntryCounters = async () => {
        try {
          const globalStatsRef = doc(db, 'stats', 'global_metrics');
          await updateDoc(globalStatsRef, { app_views: increment(1) }).catch(async () => {
             await setDoc(globalStatsRef, { app_views: 1 }, { merge: true });
          });
          const userRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userRef, { entryCount: increment(1) }).catch(() => {});
        } catch (e) {}
      };
      incrementEntryCounters();
      
      const trackDeviceSession = async () => {
        try {
          let deviceId = localStorage.getItem('goatify_device_id');
          let isNewDevice = false;
          if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem('goatify_device_id', deviceId);
            isNewDevice = true;
          }
          
          const sessionRef = doc(db, `users/${currentUser.uid}/active_sessions`, deviceId);
          if (isNewDevice) {
             const userAgent = navigator.userAgent;
             let platformName = 'Web Browser';
             if (/mobile/i.test(userAgent)) platformName = 'Celular';
             if (/tablet/i.test(userAgent)) platformName = 'Tablet';
             if (/win/i.test(userAgent)) platformName = 'Windows';
             if (/mac/i.test(userAgent)) platformName = 'Mac';
             
             await setDoc(sessionRef, {
                 id: deviceId,
                 userAgent: userAgent,
                 platform: platformName,
                 createdAt: new Date().toISOString(),
                 lastActive: new Date().toISOString(),
                 status: 'active'
             });
             
             // Encolar email de notificación de nuevo dispositivo
             if (userProfile.email) {
                 await addDoc(collection(db, 'mail_queue'), {
                     type: 'SECURITY_ALERT',
                     to: userProfile.email,
                     subject: 'Nuevo inicio de sesión en Goatify',
                     status: 'pending',
                     htmlBody: `
                       <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                         <h2 style="color: #ef4444;">Alerta de Seguridad</h2>
                         <p>Hola ${userProfile.name || 'Usuario'},</p>
                         <p>Hemos detectado un inicio de sesión en un nuevo dispositivo en tu cuenta de Goatify.</p>
                         <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Dispositivo/Sistema:</strong> ${platformName}</p>
                            <p><strong>Navegador:</strong> ${userAgent.substring(0, 50)}...</p>
                            <p><strong>Fecha y Hora:</strong> ${new Date().toLocaleString()}</p>
                         </div>
                         <p>Si fuiste tú, no tienes que hacer nada. Si no reconoces esta actividad, cierra las sesiones desde tu Panel de Control de Goatify y cambia tu contraseña.</p>
                       </div>
                     `,
                     createdAt: new Date().toISOString(),
                 });
             }
          } else {
             await updateDoc(sessionRef, { lastActive: new Date().toISOString(), status: 'active' }).catch(err => {
                 setDoc(sessionRef, { id: deviceId, userAgent: navigator.userAgent, platform: 'Web Browser', createdAt: new Date().toISOString(), lastActive: new Date().toISOString(), status: 'active' });
             });
          }
        } catch (e) {
          console.error("Error tracking device session:", e);
        }
      };
      trackDeviceSession();
    }
  }, [currentUser, authLoading, userProfile.uid]);

  // CRM Follow up logic
  useEffect(() => {
    if (!currentUser || authLoading) return;
    const interval = setInterval(() => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const todayDate = now.toISOString().split('T')[0];
        const triggerHours = [8, 14, 19];
        if (triggerHours.includes(currentHour) && currentMinute === 0) {
            projects.forEach(proj => {
                proj.clients?.forEach(client => {
                    if (client.status !== 'Ganado' && client.status !== 'Perdido' && client.lastFollowUpNotify !== `${todayDate}-${currentHour}`) {
                        createNotification(currentUser.uid, {
                            type: 'general',
                            text: `📈 **Seguimiento CRM**: Es momento de contactar a **${client.name}**. ¡No dejes enfriar la venta!`,
                            link: `/#/projects/${proj.id}/crm`,
                            fromUser: { uid: 'system_crm', name: 'Goatify CRM', avatarUrl: null }
                        });
                        client.lastFollowUpNotify = `${todayDate}-${currentHour}`;
                    }
                });
            });
            allLeads.forEach(lead => {
                if (lead.status !== 'won' && lead.status !== 'lost' && lead.lastFollowUpNotify !== `${todayDate}-${currentHour}`) {
                    createNotification(currentUser.uid, {
                        type: 'general',
                        text: `💼 **Seguimiento SOCIOS**: Revisa el avance de **${lead.clientName}**. Tu comisión espera.`,
                        link: `/#partners`,
                        fromUser: { uid: 'system_crm', name: 'Goatify CRM', avatarUrl: null }
                    });
                    lead.lastFollowUpNotify = `${todayDate}-${currentHour}`;
                }
            });
        }
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser, projects, allLeads, authLoading]);

  useEffect(() => {
      const enableBackgroundAudio = () => {
          if (!backgroundAudioStarted && backgroundAudioRef.current) {
              backgroundAudioRef.current.play()
                  .then(() => { setBackgroundAudioStarted(true); })
                  .catch(() => {});
          }
      };
      window.addEventListener('click', enableBackgroundAudio);
      window.addEventListener('touchstart', enableBackgroundAudio);
      window.addEventListener('keydown', enableBackgroundAudio);
      return () => {
          window.removeEventListener('click', enableBackgroundAudio);
          window.removeEventListener('touchstart', enableBackgroundAudio);
          window.removeEventListener('keydown', enableBackgroundAudio);
      };
  }, [backgroundAudioStarted]);

  useEffect(() => {
      const requestPermissions = async () => {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              stream.getTracks().forEach(track => track.stop());
          } catch (e) {}
      };
      if (currentUser) { requestPermissions(); }
  }, [currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const q = query(collection(db, 'calls'), where('participants', 'array-contains', currentUser.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const calls = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as CallSession))
            .filter(call => call.status === 'scheduled');
          setScheduledCalls(calls);
      });
      return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const interval = setInterval(() => {
          const now = new Date();
          const nowTime = now.getTime();
          scheduledCalls.forEach(call => {
              if (!call.scheduledAt) return;
              const meetingTime = new Date(call.scheduledAt).getTime();
              const diffMinutes = (meetingTime - nowTime) / 60000;
              const id5m = `${call.id}-5m`;
              const idNow = `${call.id}-now`;
              if (diffMinutes > 4 && diffMinutes <= 5 && !remindedMeetingsRef.current.has(id5m)) {
                  remindedMeetingsRef.current.add(id5m);
                  notificationService.playBeep('call');
                  notificationService.showNotification('Reunión en 5 minutos', { body: `La reunión "${call.title}" comienza pronto.`, tag: call.id, data: { url: `/#/calls/${call.id}` } });
                  createNotification(currentUser.uid, { type: 'incoming_call', text: `⏰ **Recordatorio:** "${call.title}" empieza en 5 min.`, link: `/#/calls/${call.id}`, fromUser: { uid: 'system', name: 'Goatify Meet', avatarUrl: null } });
              }
              if (diffMinutes >= -0.5 && diffMinutes <= 0.5 && !remindedMeetingsRef.current.has(idNow)) {
                  remindedMeetingsRef.current.add(idNow);
                  notificationService.playBeep('call');
                  notificationService.showNotification('¡Reunión Iniciando!', { body: `La reunión "${call.title}" está empezando ahora.`, tag: call.id, data: { url: `/#/calls/${call.id}` } });
                  createNotification(currentUser.uid, { type: 'incoming_call', text: `🚀 **¡Iniciando ahora!** "${call.title}"`, link: `/#/calls/${call.id}`, fromUser: { uid: 'system', name: 'Goatify Meet', avatarUrl: null } });
              }
          });
      }, 15000);
      return () => clearInterval(interval);
  }, [scheduledCalls, currentUser, createNotification]);

  useEffect(() => {
      if (currentUser && isOnboardingComplete && !authLoading) {
          if (userProfile.plan !== 'premium') {
               const timer = setTimeout(() => { setIsTrialModalOpen(true); }, 2000);
               return () => clearTimeout(timer);
          }
      }
  }, [currentUser, isOnboardingComplete, authLoading, userProfile.plan]);

  const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
      onSwipedRight: () => {
          if (isAiChatOpen) {
              setAiChatOpen(false);
          } else if (!isMobileOpen) {
              const closeSubEvt = new CustomEvent('toggleSubmenu', { detail: { open: false } });
              window.dispatchEvent(closeSubEvt);
              setMobileOpen(true);
          }
      },
      onSwipedLeft: () => {
          if (isMobileOpen) {
              setMobileOpen(false);
          } else if (!isAiChatOpen) {
              handleQuickAssistantClick();
          }
      }
  });
  
  useEffect(() => { (window as any).openMainSidebar = () => setMobileOpen(true); }, []);

  useEffect(() => {
      const handleHashChange = () => {
          const rawHash = window.location.hash;
          setPath(rawHash);
          const cleanHash = rawHash.replace('#/', '').replace('#', '').replace('#!', '');
          if (!cleanHash) return;
          const cleanHashPath = cleanHash.split('?')[0];
          const parts = cleanHashPath.split('/');
          const mainView = parts[0] as View;
          if ((mainView as string) === 'calls' && parts[1]) {
               if (!currentUser && !authLoading) { localStorage.setItem('pendingCallId', parts[1]); }
               return;
          }
          if (['dashboard', 'projects', 'globalCalendar', 'discovery', 'hub', 'wallet', 'partners', 'aiStudio', 'profile', 'sales_room', 'drive', 'chill', 'mail', 'scheduler', 'campus'].includes(mainView)) { setCurrentView(mainView); }
          if (mainView === 'projects') {
              const projectId = parts[1];
              if (projectId) {
                  setSelectedProjectId(projectId);
                  if (parts[2] === 'task' && parts[3]) { setDeepLinkTarget({ view: 'task', id: parts[3] }); } 
                  else if (parts[2]) { setDeepLinkTarget({ view: parts[2] as any, id: projectId }); }
              } else { setSelectedProjectId(null); }
          } else if (mainView === 'hub') {
              if (parts[1] === 'feed' && parts[2]) { setActiveHubView('feed'); setDeepLinkTarget({ view: 'post', id: parts[2] }); } 
              else if (parts[1] === 'group' && parts[2]) { setActiveHubView('groups'); const action = parts[3] === 'requests' ? 'requests' : undefined; setDeepLinkTarget({ view: 'groups', id: parts[2], action }); window.location.hash = `hub/group/${parts[2]}`; } 
              else if (parts[1] === 'messages' && parts[2]) { setActiveHubView('messages'); setDeepLinkTarget({ view: 'messages', id: parts[2] }); } 
              else if (parts[1]) { setActiveHubView(parts[1] as any); }
          } else if (mainView === 'mail') {
              if (parts[1] === 'view' && parts[2]) {
                  setDeepLinkTarget({ view: 'email', id: parts[2] });
              }
          }
      };
      handleHashChange();
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setCurrentView, setSelectedProjectId, setActiveHubView, setDeepLinkTarget, currentUser, authLoading]);

  const { joinMeeting } = useContext(CallContext);
  useEffect(() => {
      const hash = window.location.hash;
      if (currentUser && hash.includes('#/calls/')) {
          const callId = hash.split('/calls/')[1];
          if (callId) { joinMeeting(callId); }
      }
  }, [currentUser, window.location.hash]);

  useEffect(() => {
    if (theme === 'dark') { document.documentElement.classList.add('dark'); } 
    else { document.documentElement.classList.remove('dark'); }
  }, [theme]);

  const getHeaderTitle = () => {
      switch (currentView) {
          case 'dashboard': return t('dashboard');
          case 'projects': 
              if (selectedProjectId) {
                  const proj = projects.find(p => p.id === selectedProjectId);
                  return proj ? proj.name : t('projects');
              }
              return t('projects');
          case 'globalCalendar': return t('globalCalendar');
          case 'discovery': return t('discovery');
          case 'hub': 
              if (activeHubView === 'feed') return 'Comunidad';
              if (activeHubView === 'groups') return 'Grupos';
              if (activeHubView === 'messages') return 'Mensajes';
              if (activeHubView === 'marketplace') return 'Mercado';
              return t('hub');
          case 'wallet': return t('intisWallet');
          case 'partners': return t('partners');
          case 'aiStudio': return (<><span className="hidden lg:inline">Apps of Artificial Intelligence</span><span className="lg:hidden text-xs">Apps of Artificial Intelligence</span></>);
          case 'profile': return viewingProfile ? viewingProfile.name : t('myProfile');
          case 'drive': return 'Goatify Drive';
          case 'mail': return 'Mailing & Campañas';
          case 'chill': return 'Goatify Chill';
          case 'campus': return 'Campus';
          default: return 'Goatify IA';
      }
  };

  const handleQuickAssistantClick = async () => {
    await addNewGlobalChat();
    setAiChatOpen(true);
  };

  const handleOnboardingComplete = (showWelcome: boolean = false) => {
    setOnboardingComplete(true);
    const pendingRedirect = localStorage.getItem('pendingRedirect');
    if (pendingRedirect) {
        localStorage.removeItem('pendingRedirect');
        window.location.hash = pendingRedirect;
        return;
    }
    const pendingCallId = localStorage.getItem('pendingCallId');
    if (pendingCallId) { localStorage.removeItem('pendingCallId'); window.location.hash = `#/calls/${pendingCallId}`; }
    if (showWelcome) { setIsWelcomeModalOpen(true); }
  };

  const isArticleRoute = currentHash.startsWith('#/article/');
  const isBookRoute = currentHash.startsWith('#/book/');
  const isPublicSpecialRoute = isArticleRoute || isBookRoute;
  const isPublicAgentRoute = currentHash.includes('/agent/');
  const isPublicSiteRoute = currentHash.startsWith('#/site/');
  const isPublicFormRoute = currentHash.startsWith('#/form/');
  const isPublicSalesRoomPage = currentHash.startsWith('#/sales-room/');
  const isPublicProjectRoute = currentHash.startsWith('#/p/');
  const isPublicSchedulerRoute = currentHash.startsWith('#/s/');
  const isFastPathRoute = isPublicAgentRoute || isPublicSiteRoute || isPublicFormRoute || isPublicSalesRoomPage || isPublicProjectRoute || isPublicSchedulerRoute;

  if (isFastPathRoute) {
      if (isPublicAgentRoute) {
          const cleanH = currentHash.replace('#/', '').replace('#!', '').replace('#', '');
          const parts = cleanH.split('/').filter(Boolean);
          const agentIdx = parts.findIndex(p => p === 'agent');
          let agentIdentifier = '';
          if (agentIdx !== -1 && parts[agentIdx + 1]) {
              if (parts[agentIdx + 1] === 'id' && parts[agentIdx + 2]) { agentIdentifier = parts[agentIdx + 2].split('?')[0]; } 
              else { agentIdentifier = parts[agentIdx + 1].split('?')[0]; }
          }
          if (agentIdentifier) return <AgentPublicPage agentId={agentIdentifier} />;
      }
      if (isPublicSiteRoute) {
          const siteId = currentHash.split('/')[2]?.split('?')[0];
          if (siteId) return <PublicSitePage siteId={siteId} />;
      }
      if (isPublicFormRoute) {
          let rawId = '';
          if (currentHash.startsWith('#/form/id/')) {
              rawId = currentHash.split('/')[3];
          } else {
              rawId = currentHash.split('/')[2];
          }
          const formId = rawId ? rawId.split('?')[0] : null;
          if (formId) return <PublicFormPage formId={formId} />;
      }
      if (isPublicSalesRoomPage) {
          const roomId = currentHash.split('/')[2]?.split('?')[0];
          if (roomId) return <PublicSalesRoomPage roomId={roomId} />;
      }
      if (isPublicProjectRoute) {
          const urlId = currentHash.split('/')[2]?.split('?')[0];
          if (urlId) return <PublicProjectPage urlId={urlId} />;
      }
      if (isPublicSchedulerRoute) {
          const username = currentHash.split('/')[2]?.split('?')[0];
          if (username) return <GoatifyScheduler isPublic={true} username={username} />;
      }
  }

  if (authLoading && !userProfile.uid && !isPublicSpecialRoute && !isFastPathRoute) { 
      return <div className="flex items-center justify-center h-screen bg-light-bg dark:bg-dark-bg"><Spinner /></div>; 
  }

  const hasCachedProfile = !!localStorage.getItem('goatify_user_profile');
  if (((!currentUser && !hasCachedProfile) || !isOnboardingComplete) && !isPublicSpecialRoute && !isFastPathRoute) {
      const hash = window.location.hash;
      if (hash.includes('#/calls/')) { localStorage.setItem('pendingCallId', hash.split('/calls/')[1]); }
      return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'projects': return <Projects />;
      case 'globalCalendar': return <GlobalCalendar />;
      case 'discovery': return <DiscoveryHub />;
      case 'hub': return <Hub />;
      case 'wallet': return <Wallet />;
      case 'partners': return <Partners />;
      case 'aiStudio': return <AiStudio />;
      case 'profile': return <Profile user={viewingProfile} />;
      case 'drive': return <GoatifyDrive />;
      case 'mail': return <GoatifyMail />;
      case 'chill': 
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
            <GoatifyChill />
          </Suspense>
        );
      case 'scheduler': return <GoatifyScheduler />;
      case 'campus':
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
            <Campus />
          </Suspense>
        );
      default: return <Dashboard />;
    }
  };

  const unreadNotifCount = notifications.filter(n => {
      if (n.read) return false;
      if (n.type === 'new_message' || n.type === 'sticker') return false;
      const settings = userProfile.notificationSettings;
      if (settings) {
          let settingKey = n.type;
          if (['group_join_request', 'group_join_accepted', 'group_join_denied', 'group_post'].includes(n.type)) settingKey = 'groupPosts';
          if (n.type === 'project_update') settingKey = 'projectUpdates';
          if (n.type === 'news_alert') settingKey = 'newsAlerts';
          if (n.type === 'agent_message') settingKey = 'agentMessages';
          if (n.type === 'incoming_call' || n.text.includes('Llamada')) return true;
          if (settings[settingKey as keyof typeof settings] === false) { return false; }
      }
      return true;
  }).length;
  
  const isFixedLayoutView = (currentView === 'hub' && activeHubView === 'messages') || currentView === 'aiStudio' || currentView === 'globalCalendar' || currentView === 'drive';
  const mainContainerClass = isFixedLayoutView 
      ? `overflow-hidden h-full flex flex-col ${currentView === 'aiStudio' ? 'p-0' : 'p-0 lg:p-8'} pb-0` 
      : `overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pb-[env(safe-area-inset-bottom)]`;

  return (
    <div 
        className="absolute inset-0 h-full w-full bg-light-bg dark:bg-dark-bg text-light-text-primary dark:text-dark-text-primary transition-colors duration-300 font-sans overflow-hidden touch-action-pan-y"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
    >
       <audio ref={backgroundAudioRef} src={SILENT_AUDIO_URL} loop muted={false} autoPlay={false} style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01, pointerEvents: 'none' }} />

       <Sidebar 
          isMobileOpen={isMobileOpen} 
          setMobileOpen={setMobileOpen} 
          onToggleAIChat={() => setAiChatOpen(!isAiChatOpen)} 
          onShowProModal={() => setProModalOpen(true)}
       />
       
       {!userProfile.hideShivo && <VoiceActionOverlay />}
       <AnnouncementPopup />
       
       <div className={`flex-1 flex flex-col h-full overflow-hidden relative transition-all duration-300 ${isFullScreenActive ? 'z-[9999]' : 'z-10'} ${isFullScreenActive ? 'ml-0' : (isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64')}`}>
          
          <VerificationBanner />

           {!isFullScreenActive && (
             <header className="bg-light-surface dark:bg-dark-surface shadow-sm flex flex-nowrap justify-between items-center px-4 lg:px-6 z-20 flex-shrink-0 border-b border-light-border dark:border-dark-border pt-[env(safe-area-inset-top)] min-h-[calc(4rem+env(safe-area-inset-top))] lg:min-h-[calc(4.5rem+env(safe-area-inset-top))] h-auto pb-1 lg:py-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink min-w-0">
                  <button onClick={() => setMobileOpen(true)} className="lg:hidden p-1.5 sm:p-2 hover:bg-light-bg dark:hover:bg-dark-bg rounded-full text-light-text-secondary dark:text-dark-text-secondary mt-1 flex-shrink-0">
                      <Icon name="hamburger" className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <h1 className="font-bold text-base sm:text-lg lg:text-xl truncate text-brand-primary dark:text-white mt-2 flex-grow min-w-0">
                      {getHeaderTitle()}
                  </h1>
              </div>
              
              <div className="flex items-center gap-0.5 sm:gap-2 mt-2 flex-shrink-0 flex-nowrap whitespace-nowrap overflow-visible min-w-fit">
                  {isLiveSessionActive && (
                      <button 
                          onClick={disconnectLiveSession}
                          className="flex items-center gap-1 bg-red-100 dark:bg-red-900/30 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full animate-pulse border border-red-200 dark:border-red-800 cursor-pointer hover:bg-red-200 dark:hover:bg-red-800/50 transition-colors flex-shrink-0"
                          title="Click to Stop Live Session"
                      >
                          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full"></div>
                          <span className="text-[8px] sm:text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">Rec</span>
                      </button>
                  )}

                  <PlanCreditBadge compact className="hidden md:flex" />

                  {/* SHORTCUT: CALENDARIO (Solo Desktop) */}
                  <div className="hidden lg:flex relative flex-shrink-0">
                      <button 
                          onClick={() => { setCurrentView('globalCalendar'); window.location.hash = 'globalCalendar'; }}
                          className="p-1.5 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-all text-neutral-500 hover:text-brand-primary hover:scale-110 active:scale-95"
                          title="Calendario"
                      >
                          <Icon name="calendar" className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                  </div>

                  {/* SHORTCUT: PROYECTOS (Solo Desktop) */}
                  <div className="hidden lg:flex relative flex-shrink-0">
                      <button 
                          onClick={() => { setCurrentView('projects'); setSelectedProjectId(null); window.location.hash = 'projects'; }}
                          className="p-1.5 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-all text-neutral-500 hover:text-brand-primary hover:scale-110 active:scale-95"
                          title="Proyectos"
                      >
                          <Icon name="projects" className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                  </div>

                  {/* SHORTCUT: FEED (Desktop y Móvil) */}
                  <div className="relative flex-shrink-0">
                      <button 
                          onClick={() => { setCurrentView('hub'); setActiveHubView('feed'); window.location.hash = 'hub/feed'; }}
                          className="p-1 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-all text-neutral-500 hover:text-brand-primary hover:scale-110 active:scale-95"
                          title="Feed Comunidad"
                      >
                          <Icon name="goat" className={`w-5 h-5 sm:w-6 sm:h-6 ${unreadPostsCount > 0 ? 'text-brand-primary' : ''}`} />
                          {unreadPostsCount > 0 && (
                              <span className="absolute top-0 right-0 sm:top-1 sm:right-1 flex h-3 w-3 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-red-500 text-[8px] sm:text-[10px] font-bold text-white animate-pulse">
                                  {unreadPostsCount}
                              </span>
                          )}
                      </button>
                  </div>

                  <div className="relative flex-shrink-0">
                      <button 
                          onClick={() => setMeetsInfoOpen(true)}
                          className="p-1 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-all text-brand-primary hover:scale-110 active:scale-95"
                          title="Goatify Meets"
                      >
                          <Icon name="video" className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                  </div>

                  <div className="relative flex-shrink-0">
                      <button 
                          onClick={() => { setCurrentView('hub'); setActiveHubView('messages'); }}
                          className="p-1 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-colors text-light-text-secondary dark:text-dark-text-secondary"
                          title="Mensajes"
                      >
                          <Icon name="message" className={`w-5 h-5 sm:w-6 sm:h-6 ${(totalUnreadMessages > 0) ? 'text-brand-primary' : ''}`} />
                          {(totalUnreadMessages > 0) && (
                              <span className="absolute top-0 right-0 sm:top-1 sm:right-1 flex h-3 w-3 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-red-500 text-[8px] sm:text-[10px] font-bold text-white">
                                  {totalUnreadMessages}
                              </span>
                          )}
                      </button>
                  </div>
                  
                  <div className="relative flex-shrink-0">
                      <button 
                          onClick={() => setShowNotifications(!showNotifications)}
                          className="p-1 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-colors text-light-text-secondary dark:text-dark-text-secondary"
                          title="Notificaciones"
                      >
                          <Icon name="bell" className={`w-5 h-5 sm:w-6 sm:h-6 ${unreadNotifCount > 0 ? 'text-brand-primary' : ''}`} />
                           {unreadNotifCount > 0 && (
                              <span className="absolute top-0 right-0 sm:top-1 sm:right-1 flex h-3 w-3 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-red-500 text-[8px] sm:text-[10px] font-bold text-white">
                                  {unreadNotifCount}
                              </span>
                          )}
                      </button>
                  </div>

                   <div className="relative flex-shrink-0">
                       <button 
                           onClick={handleQuickAssistantClick}
                           className="p-1 sm:p-2 rounded-full hover:bg-light-bg dark:hover:bg-dark-bg relative transition-colors text-light-text-secondary dark:text-dark-text-secondary"
                           title="Asistente Rápido"
                       >
                           <Icon name="ai" className={`w-5 h-5 sm:w-6 sm:h-6 ${isAiChatOpen ? 'text-brand-primary' : ''}`} />
                       </button>
                   </div>
              </div>
          </header>
          )}

          <main className={`flex-1 overflow-hidden relative ${mainContainerClass}`}>
              <Suspense fallback={<div className="flex items-center justify-center h-full min-h-[50vh]"><Spinner /></div>}>{renderView()}</Suspense>
          </main>

          <BottomShortcuts />

          {!isFullScreenActive && <PlanCreditBadge compact className="md:hidden fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-[12000] justify-center" />}

          {isScreenSharingGlobal && (
             <div className="fixed inset-0 z-[190000] pointer-events-none flex items-center justify-center">
                <Suspense fallback={<div className="p-6"><Spinner /></div>}><AdvancedChat isGlobal={true} /></Suspense>
             </div>
          )}

          {liveSessionMode && (
             <div className="fixed inset-0 z-[250000] bg-black animate-fade-in">
                <Suspense fallback={<div className="p-6"><Spinner /></div>}>
                    <LiveConversation 
                        autoStart={true} 
                        isVideoModeInitial={liveSessionMode === 'video'} 
                    />
                </Suspense>
             </div>
          )}
       </div>

       {/* GLOBAL MODALS MOVED OUTSIDE FOR TOP-LEVEL STACKING CONTEXT */}
       <Toaster position="top-center" richColors />
       <Suspense fallback={null}><AiChat isOpen={isAiChatOpen} onClose={() => setAiChatOpen(false)} /></Suspense>
       <ProModal isOpen={isProModalOpen} onClose={() => setProModalOpen(false)} />
       <PremiumTrialModal isOpen={isTrialModalOpen} onClose={() => setIsTrialModalOpen(false)} />
       <WelcomeModal isOpen={isWelcomeModalOpen} onClose={() => setIsWelcomeModalOpen(false)} />
       {showNotifications && (
           <NotificationsPanel 
               onClose={() => setShowNotifications(false)} 
               onOpenSettings={() => { setShowNotifications(false); setShowNotificationSettings(true); }}
           />
       )}
       <NotificationSettingsModal isOpen={showNotificationSettings} onClose={() => setShowNotificationSettings(false)} />
       <CallOverlay />
       <MeetsInfoModal />
       <NewTaskModal 
           isOpen={isNewTaskModalOpen} 
           onClose={() => setNewTaskModalOpen(false)} 
           onCreateTask={createTask} 
           defaultDate={newTaskModalDate}
       />
       {editingTask && (
           <TaskEditModal
               isOpen={isTaskEditModalOpen}
               onClose={() => { setTaskEditModalOpen(false); setEditingTask(null); }}
               task={editingTask}
               onUpdateTask={updateTask}
           />
       )}
       <InAppMessageBanner />
       {toastNotification && (
           <Toast 
               notification={toastNotification} 
               onClose={() => setToastNotification(null)} 
           />
       )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <CallProvider>
      <AppContent />
    </CallProvider>
  );
};

export default App;