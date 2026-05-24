
import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { auth, db, storage } from '../firebaseConfig';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, orderBy, addDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove, increment, limit, writeBatch, getDocs } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
// Added ChatMessage to the import list
import type { AppContextType, View, Project, Task, UserProfile, Notification, HubPost, HubGroup, MarketplaceListing, Conversation, IntisTransaction, AiAgentConfig, AiTask, Form, GlobalChat, HubView, DeepLinkTarget, ActivityLogItem, Book, Product, WebDevSession, WebFile, CustomSticker, NotificationType, GoatifyArticle, UsageStats, UserUsage, AdminUserData, SystemAnnouncement, RewardStats, PartnerLead, ChatMessage, Comment, Note, EmailAccount, LoyaltyClaim, MailList, MailContact } from '../types';
import { SUPER_ADMIN_EMAILS, COURTESY_EMAILS, getPlanConfig } from '../types';
import { notificationService } from '../services/notificationService';
import { generateGoatifyNews, generateShivoCommentResponse } from '../services/geminiService';
import { syncUserUsage, checkAndConsumeLimit, canUseLimit, releaseLimit, recalculateUserStats, recordAppEntry } from '../services/subscriptionService';
import { uploadWithQuotaCheck, uploadStringWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';
import { constructWelcomeEmailHtml, constructIntisTransactionEmailHtml } from '../utils/emailTemplates';
import JSZip from 'jszip';

export const AppContext = createContext<AppContextType>({} as AppContextType);

const initialUsage: UsageStats = {
    stdQueries: 0,
    advQueries: 0,
    agentResponses: 0,
    images: 0,
    ttsMinutes: 0,
    webDevCalls: 0,
    storageUsed: 0,
    presentationsGenerated: 0,
    socialPostsGenerated: 0,
    shivoActions: 0,
    billingCycleStart: new Date().toISOString()
};

const initialRewardStats: RewardStats = {
    lastReset: new Date().toISOString(),
    totalDailyEarnings: 0,
    actions: { posts: 0, comments: 0, groupsJoined: 0, jobsApplied: 0, uploads: 0, tasksCompleted: 0 }
};

const initialUserProfile: UserProfile = {
  uid: '', name: 'Guest', email: '', avatarUrl: null, skills: [], country: 'United States', currency: 'USD', plan: 'free', extraAgentsPurchased: 0, profileType: 'personal',
  notificationSettings: { likes: true, comments: true, groupPosts: true, projectInvites: true, projectUpdates: true, newJobs: true, newMessages: true, taskDue: true, general: true, ai_task_complete: true, newsAlerts: true, agentMessages: true }, isPrivate: false,
  usage: initialUsage,
  circle: [], 
  circleRequests: [],
  blockedUsers: [],
  rewardStats: initialRewardStats,
  emailVerified: false,
  username: '',
  mailSignatures: [],
  schedulingConfig: {
      enabled: false,
      workingDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30
  }
};

const RATE = 2; 
const GOATIFY_SERVICES = [ { name: 'Agentes de Venta IA 24/7', description: 'Automatiza tu atención al cliente y ventas.', priceIntis: 97 * RATE, icon: 'agent' }, { name: 'Kit de Branding con IA', description: 'Logo, paleta de colores y manual de marca.', priceIntis: 97 * RATE, icon: 'image' }, { name: 'Consultoría IA Empresa', description: 'Estrategia completa para implementar IA.', priceIntis: 297 * RATE, icon: 'briefcase' }, { name: 'Entrena a tu personal en herramientas IA.', priceIntis: 247 * RATE, icon: 'users' }, { name: 'Videos Promocionales', description: 'Video profesional con avatar IA.', priceIntis: 57 * RATE, icon: 'video' }, { name: 'Sitios Web Smart', description: 'Web moderna optimizada con IA.', priceIntis: 147 * RATE, icon: 'monitor' }, { name: 'Suscripción Pro (1 Mes)', description: 'Acceso a todas las herramientas Pro.', priceIntis: 10 * RATE, icon: 'upgrade' } ];

const DAILY_EARNING_CAP = 2.0;
const REWARD_RULES = {
    post: { amount: 0.10, max: 3, key: 'posts' },
    comment: { amount: 0.05, max: 5, key: 'comments' },
    group_join: { amount: 0.10, max: 1, key: 'groupsJoined' },
    job_apply: { amount: 0.05, max: 3, key: 'jobsApplied' },
    upload: { amount: 0.10, max: 2, key: 'uploads' },
    task_complete: { amount: 0.10, max: 3, key: 'tasksCompleted' }
};

const INITIAL_NEWS_BATCH: GoatifyArticle[] = [
    { 
        id: 'initial-1', 
        title: 'La Inteligencia Artificial en 2025', 
        summary: 'Un vistazo al futuro de la tecnología y cómo impactará en los negocios globales.', 
        content: 'La IA sigue evolucionando a pasos agigantados...', 
        goatifyTakeaway: 'La adaptabilidad tecnológica será la ventaja competitiva número uno.', 
        source: 'Goatify News', 
        publicationDate: new Date().toISOString(), 
        imageUrl: '' 
    },
    { 
        id: 'initial-2', 
        title: 'Productividad Aumentada con Agentes', 
        summary: 'Cómo los agentes autónomos están reemplazando las tareas repetitivas.', 
        content: 'Los agentes de IA ya no son simples chatbots...', 
        goatifyTakeaway: 'Delega lo operativo, enfócate en lo estratégico.', 
        source: 'Goatify Editorial', 
        publicationDate: new Date().toISOString(), 
        imageUrl: '' 
    }
];

const MOCK_PRODUCTS: Product[] = [
    { id: 'p1', nameKey: 'Agente de Ventas IA', descriptionKey: 'Automatiza tu atención al cliente 24/7', icon: 'agent' },
    { id: 'p2', nameKey: 'Branding Kit IA', descriptionKey: 'Identidad visual generada por IA profesional', icon: 'image' }
];

import { ALL_BOOKS as MOCK_BOOKS } from '../data/books'; 

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => { const cached = localStorage.getItem('goatify_user_profile'); return cached ? JSON.parse(cached) : initialUserProfile; });
  const [userUsage, setUserUsage] = useState<UserUsage | null>(null);
  
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState<'en' | 'es'>('es');
  const [isOnboardingComplete, setOnboardingComplete] = useState(!!localStorage.getItem('goatify_user_profile'));
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [activeHubView, setActiveHubView] = useState<HubView>('feed');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toastNotification, setToastNotification] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hubPosts, setHubPosts] = useState<HubPost[]>([]);
  const [hubGroups, setHubGroups] = useState<HubGroup[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [agents, setAgents] = useState<AiAgentConfig[]>([]);
  const [agentConversations, setAgentConversations] = useState<any[]>([]);
  const [aiTaskHistory, setAiTaskHistory] = useState<AiTask[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [formResponses, setFormResponses] = useState<Record<string, any[]>>({});
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([]);
  const [globalChats, setGlobalChats] = useState<GlobalChat[]>([{ id: 'default', name: 'Chat 1', history: [], updatedAt: new Date().toISOString() }]);
  const [activeGlobalChatId, setActiveGlobalChatId] = useState<string>('default');
  const [webDevSessions, setWebDevSessions] = useState<WebDevSession[]>([]);
  const [activeWebDevSessionId, setActiveWebDevSessionId] = useState<string>('');
  const [deepLinkTarget, setDeepLinkTarget] = useState<DeepLinkTarget | 'productivity-analysis' | null>(null);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null);
  const [isNewTaskModalOpen, setNewTaskModalOpen] = useState(false);
  const [newTaskModalDate, setNewTaskModalDate] = useState<string | null>(null);
  const [isTaskEditModalOpen, setTaskEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isProModalOpen, setProModalOpen] = useState(false);
  const [proModalMode, setProModalMode] = useState<'plan' | 'agent' | 'connect'>('plan');
  const [isAiChatOpen, setAiChatOpen] = useState(false);
  const [imageToEditUrl, setImageToEditUrl] = useState<string | null>(null);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [isDrawingPadFullScreen, setDrawingPadFullScreen] = useState(false);
  const [intisBalance, setIntisBalance] = useState(0);
  const [intisBalanceState, setIntisBalanceState] = useState(0);
  const [intisTransactions, setIntisTransactions] = useState<IntisTransaction[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [goatifyNews, setGoatifyNews] = useState<GoatifyArticle[]>([]);
  const [areNewsLoading, setAreNewsLoading] = useState(true);
  const [hasNewNews, setHasNewNews] = useState(false);
  const [hasNewStudioContent, setHasNewStudioContent] = useState(false);
  const [isAiMuted, setIsAiMuted] = useState(true); 
  const [startupPrompt, setStartupPrompt] = useState<string | null>(null);
  const [nextNewsUpdate, setNextNewsUpdate] = useState<number | null>(() => {
      const cached = localStorage.getItem('goatify_next_news_update');
      return cached ? parseInt(cached) : null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isAgentFullScreen, setIsAgentFullScreen] = useState(false);
  const [announcementToShow, setAnnouncementToShow] = useState<SystemAnnouncement | null>(null);
  const [publishedSites, setPublishedSites] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<PartnerLead[]>([]);
  const [mailLists, setMailLists] = useState<MailList[]>([]);
  const [mailContacts, setMailContacts] = useState<MailContact[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>(MOCK_BOOKS);
  
  const [isMeetsInfoOpen, setMeetsInfoOpen] = useState(false);
  const [isScheduleModalOpen, setScheduleModalOpen] = useState(false);

  const [liveSessionMode, setLiveSessionMode] = useState<'audio' | 'video' | null>(null);
  const [liveSessionContext, setLiveSessionContext] = useState<{ chatId: string, projectId?: string, isGlobal: boolean, history?: ChatMessage[] } | null>(null);

  const [isScreenSharingGlobal, setIsScreenSharingGlobal] = useState(false);
  
  const [textSizeLevel, setTextSizeLevel] = useState<number>(1);
  const [isFullScreenActive, setIsFullScreenActive] = useState(false);
  const [mailDraft, setMailDraft] = useState<{ to: string, bcc?: string, subject: string, htmlBody: string } | null>(null);

  useEffect(() => {
    const savedDraft = localStorage.getItem('goatify_pending_mail_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        setMailDraft(parsed);
        localStorage.removeItem('goatify_pending_mail_draft');
      } catch (e) {
        console.error("Error parsing saved draft", e);
      }
    }
  }, []);
  const [automationSettings, setAutomationSettings] = useState<{ newsEnabled?: boolean, welcomeEnabled?: boolean }>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'automation_settings', 'status'), (snap) => {
        if (snap.exists()) setAutomationSettings(snap.data());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const checkWelcomeMail = async () => {
        if (!currentUser || !userProfile.uid || !userProfile.email) return;
        if (automationSettings.welcomeEnabled && !userProfile.welcomeEmailSent) {
            try {
                const q = query(collection(db, 'mail_queue'), where('to', '==', userProfile.email), where('type', '==', 'WELCOME'));
                const snap = await getDocs(q);
                if (snap.empty) {
                    await addDoc(collection(db, 'mail_queue'), {
                        type: 'WELCOME',
                        to: userProfile.email,
                        subject: 'Bienvenido a Goatify: La Infraestructura Definitiva para tu Operación Digital',
                        htmlBody: constructWelcomeEmailHtml(userProfile.name),
                        status: 'pending',
                        createdAt: serverTimestamp()
                    });
                }
                await updateUserProfile(userProfile.uid, { welcomeEmailSent: true });
            } catch (error) {
                console.error("Error encolando mail de bienvenida", error);
            }
        }
    };
    checkWelcomeMail();
  }, [currentUser, userProfile.uid, userProfile.welcomeEmailSent, automationSettings.welcomeEnabled, userProfile.email, userProfile.name]);

  useEffect(() => {
      const scale = 0.9 + (textSizeLevel - 1) * 0.1; 
      document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [textSizeLevel]);

  const stopLiveSessionCallback = useRef<(() => void) | null>(null);
  const lastTaskCheckRef = useRef<string>("");

  const registerLiveSession = (callback: () => void) => {
      stopLiveSessionCallback.current = callback;
  };

  const disconnectLiveSession = () => {
      if (stopLiveSessionCallback.current) {
          stopLiveSessionCallback.current();
          stopLiveSessionCallback.current = null;
      }
      setIsLiveSessionActive(false);
  };

  const unreadGroupIds = useMemo(() => {
      if (!currentUser) return [];
      const unreadPosts = hubPosts.filter(p => p.groupId && !p.readBy?.includes(currentUser.uid));
      const groupIds = new Set(unreadPosts.map(p => p.groupId!));
      return Array.from(groupIds);
  }, [hubPosts, currentUser]);

  const markGroupPostsAsRead = useCallback(async (groupId: string) => { if (!currentUser) return; const unreadPosts = hubPosts.filter(p => p.groupId === groupId && !p.readBy?.includes(currentUser.uid)); if (unreadPosts.length === 0) return; const batch = writeBatch(db); unreadPosts.forEach(post => { const postRef = doc(db, "hubPosts", post.id); batch.update(postRef, { readBy: arrayUnion(currentUser.uid) }); }); try { await batch.commit(); } catch (error) { console.error("Error marking group posts as read:", error); } }, [hubPosts, currentUser]);
  
  const createNotification = useCallback(async (userId: string, notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => { try { await addDoc(collection(db, `users/${userId}/notifications`), { ...notification, timestamp: new Date().toISOString(), read: false }); } catch (error) { console.error("Error creating notification:", error); } }, []);

  const processLoyaltyClaim = useCallback(async (claimId: string, status: 'approved' | 'rejected') => {
    try {
        const claimRef = doc(db, 'loyaltyClaims', claimId);
        const claimSnap = await getDoc(claimRef);
        if (!claimSnap.exists()) return;
        const claimData = claimSnap.data() as LoyaltyClaim;
        
        await updateDoc(claimRef, {
            status,
            approvedAt: status === 'approved' ? new Date().toISOString() : null
        });

        // Get updated count for the user in this project
        let currentVisits = 0;
        if (status === 'approved') {
            const q = query(
                collection(db, 'loyaltyClaims'),
                where('projectId', '==', claimData.projectId),
                where('userEmail', '==', claimData.userEmail),
                where('status', '==', 'approved')
            );
            const snap = await getDocs(q);
            currentVisits = snap.size;
        }

        // Notify user
        if (claimData.userId) {
            await createNotification(claimData.userId, {
                type: 'general',
                text: status === 'approved' 
                    ? `✅ **Consumo Aprobado:** Tu visita en **${claimData.projectName}** ha sido validada. ¡Llevas ${currentVisits} visitas!`
                    : `❌ **Consumo Rechazado:** Tu registro en **${claimData.projectName}** no pudo ser validado. Contacta con el negocio si crees que es un error.`,
                link: '/#dashboard',
                fromUser: { uid: 'system_loyalty', name: 'Goatify Loyalty', avatarUrl: null }
            });
        }

        // Send Email confirmation
        fetch('/api/loyalty/processed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: claimData.userEmail,
                status,
                projectName: claimData.projectName,
                rewardName: claimData.rewardName,
                currentVisits
            })
        }).catch(err => console.error("Error sending loyalty processed email", err));

        setToastNotification({
            title: status === 'approved' ? "Consumo Aprobado" : "Consumo Rechazado",
            message: `El registro ha sido ${status === 'approved' ? 'procesado' : 'denegado'} correctamente.`,
            icon: status === 'approved' ? "check" : "close"
        });
    } catch (error) {
        console.error("Error processing loyalty claim:", error);
        setToastNotification({
            title: "Error",
            message: "No se pudo procesar el reclamo de fidelización.",
            icon: "close"
        });
    }
  }, [createNotification]);

  useEffect(() => {
      if (!currentUser) return;
      const checkTaskReminders = () => {
          const now = new Date();
          const currentHm = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
          const currentDate = now.toISOString().split('T')[0];
          if (lastTaskCheckRef.current === currentHm) return;
          projects.forEach(project => {
              (project.folders || []).forEach(folder => {
                  (folder.tasks || []).forEach(task => {
                      if (task && task.date === currentDate && task.time === currentHm && task.status !== 'Hecho') {
                          notificationService.playBeep('message');
                          notificationService.showNotification('Recordatorio de Tarea', { body: `Es hora de: ${task.title}`, icon: '/logo.png', tag: `task-due-${task.id}` });
                          createNotification(currentUser.uid, { type: 'task_due', text: `⏰ <strong>Es hora:</strong> ${task.title} en ${project.name}.`, link: `/#/projects/${project.id}`, fromUser: { uid: 'system_goatify', name: 'Goatify System', avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747' } });
                      }
                  });
              });
          });
          lastTaskCheckRef.current = currentHm;
      };
      const interval = setInterval(checkTaskReminders, 15000);
      checkTaskReminders();
      return () => clearInterval(interval);
  }, [projects, currentUser]);

  useEffect(() => {
    if (currentUser?.email && userProfile.uid) {
      const checkInvites = async () => {
        try {
          const emailLower = currentUser.email.toLowerCase();
          const q = query(collection(db, "projects"), where("pendingInvites", "array-contains", emailLower));
          const snapshot = await getDocs(q);
          
          for (const projectDoc of snapshot.docs) {
            const pData = projectDoc.data();
            const projectRef = doc(db, "projects", projectDoc.id);
            
            const memberData = {
              uid: userProfile.uid,
              name: userProfile.name,
              email: userProfile.email,
              avatarUrl: userProfile.avatarUrl,
              headline: userProfile.headline,
              plan: userProfile.plan
            };

            await updateDoc(projectRef, {
              memberIds: arrayUnion(userProfile.uid),
              members: arrayUnion(memberData),
              pendingInvites: arrayRemove(emailLower)
            });
            
            setToastNotification({
              title: "Proyecto Vinculado",
              message: `Te has unido automáticamente al proyecto "${pData.name}" debido a una invitación previa.`,
              icon: "projects"
            });
          }
        } catch (e) {
          console.error("Error checking pending invites", e);
        }
      };
      checkInvites();
    }
  }, [currentUser, userProfile.uid, userProfile.email]);

  const subscribeToPushNotifications = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push not supported');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const pushEnv = (import.meta as any).env;
        const publicVapidKey = pushEnv.VITE_VAPID_PUBLIC_KEY || "BH-vTIWCzqLklAAlb_1o4KL9RFhje-stl6-UrkzSVmTn2YG_bJ-yBAwA8-GWXgBCw8TNK83hTDHdqp2_vKgr-w0";
        
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicVapidKey
        });

        const token = localStorage.getItem('goatify_token');
        await fetch('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({ subscription }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        setIsPushSubscribed(true);
        console.log('Push Subscribed successfully');
    } catch (e) {
        console.error('Error subscribing to push', e);
    }
  }, []);

  const fetchEmailAccounts = useCallback(async () => {
    if (!currentUser) return;
    try {
      let token = localStorage.getItem('goatify_token');
      
      // Auto-Login y Auto-Identificación global
      if (!token && userProfile?.uid) {
         const res = await fetch('/api/auth/login', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userProfile.uid })
          });
          const data = await res.json();
          if (data.token) {
            token = data.token;
            localStorage.setItem('goatify_token', token);
          }
      }

      if (token && userProfile?.uid) {
         // Llamar a identify globalmente
         await fetch(`/api/auth/identify?token=${token}&userId=${userProfile.uid}`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              accounts: (userProfile as any).mailAccounts || [],
              isSuperAdmin: (userProfile as any).email === 'info@goatify.app' || (userProfile as any).email === 'deoc29@gmail.com'
            })
          });
      }

      const res = await fetch('/api/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.accounts) {
        setEmailAccounts(data.accounts);
      }
    } catch (error) {
      console.error("Error fetching email accounts:", error);
    }
  }, [currentUser, userProfile?.uid, userProfile?.email]);

  useEffect(() => {
    if (currentUser) {
      fetchEmailAccounts();
      subscribeToPushNotifications();
    }
  }, [currentUser, fetchEmailAccounts, subscribeToPushNotifications]);

  const checkAndResetDailyRewards = (currentStats: RewardStats): RewardStats => { const now = new Date(); const lastReset = new Date(currentStats.lastReset); const isSameDay = now.getDate() === lastReset.getDate() && now.getMonth() === lastReset.getMonth() && now.getFullYear() === lastReset.getFullYear(); if (!isSameDay) { return { lastReset: now.toISOString(), totalDailyEarnings: 0, actions: { posts: 0, comments: 0, groupsJoined: 0, jobsApplied: 0, uploads: 0, tasksCompleted: 0 } }; } return currentStats; };
  
  const triggerReward = async (action: 'post' | 'comment' | 'group_join' | 'job_apply' | 'upload' | 'task_complete'): Promise<boolean> => { 
    if (!currentUser) return false; 
    const userRef = doc(db, "users", currentUser.uid); 
    let currentStats = userProfile.rewardStats || initialRewardStats; 
    currentStats = checkAndResetDailyRewards(currentStats); 
    if (currentStats.totalDailyEarnings >= DAILY_EARNING_CAP) { return false; } 
    const rule = REWARD_RULES[action]; 
    const currentActionCount = (currentStats.actions as any)[rule.key]; 
    if (currentActionCount >= rule.max) { return false; } 
    
    const planMultiplier = userProfile.plan === 'premium' ? 2.0 : userProfile.plan === 'pro' ? 1.5 : 1.0;
    const rewardAmount = rule.amount * planMultiplier; 
    
    const nameStats = { ...currentStats, totalDailyEarnings: currentStats.totalDailyEarnings + rewardAmount, actions: { ...currentStats.actions, [rule.key]: currentActionCount + 1 } }; 
    setUserProfile(prev => ({ ...prev, rewardStats: nameStats, intisBalance: (prev.intisBalance || 0) + rewardAmount })); 
    setIntisBalanceState(prev => prev + rewardAmount); 
    try { 
        const batch = writeBatch(db); 
        batch.update(userRef, { rewardStats: nameStats, intisBalance: increment(rewardAmount) }); 
        const txId = `tx_reward_${Date.now()}`; 
        const txRef = doc(db, `users/${currentUser.uid}/transactions`, txId); 
        batch.set(txRef, { id: txId, type: 'Ganado', amount: rewardAmount, description: `Recompensa: ${action.replace('_', ' ')} (Bono x${planMultiplier})`, date: new Date().toISOString() }); 
        await batch.commit(); 
        setToastNotification({ title: "¡Intis Ganados!", message: `+${rewardAmount.toFixed(2)} $I (x${planMultiplier})`, icon: "wallet" }); 
        
        // Automatic Transaction Email
        fetch('/api/wallet/receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ownerId: 'system_goatify',
                ownerName: 'Goatify Rewards',
                recipientEmail: userProfile.email,
                amount: rewardAmount,
                note: `Recompensa: ${action.replace('_', ' ')}`,
                txId: txId
            })
        }).catch(err => console.error("Failed to trigger automatic reward email", err));

        return true; 
    } catch (e) { console.error("Reward failed", e); return false; } 
  };
  
  const checkAndRewardStreak = async (user: any, data: UserProfile) => { const today = new Date(); today.setHours(0,0,0,0); const lastSeenDate = data.lastSeen ? new Date(data.lastSeen) : null; if (lastSeenDate) lastSeenDate.setHours(0,0,0,0); if (lastSeenDate && lastSeenDate.getTime() === today.getTime()) return; const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0,0,0,0); let newStreak = 1; if (lastSeenDate && lastSeenDate.getTime() === yesterday.getTime()) { newStreak = (data.dailyActivityStreak || 0) + 1; } else { newStreak = 1; } if (newStreak > 0 && newStreak % 7 === 0) { const rewardAmount = 2; 
  const batch = writeBatch(db); const userRef = doc(db, "users", user.uid); batch.update(userRef, { intisBalance: increment(rewardAmount), dailyActivityStreak: newStreak, lastSeen: new Date().toISOString() }); const txId = `tx_reward_streak_${Date.now()}`; const txRef = doc(db, `users/${user.uid}/transactions`, txId); batch.set(txRef, { id: txId, type: 'Ganado', amount: rewardAmount, description: `Bono Semanal: ${newStreak} días seguidos`, date: new Date().toISOString() }); const notifRef = doc(collection(db, `users/${user.uid}/notifications`)); batch.set(notifRef, { type: 'general', text: `🔥 **¡Bono Semanal!** 7 días seguidos. Ganaste **${rewardAmount} Intis**.`, timestamp: new Date().toISOString(), read: false, link: '/#wallet', fromUser: { uid: 'system_goatify', name: 'Goatify Rewards', avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747' } }); await batch.commit(); 
    setIntisBalanceState(prev => prev + rewardAmount); 
    setToastNotification({ title: "¡Bono Semanal!", message: `+${rewardAmount.toFixed(2)} Intis por 7 días de racha.`, icon: "fire" });
    
    // Automatic Transaction Email for Streak
    fetch('/api/wallet/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ownerId: 'system_goatify',
            ownerName: 'Goatify Rewards',
            recipientEmail: user.email || data.email,
            amount: rewardAmount,
            note: `Bono Semanal: ${newStreak} días seguidos`,
            txId: txId
        })
    }).catch(err => console.error("Failed to trigger automatic streak email", err));
 } else { if (newStreak === 1 && (data.dailyActivityStreak || 0) > 1) { setToastNotification({ title: "Racha Reiniciada", message: "No entraste ayer. Tu racha de Intis ha vuelto a 1.", icon: "close" }); } await updateDoc(doc(db, "users", user.uid), { lastSeen: new Date().toISOString(), dailyActivityStreak: newStreak }); } };

  useEffect(() => { 
      let profileUnsub: (() => void) | undefined;
      let usageUnsub: (() => void) | undefined;
      let sitesUnsub: (() => void) | undefined;
      let leadsUnsub: (() => void) | undefined;
      let formsUnsub: (() => void) | undefined;
      let usersUnsub: (() => void) | undefined;
      let booksUnsub: (() => void) | undefined;
      
      const unsubscribe = onAuthStateChanged(auth, async (user) => { 
          if (profileUnsub) { profileUnsub(); profileUnsub = undefined; }
          if (usageUnsub) { usageUnsub(); usageUnsub = undefined; }
          if (sitesUnsub) { sitesUnsub(); sitesUnsub = undefined; }
          if (leadsUnsub) { leadsUnsub(); leadsUnsub = undefined; }
          if (formsUnsub) { formsUnsub(); formsUnsub = undefined; }
          if (usersUnsub) { usersUnsub(); usersUnsub = undefined; }
          
          setCurrentUser(user); 
          if (user) { 
              await user.reload();
              const isAdmin = user.email && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());
              setIsSuperAdmin(!!isAdmin);
              notificationService.requestPermission(); 
              
              const userRef = doc(db, "users", user.uid);
              const initialSnap = await getDoc(userRef);
              
              if (initialSnap.exists()) {
                  const data = initialSnap.data() as UserProfile;
                  await checkAndRewardStreak(user, data);
                  if (user.emailVerified && data.emailVerified !== true) {
                      await updateDoc(userRef, { emailVerified: true }).catch(err => console.error("Error syncing verification", err));
                  }
                  if (!data.partnerCode && (data.plan === 'pro' || data.plan === 'premium')) {
                      const code = `${data.name.split(' ')[0].toUpperCase()}-GOAT-${Math.floor(100 + Math.random() * 899)}`;
                      await updateDoc(userRef, { partnerCode: code });
                  }
              } else {
                  await updateDoc(userRef, { lastSeen: new Date().toISOString(), dailyActivityStreak: 1, emailVerified: user.emailVerified }).catch(() => {});
              }

              profileUnsub = onSnapshot(userRef, async (docSnap) => {
                  if (docSnap.exists()) {
                      const data = docSnap.data() as UserProfile;
                      const fullProfile = { ...data, uid: user.uid };
                      if (!fullProfile.rewardStats) fullProfile.rewardStats = initialRewardStats;
                      setUserProfile(fullProfile);
                      localStorage.setItem('goatify_user_profile', JSON.stringify(fullProfile));
                      setOnboardingComplete(true);
                      setIntisBalanceState(data.intisBalance || 0);
                      if (data.plan) await syncUserUsage(user.uid, data.plan);
                      if (data.country === 'United States' || data.country === 'Canada') { setLanguage('en'); } else { setLanguage('es'); }
                  } else { setUserProfile(initialUserProfile); setOnboardingComplete(false); }
              }, (err) => {
                  console.warn("Profile sync paused:", err.code);
              });

              usageUnsub = onSnapshot(doc(db, "user_usage", user.uid), (docSnap) => { 
                  if (docSnap.exists()) { 
                      setUserUsage(docSnap.data() as UserUsage); 
                  } 
              }, (err) => {
                  console.warn("Usage snapshot delayed:", err.code);
              });
              
              // Record access ONCE per session to avoid infinite loop
              const sessionKey = `goatify_entry_${user.uid}_${new Date().toISOString().split('T')[0]}`;
              if (!sessionStorage.getItem(sessionKey)) {
                  sessionStorage.setItem(sessionKey, 'true');
                  recordAppEntry(user.uid).catch((err) => {
                    console.warn("Entry record skipped:", err?.code || err?.message || err);
                  });
              }
              
              const leadsQuery = isAdmin ? query(collection(db, "partnerLeads"), orderBy("createdAt", "desc")) : query(collection(db, "partnerLeads"), where("partnerId", "==", user.uid), orderBy("createdAt", "desc"));
              leadsUnsub = onSnapshot(leadsQuery, (snap) => { 
                setAllLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerLead))); 
              }, (err) => {
                console.warn("Leads snapshot delayed:", err.code);
              });

              const qForms = query(collection(db, "forms"), where("ownerId", "==", user.uid));
              formsUnsub = onSnapshot(qForms, (snap) => {
                  const list: Form[] = [];
                  snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Form));
                  setForms(list);
              }, (error) => {
                  console.error("Error en listener de formularios:", error);
              });

              usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
                  const list: UserProfile[] = [];
                  snap.forEach(docSnap => {
                      const d = docSnap.data();
                      list.push({ ...d, uid: docSnap.id, circle: d.circle || [], circleRequests: d.circleRequests || [], skills: d.skills || [] } as UserProfile);
                  });
                  setAllUsers(list);
              }, (err) => {
                  console.warn("Users directory sync paused:", err.code);
              });

              booksUnsub = onSnapshot(collection(db, "books"), (snap) => {
                  const firestoreBooks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Book));
                  
                  // Merge: Prioritize firestore docs if IDs match, otherwise keep mocks
                  const merged = [...MOCK_BOOKS];
                  firestoreBooks.forEach(fb => {
                      const idx = merged.findIndex(m => m.id === fb.id);
                      if (idx > -1) {
                          merged[idx] = fb;
                      } else {
                          merged.push(fb);
                      }
                  });
                  setAllBooks(merged);
              }, (err) => {
                  console.warn("Books library sync paused:", err.code);
              });
              
              if (isAdmin) { 
                sitesUnsub = onSnapshot(query(collection(db, "published_sites"), orderBy("createdAt", "desc")), (snap) => { 
                    setPublishedSites(snap.docs.map(d => ({ id: d.id, ...d.data() }))); 
                }, (err) => {
                    console.warn("Global sites sync paused:", err.code);
                }); 
              }
              try { const announcementDoc = await getDoc(doc(db, 'system_settings', 'announcement')); if (announcementDoc.exists()) { const annData = announcementDoc.data() as SystemAnnouncement; if (annData.active && annData.message) { const trackingRef = doc(db, `users/${user.uid}/announcement_tracking`, annData.id); const trackingSnap = await getDoc(trackingRef); const views = trackingSnap.exists() ? trackingSnap.data().views || 0 : 0; if (views < annData.frequency) setAnnouncementToShow(annData); } } } catch (e) { console.error(e); }
          } else { setUserProfile(initialUserProfile); setUserUsage(null); setIsSuperAdmin(false); localStorage.removeItem('goatify_user_profile'); setOnboardingComplete(false); setPublishedSites([]); setAllLeads([]); setForms([]); setAllUsers([]); } 
          setAuthLoading(false); 
      }); 
      return () => { unsubscribe(); if (profileUnsub) profileUnsub(); if (usageUnsub) usageUnsub(); if (sitesUnsub) sitesUnsub(); if (leadsUnsub) leadsUnsub(); if (formsUnsub) formsUnsub(); if (usersUnsub) usersUnsub(); if (booksUnsub) booksUnsub(); }; 
  }, [isSuperAdmin]);

  useEffect(() => {
      if (currentUser && projects.length > 0) {
          const timeout = setTimeout(() => {
              recalculateUserStats(currentUser.uid);
          }, 1500); 
          return () => clearTimeout(timeout);
      }
  }, [currentUser, projects.length]);

  const addPartnerLead = async (leadData: any) => { 
    if (!currentUser) return; 
    try { 
        const createdAt = new Date().toISOString();
        const completeLead = { 
            ...leadData, 
            partnerId: currentUser.uid, 
            partnerName: userProfile.name, 
            partnerCode: userProfile.partnerCode || 'TEMP', 
            createdAt, 
            status: 'pending', 
            paid: false 
        }; 
        setAllLeads(prev => [{ ...completeLead, id: `temp-${Date.now()}` }, ...prev]);
        await addDoc(collection(db, "partnerLeads"), completeLead); 
        try { 
            const adminsQ = query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS)); 
            const adminsSnap = await getDocs(adminsQ); 
            if (!adminsSnap.empty) { 
                const batch = writeBatch(db); 
                adminsSnap.docs.forEach(admDoc => { 
                    const nRef = doc(collection(db, `users/${admDoc.id}/notifications`)); 
                    batch.set(nRef, { type: 'general', text: `💼 **Nueva Oportunidad:** ${userProfile.name} registró a ${leadData.clientName} por un valor de $${leadData.estimatedValue} USD.`, timestamp: new Date().toISOString(), read: false, fromUser: { uid: currentUser.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); 
                }); 
                await batch.commit(); 
            } 
        } catch(err) { console.error("Failed to notify admins of lead", err); } 
        setToastNotification({ title: "Prospecto Registrado", message: "Hemos recibido los datos del cliente. Te avisaremos cuando se cierre.", icon: 'check' }); 
    } catch (e) { 
        console.error(e); 
        setToastNotification({ title: "Error", message: "No se pudo registrar el prospecto.", icon: 'close' }); 
    } 
  };
  
  const updatePartnerLead = async (leadId: string, updates: Partial<PartnerLead>) => { 
    try { 
        const leadRef = doc(db, "partnerLeads", leadId);
        const leadSnap = await getDoc(leadRef);
        
        if (leadSnap.exists()) {
            const oldData = leadSnap.data() as PartnerLead;
            if (!isSuperAdmin && oldData.partnerId !== currentUser?.uid) {
                setToastNotification({ title: "Acceso Denegado", message: "No tienes permiso para editar este registro.", icon: 'lock' });
                return;
            }

            await updateDoc(leadRef, updates); 

            if (updates.status && updates.status !== oldData.status && isSuperAdmin) {
                const statusLabels: Record<string, string> = { pending: 'Pendiente', meeting: 'Reunión', closing: 'Negociación', won: 'Ganado', lost: 'Perdido' };
                const isWon = updates.status === 'won';
                
                let notifText = `📈 **Actualización CRM**: Tu prospecto **${oldData.clientName}** ha pasado a estado: **${statusLabels[updates.status]}**.`;
                if (isWon) {
                    notifText = `🎉 **¡VENTA CERRADA!** El proyecto con **${oldData.clientName}** ha sido cerrado. En breve se validará tu comisión de $${(oldData.finalValue || oldData.estimatedValue) * oldData.commissionRate} USD. ¡Felicidades!`;
                    
                    const activeProjectsCount = projects.filter(p => !p.isLocked).length;
                    const planConfig = getPlanConfig(userProfile.plan);
                    const limitValue = (planConfig.limits as any).active_projects || 3;
                    const isLocked = activeProjectsCount >= limitValue && limitValue !== 999999;

                    await addDoc(collection(db, 'projects'), {
                        name: `${oldData.clientName} - Implementación`,
                        ownerId: 'system_admin_lead', 
                        memberIds: ['system_admin_lead', oldData.partnerId],
                        members: [],
                        folders: [{ id: 'general', name: 'General', tasks: [
                            { id: `task-follow-${Date.now()}`, title: 'Kickoff con cliente (Firmado)', status: 'Por Hacer', date: new Date().toISOString().split('T')[0] }
                        ] }],
                        documents: [], notes: [], drawings: [], chats: [], spreadsheets: [],
                        finances: { income: oldData.finalValue || oldData.estimatedValue, expenses: 0, transactions: [], adn: 'business', fiscalCountry: 'OTHER' },
                        statuses: [
                            { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
                            { id: 'status-inprogress', name: 'En Progreso', color: '#3B82F6', isFixed: true },
                            { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
                        ],
                        clients: [], createdAt: new Date().toISOString(),
                        isLocked: isLocked
                    });
                }

                await createNotification(oldData.partnerId, {
                    type: 'general',
                    text: notifText,
                    link: '/#partners',
                    fromUser: { uid: 'system_crm', name: 'Goatify CRM', avatarUrl: null }
                });
            }
        }
        setToastNotification({ title: "Registro Actualizado", message: "Cambios sincronizados correctamente.", icon: 'check' }); 
    } catch (e) { 
        console.error(e); 
        setToastNotification({ title: "Error", message: "No se pudo actualizar the registro.", icon: 'close' }); 
    } 
  };

  const addBook = async (book: Omit<Book, 'id'>) => {
    if (!isSuperAdmin) return;
    try {
      await addDoc(collection(db, "books"), book);
      setToastNotification({ title: "Libro Agregado", message: "La guía ha sido cargada exitosamente.", icon: "check" });
    } catch (e) {
      console.error(e);
      setToastNotification({ title: "Error", message: "No se pudo agregar el libro.", icon: "close" });
    }
  };

  const updateBook = async (id: string, updates: Partial<Book>) => {
    if (!isSuperAdmin) return;
    try {
      // Use setDoc with merge: true so it works even if the book was only in MOCK_BOOKS initially
      await setDoc(doc(db, "books", id), updates, { merge: true });
      setToastNotification({ title: "Cambios Guardados", message: "La guía ha sido actualizada en tiempo real.", icon: "check" });
    } catch (e) {
      console.error(e);
      setToastNotification({ title: "Error", message: "No se pudieron guardar los cambios.", icon: "close" });
    }
  };

  const deleteBook = async (id: string) => {
    if (!isSuperAdmin) return;
    try {
      await deleteDoc(doc(db, "books", id));
      setToastNotification({ title: "Libro Eliminado", message: "La guía ha sido removida.", icon: "trash" });
    } catch (e) {
      console.error(e);
      setToastNotification({ title: "Error", message: "No se pudo eliminar el libro.", icon: "close" });
    }
  };

  const seedBooks = async () => {
    if (!isSuperAdmin) return;
    try {
      const batch = writeBatch(db);
      MOCK_BOOKS.forEach(book => {
        const bookRef = doc(db, "books", book.id);
        const { id, ...data } = book;
        batch.set(bookRef, data);
      });
      await batch.commit();
      setToastNotification({ title: "Sincronización Exitosa", message: "Todas las guías maestras han sido pasadas a Firebase.", icon: "check" });
    } catch (e) {
      console.error(e);
      setToastNotification({ title: "Error de Sincronización", message: "No se pudieron subir las guías.", icon: "close" });
    }
  };

  const getAllUsersData = async (): Promise<AdminUserData[]> => { 
    if (!isSuperAdmin) return []; 
    try { 
        const usersSnap = await getDocs(collection(db, "users")); 
        const users = usersSnap.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)); 
        const usageSnap = await getDocs(collection(db, "user_usage")); 
        const usageMap = new Map<string, UserUsage>(); 
        usageSnap.forEach(d => { usageMap.set(d.id, d.data() as UserUsage); }); 
        return users.map(u => ({ user: u, usage: usageMap.get(u.uid) || null })); 
    } catch (e: any) { 
        console.error("Error fetching admin data", e); 
        setToastNotification({
            title: "Error de Acceso",
            message: "No tienes permisos para ver estos datos. Verifica tu cuenta.",
            icon: "lock"
        });
        return []; 
    } 
  };
  const notifyAdminsOfNewUser = async (newUser: UserProfile) => { try { const q = query(collection(db, "users"), where("email", "in", SUPER_ADMIN_EMAILS)); const snapshot = await getDocs(q); if (snapshot.empty) return; const batch = writeBatch(db); snapshot.docs.forEach(adminDoc => { const notifRef = doc(collection(db, `users/${adminDoc.id}/notifications`)); batch.set(notifRef, { type: 'general', text: `🚀 **Nuevo Usuario:** ${newUser.name} (${newUser.email}) se ha unido a Goatify.`, timestamp: new Date().toISOString(), read: false, link: '', fromUser: { uid: newUser.uid, name: newUser.name, avatarUrl: newUser.avatarUrl } }); }); await batch.commit(); } catch (e) { console.error("Failed to notify admins", e); } };
  const performNuclearDeletion = async (targetUid: string) => { 
    if (!targetUid) return; 
    if (!isSuperAdmin && currentUser?.uid !== targetUid) return; 
    try { 
        // 1. Borrado de Auth vía Backend (solo si es SuperAdmin)
        if (isSuperAdmin && currentUser) {
            await fetch('/api/admin/deleteUser', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUid, adminUid: currentUser.uid })
            });
        }

        const deleteCollectionDocs = async (colName: string, whereField: string, id: string) => { 
            const q = query(collection(db, colName), where(whereField, "==", id)); 
            const snap = await getDocs(q); 
            const promises = snap.docs.map(d => deleteDoc(d.ref)); 
            await Promise.all(promises); 
        }; 
        await deleteCollectionDocs("projects", "ownerId", targetUid); 
        const postsQ = query(collection(db, "hubPosts"), where("author.uid", "==", targetUid)); 
        const postsSnap = await getDocs(postsQ); 
        await Promise.all(postsSnap.docs.map(d => deleteDoc(d.ref))); 
        const marketQ = query(collection(db, "marketplace"), where("user.uid", "==", targetUid)); 
        const marketSnap = await getDocs(marketQ); 
        await Promise.all(marketSnap.docs.map(d => deleteDoc(d.ref))); 
        await deleteCollectionDocs("aiTasks", "userId", targetUid); 
        await deleteCollectionDocs("agents", "ownerId", targetUid); 
        await deleteCollectionDocs("forms", "ownerId", targetUid); 
        await deleteCollectionDocs("published_sites", "ownerId", targetUid); 
        const callsQ = query(collection(db, "calls"), where("adminId", "==", targetUid)); 
        const callsSnap = await getDocs(callsQ); 
        await Promise.all(callsSnap.docs.map(d => deleteDoc(d.ref))); 
        await deleteCollectionDocs("agentConversations", "ownerId", targetUid); 
        await deleteCollectionDocs("agentConversations", "userId", targetUid); 
        const webRef = collection(db, `users/${targetUid}/webDevSessions`); 
        const webSnap = await getDocs(webRef); 
        await Promise.all(webSnap.docs.map(d => deleteDoc(d.ref))); 
        const subCols = ["notifications", "transactions", "recordings", "customStickers", "presentations", "globalChats", "announcement_tracking"]; 
        for (const sub of subCols) { 
            const subRef = collection(db, `users/${targetUid}/${sub}`); 
            const subRefSnap = await getDocs(subRef); 
            await Promise.all(subRefSnap.docs.map(d => deleteDoc(d.ref))); 
        } 
        await deleteDoc(doc(db, "user_usage", targetUid)); 
        await deleteDoc(doc(db, "users", targetUid)); 
    } catch (e) { 
        console.error("Nuclear deletion failed:", e); 
        throw e; 
    } 
  };
  const cancelAnnouncement = async () => { if (!isSuperAdmin) return; try { await updateDoc(doc(db, 'system_settings', 'announcement'), { active: false }); setAnnouncementToShow(null); setToastNotification({ title: "Anuncio Publicado", message: "El anuncio ya no se mostrará a nadie.", icon: 'check' }); } catch (e) { console.error("Failed to cancel announcement", e); setToastNotification({ title: "Error", message: "No se pudo cancelar.", icon: 'close' }); } };
  
  useEffect(() => { if (!currentUser) return; const chatsRef = collection(db, `users/${currentUser.uid}/globalChats`); const q = query(chatsRef, orderBy("updatedAt", "desc")); const unsub = onSnapshot(q, (snap) => { const chats = snap.docs.map(d => ({ id: d.id, ...d.data() } as GlobalChat)); if (chats.length > 0) { setGlobalChats(chats); if (!activeGlobalChatId || !chats.find(c => c.id === activeGlobalChatId)) { setActiveGlobalChatId(chats[0].id); } } else { const defaultChat = { id: `chat-${Date.now()}`, name: 'Chat 1', history: [], updatedAt: new Date().toISOString() }; setDoc(doc(db, `users/${currentUser.uid}/globalChats`, defaultChat.id), defaultChat); } }); return () => unsub(); }, [currentUser]);

    const loadNews = async () => { 
    if (!currentUser || authLoading) return; // ESPERAR A AUTH PARA EVITAR ERROR DE PERMISOS

    setAreNewsLoading(true); 
    try { 
        const newsRef = collection(db, "system_news"); 
        const q = query(newsRef, orderBy("createdAt", "desc"), limit(1)); 
        const snapshot = await getDocs(q).catch(err => {
            if (err.code === 'permission-denied') throw new Error("Firebase Permissions Wait");
            throw err;
        });

        let shouldGenerate = true; 
        let articlesToSet: GoatifyArticle[] = []; 
        
        if (!snapshot.empty) { 
            const docData = snapshot.docs[0].data(); 
            const createdDate = new Date(docData.createdAt).toDateString();
            const todayDate = new Date().toDateString();
            
            // LÓGICA DE FECHA CALENDARIO (NO 24H)
            if (createdDate === todayDate && docData.articles && docData.articles.length > 0) { 
                articlesToSet = docData.articles; 
                setGoatifyNews(articlesToSet); 
                setHasNewNews(true); 
                
                // Calcular tiempo hasta mañana a las 6:00 AM
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(6, 0, 0, 0);
                const nextUpdate = tomorrow.getTime();
                setNextNewsUpdate(nextUpdate); 
                localStorage.setItem('goatify_next_news_update', nextUpdate.toString());
                
                shouldGenerate = false; 
            } 
        } 
        if (shouldGenerate) { 
            const response = await generateGoatifyNews(language as 'es' | 'en'); 
            
            // PARCHE DE EMERGENCIA v1.0
            if (typeof response === 'string' && (response.includes("Debes") || !response.trim().startsWith('{'))) {
                setGoatifyNews(INITIAL_NEWS_BATCH);
                setAreNewsLoading(false);
                return; 
            }

            let articles = [];
            
            // VALIDACIÓN ROBUSTA DE JSON v1.2
            try {
                const cleanRes = typeof response === 'string' ? response.trim().replace(/^```json|```$/g, '') : response;
                const parsed = typeof cleanRes === 'string' ? JSON.parse(cleanRes) : cleanRes;
                articles = parsed.articles || INITIAL_NEWS_BATCH;
            } catch (e) {
                console.warn("JSON parse fail in news, using fallback.");
                articles = INITIAL_NEWS_BATCH;
            }

            if (articles && articles.length > 0) { 
                const articlesWithIds = articles.slice(0, 6).map((a: any, index: number) => ({ 
                    ...a, 
                    id: a.id || `news-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, 
                    author: index % 2 === 0 ? "Daniel Ortega Corella" : "Victor Ortega Corella", 
                    authorLinkedinUrl: index % 2 === 0 ? "https://www.linkedin.com/in/danielortegacorella/" : "https://www.linkedin.com/in/victor-ortega-corella/",
                    publicationDate: new Date().toISOString()
                })); 
                articlesToSet = articlesWithIds; 
                try { 
                    await addDoc(collection(db, "system_news"), { createdAt: new Date().toISOString(), articles: articlesWithIds }); 
                } catch(e) { console.error("Failed to save system news to DB", e); } 
                setGoatifyNews(articlesToSet); 
                setHasNewNews(true); 
                
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(6, 0, 0, 0);
                const nextUpdate = tomorrow.getTime();
                setNextNewsUpdate(nextUpdate);
                localStorage.setItem('goatify_next_news_update', nextUpdate.toString());

                createNotification(currentUser.uid, { type: 'news_alert', text: `📰 <strong>Noticias Diarias:</strong> Tu resumen de inteligencia artificial y tecnología está listo.`, link: '/#discovery', fromUser: { uid: 'system_goatify', name: 'Goatify News', avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747' } }); 
            } else { 
                setGoatifyNews(INITIAL_NEWS_BATCH); 
                const retryTime = Date.now() + (1 * 60 * 60 * 1000);
                setNextNewsUpdate(retryTime); // Reintentar en 1h
                localStorage.setItem('goatify_next_news_update', retryTime.toString());
            } 
        } 
    } catch (e: any) { 
        console.error("News logic error", e); 
        if (e.message !== "Firebase Permissions Wait") {
            setGoatifyNews(INITIAL_NEWS_BATCH);
            const retryTime = Date.now() + (1 * 60 * 60 * 1000);
            setNextNewsUpdate(retryTime);
            localStorage.setItem('goatify_next_news_update', retryTime.toString());
        }
    } finally { 
        setAreNewsLoading(false); 
    } 
  };
  
  useEffect(() => { 
      if (currentUser && !authLoading) loadNews(); 
  }, [language, currentUser, authLoading]);

  const forceNewsUpdate = async () => { 
    if (!isSuperAdmin) return; 
    setAreNewsLoading(true); 
    try { 
        const response = await generateGoatifyNews(language as 'es' | 'en'); 
        let articles = [];
        if (typeof response === 'string') {
            try {
                const cleanRes = response.trim().replace(/^```json|```$/g, '');
                const parsed = JSON.parse(cleanRes);
                articles = parsed.articles || [];
            } catch (e) {}
        } else if (response && response.articles) {
            articles = response.articles;
        }

        if (articles && articles.length > 0) { 
            const articlesWithIds = articles.slice(0, 6).map((a: any, index: number) => ({ 
                ...a, 
                id: a.id || `news-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, 
                author: index % 2 === 0 ? "Daniel Ortega Corella" : "Victor Ortega Corella", 
                authorLinkedinUrl: index % 2 === 0 ? "https://www.linkedin.com/in/danielortegacorella/" : "https://www.linkedin.com/in/victor-ortega-corella/",
                publicationDate: new Date().toISOString()
            })); 
            await addDoc(collection(db, "system_news"), { createdAt: new Date().toISOString(), articles: articlesWithIds }); 
            setGoatifyNews(articlesWithIds); 
            
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(6, 0, 0, 0);
            setNextNewsUpdate(tomorrow.getTime()); 
            
            setHasNewNews(true); 
            setToastNotification({ title: "Noticias Actualizadas", message: "Se han generado 6 nuevas noticias.", icon: "check" }); 
        } else { throw new Error("Generación fallida"); } 
    } catch (e) { 
        console.error("Force update failed", e); 
        setToastNotification({ title: "Error", message: "No se pudieron actualizar las noticias.", icon: "close" }); 
    } finally { 
        setAreNewsLoading(false); 
    } 
  };
  const publishAnnouncement = async (text: string, frequency: 1 | 3 | 5, title: string = "", type: 'text' | 'html' | 'image' = 'text') => { if (!isSuperAdmin) return; try { const announcementData: SystemAnnouncement = { id: `ann-${Date.now()}`, title: title, message: text, type: type, frequency: frequency, createdAt: new Date().toISOString(), active: true }; await setDoc(doc(db, 'system_settings', 'announcement'), announcementData); setToastNotification({ title: "Anuncio Publicado", message: "Se mostrará a todos los usuarios.", icon: 'check' }); } catch (e) { console.error("Failed to publish announcement", e); setToastNotification({ title: "Error", message: "No se pudo publicar el anuncio.", icon: 'close' }); } };
  const dismissAnnouncement = async () => { if (!currentUser || !announcementToShow) return; try { let trackingRef = doc(db, `users/${currentUser.uid}/announcement_tracking`, announcementToShow.id); await setDoc(trackingRef, { views: increment(1), lastViewed: new Date().toISOString() }, { merge: true }); setAnnouncementToShow(null); } catch (e) { console.error("Failed to dismiss announcement", e); setAnnouncementToShow(null); } };
  
  useEffect(() => { 
    if (!currentUser) return; 
    const qProjects = query(collection(db, "projects"), where("memberIds", "array-contains", currentUser.uid)); 
    const unsubProjects = onSnapshot(qProjects, (snap) => { 
        const list: Project[] = []; 
        snap.forEach(doc => { 
            const data = doc.data(); 
            const project = { ...data, id: doc.id } as Project; 
            if (project.folders) { 
                project.folders.forEach(f => { 
                    if (f.tasks) { f.tasks.forEach(t => { t.projectId = project.id; }); } 
                }); 
            } 
            list.push(project); 
        }); 
        
        // --- LOGIC: Lock projects exceeding plan limits (Sorted by createdAt ASC) ---
        // This ensures the oldest projects are kept, and newer ones are locked if over limit
        const planConfig = getPlanConfig(userProfile.plan);
        const limitValue = planConfig.limits.active_projects || 3;
        
        const sortedByDate = [...list].sort((a,b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateA - dateB;
        });

        const projectsWithLockStatus = sortedByDate.map((p, index) => ({
            ...p,
            isLocked: limitValue !== 999999 && index >= limitValue
        }));

        setProjects(projectsWithLockStatus); 
    });
    const qNotifs = query(collection(db, `users/${currentUser.uid}/notifications`), orderBy("timestamp", "desc"), limit(50)); const unsubNotifs = onSnapshot(qNotifs, (snap) => { const list: Notification[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as Notification)); setNotifications(list); snap.docChanges().forEach((change) => { if (change.type === 'added') { const notif = change.doc.data() as Notification; if (!notif.read) { if (notif.type === 'new_message' || notif.type === 'agent_message') { notificationService.playBeep('message'); } else if (notif.type !== 'incoming_call') { notificationService.playBeep('post'); } notificationService.showNotification('Goatify IA', { body: notif.text.replace(/<[^>]*>?/gm, ''), icon: notif.fromUser?.avatarUrl || '/logo.png', tag: notif.id, data: { url: notif.link || '/' } }); } } }); }); 
    const qPosts = query(collection(db, "hubPosts"), orderBy("timestamp", "desc"), limit(100)); const unsubPosts = onSnapshot(qPosts, (snap) => { const list: HubPost[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as HubPost)); setHubPosts(list); }); 
    const unsubGroups = onSnapshot(collection(db, "hubGroups"), (snap) => { const list: HubGroup[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as HubGroup)); setHubGroups(list); }); 
    const unsubMarket = onSnapshot(collection(db, "marketplace"), (snap) => { const list: MarketplaceListing[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as MarketplaceListing)); setMarketplaceListings(list); }); 
    const qConvos = query(collection(db, "conversations"), where("members", "array-contains", currentUser.uid)); const unsubConvos = onSnapshot(qConvos, async (snap) => { const list: Conversation[] = []; for (const d of snap.docs) { const data = d.data(); const otherUserId = data.members.find((id: string) => id !== currentUser.uid); let otherUser = allUsers.find(u => u.uid === otherUserId); if (!otherUser && otherUserId) { const uSnap = await getDoc(doc(db, "users", otherUserId)); if (uSnap.exists()) otherUser = uSnap.data() as UserProfile; } const unreadCount = Number((data.unreadBy && data.unreadBy[currentUser.uid]) || 0); list.push({ id: d.id, members: data.members, otherUser: otherUser || { uid: otherUserId || 'unknown', name: 'Unknown', email: '', avatarUrl: null } as any, lastMessage: data.lastMessage, unreadCount: unreadCount, deletedBy: data.deletedBy, blockedBy: data.blockedBy || [] } as any); } setConversations(list); }); 
    const qAgents = query(collection(db, "agents"), where("ownerId", "==", currentUser.uid)); const unsubAgents = onSnapshot(qAgents, (snap) => { const list: AiAgentConfig[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as AiAgentConfig)); setAgents(list); }); 
    const qAgentConvos = query(collection(db, "agentConversations"), where("ownerId", "==", currentUser.uid)); const unsubAgentConvos = onSnapshot(qAgentConvos, (snap) => { const list: any[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id })); setAgentConversations(list); }); 
    const qAgentTasks = query(collection(db, "aiTasks"), where("userId", "==", currentUser.uid)); const unsubAiTasks = onSnapshot(qAgentTasks, (snap) => { const list: AiTask[] = []; snap.forEach(doc => list.push({ ...doc.data(), id: doc.id } as AiTask)); list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); setAiTaskHistory(list); }); 
    const qStickers = query(collection(db, `users/${currentUser.uid}/customStickers`)); const unsubStickers = onSnapshot(qStickers, (snap) => { const list: CustomSticker[] = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as CustomSticker)); setCustomStickers(list); }); 
    const qIntis = query(collection(db, `users/${currentUser.uid}/transactions`), orderBy("date", "desc")); const unsubIntis = onSnapshot(qIntis, (snap) => { const list: IntisTransaction[] = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as IntisTransaction)); setIntisTransactions(list); }); 
    const qWeb = query(collection(db, `users/${currentUser.uid}/webDevSessions`), orderBy("createdAt", "desc")); 
    const unsubWeb = onSnapshot(qWeb, (snap) => { 
      const list: WebDevSession[] = []; 
      snap.forEach(d => {
        const data = d.data();
        if (!data.files) {
          // Migration for old sessions
          list.push({ 
            ...data, 
            id: d.id,
            type: data.type || 'web',
            activeFileIndex: 0,
            files: [{
              name: 'index.html',
              code: data.code || '',
              history: data.history || [],
              isGenerating: data.isGenerating || false,
              agentStatus: 'Agente 1 listo'
            }]
          } as WebDevSession);
        } else {
          list.push({ ...data, id: d.id } as WebDevSession); 
        }
      });
      setWebDevSessions(list); 
    });
    
    // FETCH MAIL DATA
    const qMailLists = collection(db, `users/${currentUser.uid}/mail_lists`);
    const unsubMailLists = onSnapshot(qMailLists, (snap) => {
        const list: MailList[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as MailList));
        setMailLists(list);
    });
    const qMailContacts = collection(db, `users/${currentUser.uid}/mail_contacts`);
    const unsubMailContacts = onSnapshot(qMailContacts, (snap) => {
        const list: MailContact[] = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() } as MailContact));
        setMailContacts(list);
    });

    return () => { unsubProjects(); unsubNotifs(); unsubPosts(); unsubGroups(); unsubMarket(); unsubConvos(); unsubAgents(); unsubAgentConvos(); unsubAiTasks(); unsubStickers(); unsubIntis(); unsubWeb(); unsubMailLists(); unsubMailContacts(); }; 
  }, [isSuperAdmin, currentUser]);

  const handleLimitCheck = async (key: any, amount: number = 1) => { if (!currentUser) return true; try { await checkAndConsumeLimit(currentUser.uid, key, amount, userProfile.plan); return false; } catch (e: any) { if (e.code === "PLAN_LIMIT_REACHED") { setToastNotification({ title: "Límite del Plan Alcanzado", message: e.message || "Has llegado al máximo de tu plan.", icon: 'lock', onClick: () => setProModalOpen(true) }); setProModalOpen(true); } return true; } }
  const handleLimitPreview = async (key: any, amount: number = 1) => { if (!currentUser) return true; try { const ok = await canUseLimit(currentUser.uid, key, amount, userProfile.plan); if (!ok) { setToastNotification({ title: "Límite del Plan Alcanzado", message: "Has llegado al máximo de tu plan para esta función.", icon: 'lock', onClick: () => setProModalOpen(true) }); setProModalOpen(true); return true; } return false; } catch (e: any) { return true; } }
  const checkTaskLimit = async () => { return await handleLimitCheck('task_create'); };
  // IA: el frontend solo previsualiza límites; Cloud Run descuenta el crédito real.
  const checkQueryLimit = async () => { return await handleLimitPreview('ai_chat'); };
  const checkThinkingQueryLimit = async () => { return await handleLimitPreview('ai_chat', 1); }; 
  const checkMediaLimit = async (type: 'image' | 'video' = 'image') => { return await handleLimitPreview(type === 'video' ? 'ai_video' : 'ai_image'); };
  const releaseMediaLimit = async (_type: 'image' | 'video' = 'image') => { /* V10: sin rollback frontend porque IA consume solo en backend. */ };
  
  const checkAgentLimit = async (type: 'create' | 'response', agentId?: string) => { 
    if (type === 'create') return await handleLimitCheck('agent_create'); 
    if (type === 'response') {
        const chatBlocked = await handleLimitPreview('ai_chat', 1);
        if (chatBlocked) return true;
        return await handleLimitCheck('agent_response'); 
    }
    return false; 
  };
  
  const checkLiveConversationLimit = async (d: number, t: 'voice' | 'video') => { const minutesToAdd = d / 60; const featureKey = t === 'video' ? 'video_live_minute' : 'voice_live_minute'; return await handleLimitCheck(featureKey, minutesToAdd > 0 ? minutesToAdd : 0); };
  const checkFormLimit = async () => { return await handleLimitCheck('form_create'); }; 
  const checkWebSearchLimit = async () => { return await handleLimitPreview('ai_grounding'); }; 
  const checkWebProgrammerLimit = async () => { return await handleLimitCheck('web_programmer'); };
  
  const checkPresentationLimit = async () => { 
    return await handleLimitPreview('presentation'); 
  };
  
  const checkProjectLimit = async () => { return await handleLimitCheck('project_create'); };
  
  const checkSocialPostLimit = async (amount: number = 1) => { 
    return await handleLimitPreview('social_post', Math.max(1, amount)); 
  };
  
  const checkShivoLimit = async () => { return await handleLimitPreview('ai_chat', 2); };
  
  const checkCrmLimit = async () => { return await handleLimitCheck('crm_client_create'); };
  const checkMeetingLimit = async () => { return await handleLimitCheck('meeting_create'); };
  
  const uploadImageToStorage = async (base64: string) => { if (!currentUser) return ''; const size = Math.round((base64.length * 3) / 4); const { url } = await uploadStringWithQuotaCheck({ userId: currentUser.uid, data: base64, format: 'data_url', sizeBytes: size, path: safeStoragePath('ai-images', currentUser.uid, `${Date.now()}.png`), metadata: { contentType: 'image/png' }, plan: userProfile.plan }); return url; };
  const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => { await setDoc(doc(db, "users", uid), data, { merge: true }); if (currentUser && uid === currentUser.uid) { const currentProfile = JSON.parse(localStorage.getItem('goatify_user_profile') || '{}'); const updatedProfile = {...currentProfile, ...data }; localStorage.setItem('goatify_user_profile', JSON.stringify(updatedProfile)); setUserProfile(updatedProfile); if (data.plan) { await syncUserUsage(uid, data.plan); } } };
  
  const addProject = async (project: Omit<Project, 'id'>, isAutomatic: boolean = false) => { 
    if (!currentUser) throw new Error("Not logged in"); 
    
    const activeProjectsCount = projects.filter(p => !p.isLocked).length;
    const planConfig = getPlanConfig(userProfile.plan);
    const limitValue = (planConfig.limits as any).active_projects || 3;

    if (!isAutomatic && activeProjectsCount >= limitValue && limitValue !== 999999) {
        setToastNotification({ title: "Límite Alcanzado", message: "Has alcanzado tu límite de proyectos activos. Sube a Premium o elimina uno para continuar.", icon: 'lock', onClick: () => setProModalOpen(true) });
        setProModalOpen(true);
        throw new Error("PLAN_LIMIT_REACHED");
    }

    let isLocked = false;
    if (isAutomatic && activeProjectsCount >= limitValue && limitValue !== 999999) {
        isLocked = true;
    } else {
        try {
            await checkAndConsumeLimit(currentUser.uid, 'project_create');
        } catch(e) {
            isLocked = true;
        }
    }
    
    const ref = await addDoc(collection(db, "projects"), { 
        ...project, 
        ownerId: currentUser.uid, 
        members: [userProfile], 
        memberIds: [currentUser.uid], 
        isLocked,
        statuses: [
            { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
            { id: 'status-inprogress', name: 'En Progreso', color: '#3B82F6', isFixed: true },
            { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
        ]
    }); 
    return ref.id; 
  };

  const notifyOwnerIfCollaborator = async (projectId: string, actionText: string) => {
    if (!currentUser) return;
    const project = projects.find(p => p.id === projectId);
    if (project && project.ownerId !== currentUser.uid) {
        await createNotification(project.ownerId, {
            type: 'project_update',
            text: `🛠️ **Acción de Colaborador**: ${userProfile.name} ha ${actionText} en tu proyecto **${project.name}**.`,
            link: `/#/projects/${project.id}`,
            fromUser: { uid: currentUser.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
        });
    }
  };

  const updateProject = async (projectId: string, updates: Partial<Project>) => { 
    const oldProject = projects.find(p => p.id === projectId);
    await updateDoc(doc(db, "projects", projectId), updates); 
    
    // NOTIFICAR AL DUEÑO SOBRE MOVIMIENTOS v12.1
    if (updates.clients && updates.clients.length > (oldProject?.clients?.length || 0)) {
        await notifyOwnerIfCollaborator(projectId, "registrado un nuevo prospecto");
    } else if (updates.finances && JSON.stringify(updates.finances.transactions) !== JSON.stringify(oldProject?.finances.transactions)) {
        await notifyOwnerIfCollaborator(projectId, "registrado un movimiento financiero");
    } else if (updates.documents && updates.documents.length > (oldProject?.documents?.length || 0)) {
        await notifyOwnerIfCollaborator(projectId, "subido un documento");
    }

    if (currentUser && (updates.documents || updates.clients || updates.folders)) {
        await recalculateUserStats(currentUser.uid);
    }
  };

  // --- NOTES SUBCOLLECTION MANAGEMENT ---
  const getProjectNotes = async (projectId: string): Promise<Note[]> => {
    const notesRef = collection(db, `projects/${projectId}/notes`);
    // Removed orderBy to avoid index issues. Sorting is handled client-side.
    const snapshot = await getDocs(notesRef);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note));
  };

  const saveProjectNote = async (projectId: string, note: Note) => {
    const noteRef = doc(db, `projects/${projectId}/notes`, note.id);
    await setDoc(noteRef, note, { merge: true });
  };

  const deleteProjectNote = async (projectId: string, noteId: string) => {
    await deleteDoc(doc(db, `projects/${projectId}/notes`, noteId));
  };
  // --------------------------------------
  
  const deleteProject = async (projectId: string) => { 
    if (!currentUser) return; 
    const projectRef = doc(db, "projects", projectId);
    const pSnap = await getDoc(projectRef);
    if (pSnap.exists()) {
        const data = pSnap.data() as Project;
        const wasLocked = !!(data as any).isLocked;
        
        if (data.ownerId === currentUser.uid) {
            await deleteDoc(projectRef);
            
            // Cleanup loyalty claims
            try {
                const claimsQuery = query(collection(db, 'loyaltyClaims'), where('projectId', '==', projectId));
                const claimsSnap = await getDocs(claimsQuery);
                const batchPromises = claimsSnap.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(batchPromises);
            } catch (err) {
                console.error("Error cleaning up loyalty claims:", err);
            }

            if (!wasLocked) {
                await releaseLimit(currentUser.uid, 'project_create');
                
                const q = query(collection(db, "projects"), where("ownerId", "==", currentUser.uid), where("isLocked", "==", true), orderBy("createdAt", "asc"), limit(1));
                const lockedSnap = await getDocs(q);
                if (!lockedSnap.empty) {
                    const oldestLocked = lockedSnap.docs[0];
                    await updateDoc(oldestLocked.ref, { isLocked: false });
                    await checkAndConsumeLimit(currentUser.uid, 'project_create');
                    setToastNotification({ title: "Proyecto Activado", message: `Se ha desbloqueado "${oldestLocked.data().name}" automáticamente.`, icon: "rocket" });
                }
            }
        } else {
            const updatedMembers = data.members.filter(m => m.uid !== currentUser.uid);
            await updateDoc(projectRef, { 
                memberIds: arrayRemove(currentUser.uid),
                members: updatedMembers
            });
            setToastNotification({ title: "Proyecto Abandonado", message: "Has salido del proyecto. El dueño aún conserva los datos.", icon: "trash" });
            if (!wasLocked) await releaseLimit(currentUser.uid, 'project_create');
        }
        await recalculateUserStats(currentUser.uid);
    }
  };

  const removeProjectMember = async (projectId: string, uid: string) => { const projectRef = doc(db, "projects", projectId); const projectSnap = await getDoc(projectRef); if (projectSnap.exists()) { const pData = projectSnap.data() as Project; const updatedMembers = pData.members.filter(m => m.uid !== uid); await updateDoc(projectRef, { memberIds: arrayRemove(uid), members: updatedMembers }); } };
  
  const createTask = async (taskData: Omit<Task, 'id' | 'status'>, folderId: string) => { 
    if (!currentUser) return; 
    if (await handleLimitCheck('task_create')) return; 
    const project = projects.find(p => p.id === taskData.projectId); 
    if (!project) return; 
    const projectRef = doc(db, "projects", project.id); 
    const newTask: Task = { ...taskData, id: `task-${Date.now()}`, status: 'Por Hacer', assignedTo: taskData.assignedTo || [] }; 
    const updatedFolders = project.folders.map(f => f.id === folderId ? { ...f, tasks: [...f.tasks, newTask] } : f); 
    await updateDoc(projectRef, { folders: updatedFolders }); 

    // NOTIFICAR AL DUEÑO SI UN INVITADO CREA TAREA
    await notifyOwnerIfCollaborator(project.id, `creado la tarea "${newTask.title}"`);

    if (newTask.assignedTo && newTask.assignedTo.length > 0) { 
        for (const uid of newTask.assignedTo) { 
            if (uid !== currentUser.uid) { 
                await createNotification(uid, { type: 'task_due', text: `Te han asignado la tarea <strong>${newTask.title}</strong> en el proyecto <strong>${project.name}</strong>.`, link: `/#/projects/${project.id}/task/${newTask.id}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }, metadata: { projectId: project.id, taskId: newTask.id } }); 
                
                // Enviar email de asignación
                const targetUser = allUsers.find(u => u.uid === uid);
                if (targetUser && targetUser.email) {
                    fetch('/api/task/assign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ownerId: currentUser.uid,
                            ownerName: userProfile.name,
                            projectName: project.name,
                            taskName: newTask.title,
                            guestEmail: targetUser.email,
                            targetUrl: `${window.location.origin}/#/projects/${project.id}/task/${newTask.id}`
                        })
                    }).catch(err => console.error("Error sending task email", err));
                }
            } 
        } 
    } 
  };

  const updateTask = async (updatedTask: Task) => { 
    if (!currentUser) return;

    // Encontrar el proyecto y carpeta de ORIGEN (donde está la tarea actualmente)
    let sourceProject: Project | undefined;
    let oldTask: Task | undefined;
    
    projects.forEach(p => {
        p.folders?.forEach(f => {
            const found = f.tasks?.find(t => t.id === updatedTask.id);
            if (found) {
                sourceProject = p;
                oldTask = found;
            }
        });
    });

    if (!sourceProject || !oldTask) {
        console.error("No se encontró la tarea original para actualizar");
        return;
    }

    const isSameProject = sourceProject.id === updatedTask.projectId;
    const isSameFolder = oldTask.folderId === updatedTask.folderId;

    try {
        if (isSameProject) {
            // ACTUALIZACIÓN DENTRO DEL MISMO PROYECTO
            const projectRef = doc(db, "projects", sourceProject.id);
            const updatedFolders = sourceProject.folders.map(f => {
                // Quitar de la carpeta vieja si cambió de carpeta dentro del mismo proyecto
                if (!isSameFolder && f.id === oldTask!.folderId) {
                    return { ...f, tasks: f.tasks.filter(t => t.id !== updatedTask.id) };
                }
                // Agregar/Actualizar en la carpeta destino
                if (f.id === updatedTask.folderId) {
                    const alreadyInFolder = f.tasks.some(t => t.id === updatedTask.id);
                    if (alreadyInFolder) {
                        return { ...f, tasks: f.tasks.map(t => t.id === updatedTask.id ? updatedTask : t) };
                    } else {
                        return { ...f, tasks: [...f.tasks, updatedTask] };
                    }
                }
                return f;
            });
            await updateDoc(projectRef, { folders: updatedFolders });
        } else {
            // MOVIMIENTO ENTRE PROYECTOS DIFERENTES
            const sourceProjectRef = doc(db, "projects", sourceProject.id);
            const targetProjectRef = doc(db, "projects", updatedTask.projectId);
            const targetProject = projects.find(p => p.id === updatedTask.projectId);
            
            if (!targetProject) return;

            // 1. Quitar del origen
            const cleanSourceFolders = sourceProject.folders.map(f => ({
                ...f,
                tasks: (f.tasks || []).filter(t => t.id !== updatedTask.id)
            }));
            await updateDoc(sourceProjectRef, { folders: cleanSourceFolders });

            // 2. Agregar al destino
            const updatedTargetFolders = (targetProject.folders || []).map(f => {
                if (f.id === updatedTask.folderId) {
                    return { ...f, tasks: [...(f.tasks || []), updatedTask] };
                }
                return f;
            });
            await updateDoc(targetProjectRef, { folders: updatedTargetFolders });
            
            setToastNotification({ 
                title: "Tarea Reasignada", 
                message: `Movida a: ${targetProject.name}`, 
                icon: 'projects' 
            });
        }

        // NOTIFICAR AL DUEÑO SI UN INVITADO CAMBIA TAREA
        const targetProject = projects.find(p => p.id === updatedTask.projectId);
        if (targetProject) await notifyOwnerIfCollaborator(targetProject.id, `actualizado la tarea "${updatedTask.title}"`);

        // NOTIFICAR A LOS ASIGNADOS SOBRE CAMBIOS
        const peopleToNotify = updatedTask.assignedTo?.filter(uid => uid !== currentUser?.uid) || [];
        const oldAssignedTo = oldTask?.assignedTo || [];
        
        for (const uid of peopleToNotify) {
            const isNewAssignment = !oldAssignedTo.includes(uid);
            await createNotification(uid, {
                type: isNewAssignment ? 'task_due' : 'project_update',
                text: isNewAssignment 
                    ? `🚀 **Nueva Tarea**: ${userProfile.name} te asignó "**${updatedTask.title}**" (${targetProject?.name || 'Proyecto'}).`
                    : `📝 **Tarea Actualizada**: ${userProfile.name} realizó cambios en "**${updatedTask.title}**" (${targetProject?.name || 'Proyecto'}).`,
                link: `/#/projects/${updatedTask.projectId}/task/${updatedTask.id}`,
                fromUser: { uid: currentUser?.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
            });
        }

        if (oldTask && oldTask.status !== 'Hecho' && updatedTask.status === 'Hecho') { 
            triggerReward('task_complete'); 
            targetProject?.memberIds.forEach(async (uid) => { 
                if (uid !== currentUser?.uid) { 
                    await createNotification(uid, { 
                        type: 'ai_task_complete', 
                        text: `✅ <strong>${userProfile.name}</strong> completó la tarea <strong>${updatedTask.title}</strong> en <strong>${targetProject.name}</strong>.`, 
                        link: `/#/projects/${targetProject.id}`, 
                        fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } 
                    }); 
                } 
            }); 
        }

        await recalculateUserStats(currentUser.uid);
    } catch (error) {
        console.error("Error al actualizar tarea:", error);
        setToastNotification({ title: "Error", message: "No se pudo actualizar la tarea.", icon: 'close' });
    }
  };

  const reorderOrMoveTask = async (draggedTaskId: string, targetTaskId: string | null, targetFolderId: string, projectId: string) => { const projectRef = doc(db, "projects", projectId); const project = projects.find(p => p.id === projectId); if (!project) return; let taskToMove: Task | undefined; const sourceFolder = project.folders.find(f => f.tasks.some(t => { if (t.id === draggedTaskId) { taskToMove = t; return true; } return false; })); if (!taskToMove || !sourceFolder) return; const taskWithNewFolder = { ...taskToMove, folderId: targetFolderId }; const updatedFolders = project.folders.map(f => { if (f.id === sourceFolder.id) { f.tasks = f.tasks.filter(t => t.id !== draggedTaskId); } if (f.id === targetFolderId) { if (targetTaskId) { const targetIndex = f.tasks.findIndex(t => t.id === targetTaskId); f.tasks.splice(targetIndex, 0, taskWithNewFolder); } else { f.tasks.push(taskWithNewFolder); } } return f; }); await updateDoc(projectRef, { folders: updatedFolders }); };
  const deleteTask = async (taskId: string, projectId: string, folderId: string) => { if (!currentUser) return; const project = projects.find(p => p.id === projectId); if (!project) return; const updatedFolders = project.folders.map(f => { if (f.id === folderId) { return { ...f, tasks: f.tasks.filter(t => t.id !== taskId) }; } return f; }); setProjects(prev => prev.map(p => p.id === projectId ? { ...p, folders: updatedFolders } : p)); const projectRef = doc(db, "projects", projectId); await updateDoc(projectRef, { folders: updatedFolders }); await releaseLimit(currentUser.uid, 'task_create'); };
  const startAiTask = async (task: Partial<AiTask>) => { if (!currentUser) return; const status = task.status || 'pending'; const newTask = { ...task, userId: currentUser.uid, status: status, createdAt: new Date().toISOString() }; await addDoc(collection(db, "aiTasks"), newTask); };
  const deleteAiTask = async (task: any) => { await deleteDoc(doc(db, "aiTasks", task.id)); };
  const addHubPost = async (content: string, groupId?: string, media?: any, stickerUrl?: string, silent?: boolean, isSensitive?: boolean) => { if (!currentUser) return; try { const safeMedia = media ? { url: media.url || null, type: media.type || 'file', name: media.name || 'Attachment', originalType: media.originalType || 'unknown', ...(media.type === 'image' ? { imageUrl: media.url } : {}), ...(media.type === 'video' ? { videoUrl: media.url } : {}), ...(media.type === 'audio' ? { audioUrl: media.url } : {}) } : null; const newPostRef = await addDoc(collection(db, "hubPosts"), { author: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl, headline: userProfile.headline }, content: content || '', timestamp: new Date().toISOString(), likes: 0, likedBy: [], comments: [], groupId: groupId || null, readBy: [userProfile.uid], ...(safeMedia ? { file: safeMedia, ...safeMedia } : {}), stickerUrl: stickerUrl || null, isSensitive: isSensitive || false }); await checkSocialPostLimit(); triggerReward('post'); if (content && content.toLowerCase().includes('@shivo')) { generateShivoCommentResponse(content, content, safeMedia?.url).then(async (response) => { if (response) { const shivoComment = { id: `c-shivo-${Date.now()}`, author: { uid: 'shivo_ai', name: 'Shivo AI', avatarUrl: 'https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747' }, text: response, timestamp: new Date().toISOString() }; await updateDoc(newPostRef, { comments: arrayUnion(shivoComment) }); } }).catch(err => console.error("Shivo auto-reply error", err)); } if (groupId) { const groupDoc = await getDoc(doc(db, "hubGroups", groupId)); if (groupDoc.exists()) { const groupData = groupDoc.data(); const members = groupData.members || []; members.forEach(async (memberId: string) => { if (memberId !== currentUser.uid) { await createNotification(memberId, { type: 'group_post', text: `<strong>${userProfile.name}</strong> publicó en <strong>${groupData.name}</strong>.`, link: `/#hub/group/${groupId}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); } }); } } if (!silent) { notificationService.playBeep('post'); setToastNotification({ title: "Post Creado", message: "Tu publicación está en vivo.", icon: 'check' }); } } catch (error) { console.error("Error posting to Hub:", error); setToastNotification({ title: "Error", message: "No se pudo publicar.", icon: 'close' }); } };
  
  const repostPost = async (postId: string) => {
      if (!currentUser) return;
      const original = hubPosts.find(p => p.id === postId);
      if (!original) return;
      
      try {
          const repostData = {
              author: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl, headline: userProfile.headline },
              content: original.content,
              timestamp: new Date().toISOString(),
              likes: 0,
              likedBy: [],
              comments: [],
              groupId: null,
              readBy: [userProfile.uid],
              repostOf: original.id,
              repostedBy: { uid: userProfile.uid, name: userProfile.name }
          };
          
          await addDoc(collection(db, "hubPosts"), repostData);
          
          if (original.author.uid !== currentUser.uid) {
              await createNotification(original.author.uid, {
                  type: 'repost',
                  text: `🔄 <strong>${userProfile.name}</strong> ha reposteado tu publicación.`,
                  link: `/#hub/feed`,
                  fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
              });
          }
          
          setToastNotification({ title: "Reposteado", message: "La publicación se compartió en tu feed.", icon: 'sync' });
      } catch (e) {
          console.error(e);
      }
  };

  const updateHubPost = async (postId: string, updates: Partial<HubPost>) => { await updateDoc(doc(db, "hubPosts", postId), updates); };
  const deleteHubPost = async (postId: string) => { await deleteDoc(doc(db, "hubPosts", postId)); };
  const likePost = async (postId: string) => { const postRef = doc(db, "hubPosts", postId); const post = hubPosts.find(p => p.id === postId); if (!post || !currentUser) return; const hasLiked = post.likedBy.includes(currentUser.uid); if (hasLiked) { await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) }); } else { await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) }); if (post.author.uid !== currentUser.uid) { await createNotification(post.author.uid, { type: 'like', text: `A <strong>${userProfile.name}</strong> le gustó tu publicación.`, link: `/#hub/feed/${postId}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); } } };
  
  const addCommentToPost = async (postId: string, text: string, audioUrl?: string, parentCommentId?: string) => { 
    const postRef = doc(db, "hubPosts", postId); 
    const post = hubPosts.find(p => p.id === postId); 
    if (!post || !currentUser) return; 
    
    const newComment: Comment = { 
        id: `c-${Date.now()}`, 
        author: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }, 
        text, 
        timestamp: new Date().toISOString(), 
        audioUrl: audioUrl || null,
        replies: [] 
    }; 
    
    if (parentCommentId) {
        // LÓGICA DE COMENTARIO ANIDADO (REPLY) v4.8
        const updatedComments = post.comments.map(c => {
            if (c.id === parentCommentId) {
                return { ...c, replies: [...(c.replies || []), newComment] };
            }
            return c;
        });
        await updateDoc(postRef, { comments: updatedComments });
    } else {
        await updateDoc(postRef, { comments: arrayUnion(newComment) }); 
    }

    if (text.split(/\s+/).length > 10) { triggerReward('comment'); } 
    if (post.author.uid !== currentUser.uid) { await createNotification(post.author.uid, { type: 'comment', text: `<strong>${userProfile.name}</strong> comentó: "${text.substring(0, 40)}..."`, link: `/#hub/feed/${postId}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); } 
  };
  
  const updateComment = async (postId: string, commentId: string, text: string) => {
      const postRef = doc(db, "hubPosts", postId);
      const post = hubPosts.find(p => p.id === postId);
      if (!post) return;
      
      const updatedComments = post.comments.map(c => {
          if (c.id === commentId) return { ...c, text };
          if (c.replies) {
              const updatedReplies = c.replies.map(r => r.id === commentId ? { ...r, text } : r);
              return { ...c, replies: updatedReplies };
          }
          return c;
      });
      await updateDoc(postRef, { comments: updatedComments });
  };

  const likeComment = async (postId: string, commentId: string) => { const postRef = doc(db, "hubPosts", postId); const post = hubPosts.find(p => p.id === postId); if (!post || !currentUser) return; 
    const updatedComments = post.comments.map(c => { 
        if (c.id === commentId) { 
            const likedBy = c.likedBy || []; const hasLiked = likedBy.includes(currentUser.uid); 
            return { ...c, likes: (c.likes || 0) + (hasLiked ? -1 : 1), likedBy: hasLiked ? likedBy.filter(id => id !== currentUser.uid) : [...likedBy, currentUser.uid] }; 
        } 
        if (c.replies) {
            const updatedReplies = c.replies.map(r => {
                if (r.id === commentId) {
                    const likedBy = r.likedBy || []; const hasLiked = likedBy.includes(currentUser.uid);
                    return { ...r, likes: (r.likes || 0) + (hasLiked ? -1 : 1), likedBy: hasLiked ? likedBy.filter(id => id !== currentUser.uid) : [...likedBy, currentUser.uid] };
                }
                return r;
            });
            return { ...c, replies: updatedReplies };
        }
        return c; 
    }); await updateDoc(postRef, { comments: updatedComments }); };

  const deleteComment = async (postId: string, commentId: string) => { 
    const postRef = doc(db, "hubPosts", postId); 
    const post = hubPosts.find(p => p.id === postId); 
    if (!post) return; 
    
    const updatedComments = post.comments.filter(c => c.id !== commentId).map(c => {
        if (c.replies) {
            return { ...c, replies: c.replies.filter(r => r.id !== commentId) };
        }
        return c;
    });
    await updateDoc(postRef, { comments: updatedComments }); 
  };

  const markPostAsRead = async (postId: string) => { if (!currentUser) return; await updateDoc(doc(db, "hubPosts", postId), { readBy: arrayUnion(currentUser.uid) }); };
  const addMarketplaceListing = async (listing: any) => { if (!currentUser) return; await addDoc(collection(db, "marketplace"), { ...listing, user: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); setToastNotification({ title: "Listing Created", message: "Item added.", icon: "check" }); };
  const deleteMarketplaceListing = async (id: string) => { await deleteDoc(doc(db, "marketplace", id)); };
  const buyItem = async (item: MarketplaceListing) => { };
  const addJobListing = async (listing: any) => { addMarketplaceListing({...listing, type: 'job'}); };
  const addHubGroup = async (group: any, initialMembers: string[]): Promise<string> => { if (!currentUser) throw new Error("Not logged in"); const ref = await addDoc(collection(db, "hubGroups"), { ...group, creatorId: currentUser.uid, members: [currentUser.uid, ...initialMembers], memberCount: 1 + initialMembers.length }); if (!group.isPrivate) { const postContent = `📢 **Nuevo Grupo:** ${group.name}\n\n${group.description}\n\n[Unirse al Grupo](/#/hub/group/${ref.id})`; await addHubPost(postContent, undefined, undefined, undefined, true); } setToastNotification({ title: "Group Created", message: `${group.name} created.`, icon: "check" }); return ref.id; };
  const updateHubGroup = async (groupId: string, updates: any) => { await updateDoc(doc(db, "hubGroups", groupId), updates); };
  const deleteHubGroup = async (groupId: string) => { if(!currentUser) return; try { await deleteDoc(doc(db, "hubGroups", groupId)); setToastNotification({title: "Grupo Eliminado", message: "El grupo ha sido borrado.", icon: "trash"}); } catch(e) { console.error(e); setToastNotification({title: "Error", message: "No se pudo eliminar the grupo.", icon: "close"}); } };
  const joinGroup = async (groupId: string) => { if (!currentUser) return; const group = hubGroups.find(g => g.id === groupId); if (!group) return; if (group.isPrivate) { await updateDoc(doc(db, "hubGroups", groupId), { pendingMembers: arrayUnion(currentUser.uid) }); } else { await updateDoc(doc(db, "hubGroups", groupId), { members: arrayUnion(currentUser.uid), memberCount: increment(1) }); triggerReward('group_join'); } };
  const cancelGroupJoinRequest = async (groupId: string) => { if (!currentUser) return; await updateDoc(doc(db, "hubGroups", groupId), { pendingMembers: arrayRemove(currentUser.uid) }); setToastNotification({ title: "Cancelada", message: "Solicitud retirada.", icon: 'close' }); };
  const approveGroupMember = async (groupId: string, uid: string) => { await updateDoc(doc(db, "hubGroups", groupId), { pendingMembers: arrayRemove(uid), members: arrayUnion(uid), memberCount: increment(1) }); };
  const denyGroupMember = async (groupId: string, uid: string) => { await updateDoc(doc(db, "hubGroups", groupId), { pendingMembers: arrayRemove(uid) }); };
  const removeGroupMember = async (groupId: string, uid: string) => { await updateDoc(doc(db, "hubGroups", groupId), { members: arrayRemove(uid), memberCount: increment(-1) }); };
  const isUserBlocked = (targetUid: string) => {
      const myBlocks = userProfile.blockedUsers || [];
      const target = allUsers.find(u => u.uid === targetUid);
      const targetBlocks = target?.blockedUsers || [];
      return myBlocks.includes(targetUid) || targetBlocks.includes(currentUser?.uid || '');
  };
  const blockUser = async (targetUid: string) => {
    if (!currentUser || targetUid === currentUser.uid) return;
    const conversationId = [currentUser.uid, targetUid].sort().join('_');
    const batch = writeBatch(db);
    batch.update(doc(db, "users", currentUser.uid), { blockedUsers: arrayUnion(targetUid), circle: arrayRemove(targetUid) });
    batch.update(doc(db, "conversations", conversationId), { blockedBy: arrayUnion(currentUser.uid) });
    await batch.commit().catch(async () => {
      await updateDoc(doc(db, "users", currentUser!.uid), { blockedUsers: arrayUnion(targetUid), circle: arrayRemove(targetUid) });
      await updateDoc(doc(db, "conversations", conversationId), { blockedBy: arrayUnion(currentUser!.uid) }).catch(() => null);
    });
    await updateDoc(doc(db, "users", targetUid), { circle: arrayRemove(currentUser.uid) }).catch(() => null);
    setUserProfile(prev => ({ ...prev, blockedUsers: Array.from(new Set([...(prev.blockedUsers || []), targetUid])), circle: (prev.circle || []).filter(id => id !== targetUid) }));
    setToastNotification({ title: "Usuario bloqueado", message: "No podrá ver tu perfil completo ni enviarte mensajes.", icon: "lock" });
  };

  const unblockUser = async (targetUid: string) => {
    if (!currentUser) return;
    const conversationId = [currentUser.uid, targetUid].sort().join('_');
    await updateDoc(doc(db, "users", currentUser.uid), { blockedUsers: arrayRemove(targetUid) });
    await updateDoc(doc(db, "conversations", conversationId), { blockedBy: arrayRemove(currentUser.uid) }).catch(() => null);
    setUserProfile(prev => ({ ...prev, blockedUsers: (prev.blockedUsers || []).filter(id => id !== targetUid) }));
    setToastNotification({ title: "Usuario desbloqueado", message: "Puede volver a interactuar contigo según tu privacidad.", icon: "check" });
  };
  const sendDirectMessage = async (recipient: UserProfile, text: string, file?: any, audioUrl?: string, stickerUrl?: string) => {
    if (!currentUser) return;
    const targetUid = recipient.uid || (recipient as any).id;
    if (!targetUid) {
      console.error("Invalid recipient, missing UID", recipient);
      setToastNotification({ title: "Error", message: "Usuario no válido (Falta ID).", icon: "close" });
      return;
    }
    if (isUserBlocked(targetUid)) {
      setToastNotification({ title: "Interacción bloqueada", message: "Uno de los usuarios bloqueó esta interacción.", icon: "lock" });
      return;
    }
    const conversationId = [currentUser.uid, targetUid].sort().join('_');
    const conversationRef = doc(db, 'conversations', conversationId);
    const conversationSnap = await getDoc(conversationRef);
    const members = [currentUser.uid, targetUid];
    const lastMessageData = { text: text || 'Attachment', timestamp: serverTimestamp(), senderId: currentUser.uid };
    const unreadByUpdate = { [`unreadBy.${targetUid}`]: increment(1), [`unreadBy.${currentUser.uid}`]: 0 } as any;
    if (!conversationSnap.exists()) {
      await setDoc(conversationRef, { members, lastMessage: lastMessageData, deletedBy: [], blockedBy: [], unreadBy: { [targetUid]: 1, [currentUser.uid]: 0 } });
    } else {
      const data: any = conversationSnap.data() || {};
      if (Array.isArray(data.blockedBy) && data.blockedBy.length > 0) {
        setToastNotification({ title: "Interacción bloqueada", message: "Esta conversación está bloqueada.", icon: "lock" });
        return;
      }
      await updateDoc(conversationRef, { lastMessage: lastMessageData, deletedBy: [], ...unreadByUpdate });
    }
    await addDoc(collection(db, `conversations/${conversationId}/messages`), { senderId: currentUser.uid, text: text || '', file: file || null, audioUrl: audioUrl || null, stickerUrl: stickerUrl || null, timestamp: serverTimestamp(), read: false });
    await createNotification(targetUid, { type: 'new_message', text: `<strong>${userProfile.name}</strong> te envió un mensaje.`, link: `/hub/messages/${conversationId}`, fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } });
  };
  const deleteConversation = async (id: string) => { if (!currentUser) return; await updateDoc(doc(db, "conversations", id), { deletedBy: arrayUnion(currentUser.uid) }); setNotifications(prev => prev.filter(n => !n.link?.includes(id))); };
  const sendCircleRequest = async (uid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", uid), { circleRequests: arrayUnion(currentUser.uid) }); await createNotification(uid, { type: 'general', text: `<strong>${userProfile.name}</strong> quiere añadirte a su círculo.`, link: '/#hub/people', fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }, metadata: { type: 'circle_request', requesterId: currentUser.uid } }); setToastNotification({ title: "Solicitud Enviada", message: "El usuario recibirá una notificación.", icon: "check" }); } catch (e) { console.error("Send circle request failed:", e); setToastNotification({title: "Error", message: "No se pudo enviar solicitud.", icon: "close"}); } };
  const acceptCircleRequest = async (uid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", currentUser.uid), { circle: arrayUnion(uid), circleRequests: arrayRemove(uid) }); await updateDoc(doc(db, "users", uid), { circle: arrayUnion(currentUser.uid) }); await createNotification(uid, { type: 'general', text: `<strong>${userProfile.name}</strong> aceptó tu solicitud de círculo.`, link: '/#profile', fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); setToastNotification({ title: "Conexión Aceptada", message: "Ahora están en el círculo del otro.", icon: "users" }); } catch(e) { console.error("Error accepting request", e); setToastNotification({ title: "Error", message: "No se pudo aceptar la solicitud.", icon: "close" }); } };
  const declineCircleRequest = async (uid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", currentUser.uid), { circleRequests: arrayRemove(uid) }); setToastNotification({ title: "Solicitud Rechazada", message: "La solicitud ha sido eliminada.", icon: "trash" }); } catch (e) { console.error("Error declining request", e); } };
  const removeConnection = async (targetUid: string) => { if (!currentUser) return; try { await updateDoc(doc(db, "users", currentUser.uid), { circle: arrayRemove(targetUid) }); await updateDoc(doc(db, "users", targetUid), { circle: arrayRemove(currentUser.uid) }); setUserProfile(prev => ({ ...prev, circle: prev.circle ? prev.circle.filter(id => id !== targetUid) : [] })); setToastNotification({ title: "Conexión Eliminada", message: "Se ha eliminado del círculo correctamente.", icon: "trash" }); } catch (e) { console.error(e); setToastNotification({ title: "Error", message: "No se pudo eliminar la conexión.", icon: "close" }); } };
  const addAgent = async (agent: any) => { if (!currentUser) return; if (await handleLimitCheck('agent_create')) return; await addDoc(collection(db, "agents"), { ...agent, ownerId: currentUser.uid }); await syncUserUsage(currentUser.uid, userProfile.plan); };
  const updateAgent = async (id: string, updates: any) => { await updateDoc(doc(db, "agents", id), updates); };
  const deleteAgent = async (id: string) => { 
    if (!currentUser) return; 
    try {
        await deleteDoc(doc(db, "agents", id)); 
        await syncUserUsage(currentUser.uid, userProfile.plan);
        setToastNotification({ title: "Agente Eliminado", message: "El vendedor ha sido retirado.", icon: 'trash' });
    } catch (e: any) {
        console.error("Error al eliminar agente:", e);
        setToastNotification({ title: "Error", message: "No tienes permisos para eliminar este agente.", icon: 'close' });
    }
  };
  const deleteAgentConversation = async (id: string) => { if (!currentUser) return; await updateDoc(doc(db, "agentConversations", id), { deletedBy: arrayUnion(currentUser.uid) }); };
  const addForm = async (form: any) => { 
    if (!currentUser) return; 
    const slug = form.name.trim().replace(/\s+/g, '-').toLowerCase();
    await addDoc(collection(db, "forms"), { 
      ...form, 
      slug,
      ownerId: currentUser.uid, 
      createdAt: new Date().toISOString(), 
      responseCount: 0 
    }); 
  };
  const updateForm = async (id: string, updates: any) => { 
    if (!currentUser) return; 
    if (updates.name) {
      updates.slug = updates.name.trim().replace(/\s+/g, '-').toLowerCase();
    }
    await updateDoc(doc(db, "forms", id), updates); 
  };
  const deleteForm = async (id: string) => { if (!currentUser) return; await deleteDoc(doc(db, "forms", id)); await releaseLimit(currentUser.uid, 'form_create'); };
  const loadFormResponses = async (formId: string) => { const q = query(collection(db, `forms/${formId}/responses`), orderBy('submittedAt', 'desc')); const snap = await getDocs(q); const responses = snap.docs.map(d => ({ id: d.id, formId, ...d.data() } as any)); setFormResponses(prev => ({ ...prev, [formId]: responses })); };
  const addNewWebDevSession = async (type: 'web' | 'app' = 'web') => { 
    if (!currentUser) return; 
    const nextNum = webDevSessions.length + 1; 
    const newSession: Partial<WebDevSession> = { 
      name: `${type === 'web' ? 'Web' : 'App'} ${nextNum}`, 
      type,
      activeFileIndex: 0,
      files: [{
        name: 'index.html',
        code: '',
        history: [],
        isGenerating: false,
        agentStatus: 'Agente 1 esperando instrucciones',
        versions: [''],
        currentVersionIndex: 0
      }],
      createdAt: new Date().toISOString()
    }; 
    try { 
      const docRef = await addDoc(collection(db, `users/${currentUser.uid}/webDevSessions`), newSession); 
      setActiveWebDevSessionId(docRef.id); 
    } catch (e) { 
      console.error("Error creating web session", e); 
    } 
  };
  const updateWebDevSession = async (sessionId: string, updates: Partial<WebDevSession>) => { 
    if (!currentUser) return; 
    // Optimistic local update to prevent race conditions during rapid streaming updates
    setWebDevSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s));
    try { 
      await updateDoc(doc(db, `users/${currentUser.uid}/webDevSessions`, sessionId), updates); 
    } catch (e) { 
      console.error("Error updating web session", e); 
    } 
  };

  const updateWebDevFile = async (sessionId: string, fileIndex: number, updates: Partial<WebFile>) => {
    if (!currentUser) return;
    setWebDevSessions(prev => prev.map(s => {
      if (s.id === sessionId && s.files && s.files[fileIndex]) {
        const newFiles = [...s.files];
        newFiles[fileIndex] = { ...newFiles[fileIndex], ...updates };
        
        // Update Firestore too
        updateDoc(doc(db, `users/${currentUser.uid}/webDevSessions`, sessionId), { files: newFiles })
          .catch(e => console.error("Error updating web file", e));
          
        return { ...s, files: newFiles };
      }
      return s;
    }));
  };
  const deleteWebDevSession = async (sessionId: string) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, `users/${currentUser.uid}/webDevSessions`, sessionId));
      if (activeWebDevSessionId === sessionId) {
        setActiveWebDevSessionId('');
      }
    } catch (e) {
      console.error("Error deleting web session", e);
    }
  };
  const assignCodeToProject = async (sessionId: string, projectId: string) => { 
    if (!currentUser) return; 
    const session = webDevSessions.find(s => s.id === sessionId); 
    const project = projects.find(p => p.id === projectId); 
    if (!session || !project || !session.files || session.files.length === 0) return; 
    
    setToastNotification({ title: "Guardando...", message: "Subiendo archivos al proyecto.", icon: "box", isLoading: true });

    try {
        let downloadUrl = '';
        let fileName = '';
        let fileType = '';
        let fileSize = 0;

        if (session.files.length === 1) {
            const activeFile = session.files[0];
            fileName = activeFile.name.endsWith('.html') ? activeFile.name : `${activeFile.name}.html`;
            fileType = 'text/html';
            const blob = new Blob([activeFile.code], { type: 'text/html' });
            fileSize = blob.size;
            
            const uploaded = await uploadWithQuotaCheck({ userId: currentUser.uid, data: blob, sizeBytes: fileSize, path: safeStoragePath('projects', currentUser.uid, projectId, 'web', `${Date.now()}_${fileName}`), metadata: { contentType: fileType }, plan: userProfile.plan });
            downloadUrl = uploaded.url;
        } else {
            const zip = new JSZip();
            session.files.forEach(f => {
                zip.file(f.name, f.code);
            });
            const blob = await zip.generateAsync({ type: "blob" });
            fileName = `Proyecto_${session.name.replace(/\s+/g, '_')}.zip`;
            fileType = 'application/zip';
            fileSize = blob.size;

            const uploaded = await uploadWithQuotaCheck({ userId: currentUser.uid, data: blob, sizeBytes: fileSize, path: safeStoragePath('projects', currentUser.uid, projectId, 'web', `${Date.now()}_${fileName}`), metadata: { contentType: fileType }, plan: userProfile.plan });
            downloadUrl = uploaded.url;
        }

        const newDoc = { 
          id: `doc-web-${Date.now()}`, 
          name: fileName, 
          content: downloadUrl, // Usamos esto como URL para que sea compatible con el visor de documentos
          uploadedAt: new Date().toISOString(), 
          size: fileSize, 
          fileType: fileType 
        }; 

        const existingDocs = project.documents || []; 
        await updateProject(projectId, { documents: [newDoc, ...existingDocs] }); 
        setToastNotification({ title: "Guardado con Éxito", message: "Archivo disponible en documentos del proyecto.", icon: "check" }); 
    } catch (e) {
        console.error("Error assigned code to project:", e);
        setToastNotification({ title: "Error", message: "No se pudo guardar el archivo.", icon: "close" });
    }
  };
  const addNewGlobalChat = async () => { if (!currentUser) return; const nextNum = globalChats.length + 1; const newChatId = `chat-${Date.now()}`; const newChat = { id: newChatId, name: `Chat ${nextNum}`, history: [], updatedAt: new Date().toISOString() }; setGlobalChats(prev => [newChat, ...prev]); setActiveGlobalChatId(newChatId); await setDoc(doc(db, `users/${currentUser.uid}/globalChats`, newChatId), newChat); };
  const updateGlobalChatName = async (chatId: string, newName: string) => { if (!currentUser) return; setGlobalChats(prev => prev.map(c => c.id === chatId ? { ...c, name: newName } : c)); await updateDoc(doc(db, `users/${currentUser.uid}/globalChats`, chatId), { name: newName }); };
  const deleteGlobalChat = async (chatId: string) => { if (!currentUser) return; const remaining = globalChats.filter(c => c.id !== chatId); setGlobalChats(remaining); if (activeGlobalChatId === chatId && remaining.length > 0) { setActiveGlobalChatId(remaining[0].id); } await deleteDoc(doc(db, `users/${currentUser.uid}/globalChats`, chatId)); };
  const assignGlobalChatToProject = async (chatId: string, projectId: string) => { if (!currentUser) return; const chat = globalChats.find(c => c.id === chatId); const project = projects.find(p => p.id === projectId); if (!chat || !project) { return; } const newProjectChat = { id: `chat-imported-${Date.now()}`, name: chat.name || "Imported Chat", history: chat.history, deletedBy: [] }; const existingChats = project.chats || []; await updateProject(projectId, { chats: [newProjectChat, ...existingChats] }); };
  const logOut = async () => { await signOut(auth); };
  const logInWithEmail = async (e: string, p: string) => { await signInWithEmailAndPassword(auth, e, p); };
  const deleteUserAccount = async (pwd: string) => { if (currentUser) { await performNuclearDeletion(currentUser.uid); await deleteUser(currentUser); } };
  const buyExtraAgent = async () => { };
  const sendIntis = async (email: string, amount: number, note: string) => { 
    if(!currentUser) return; 
    try { 
        const q = query(collection(db, "users"), where("email", "==", email)); 
        const querySnapshot = await getDocs(q); 
        if(querySnapshot.empty) { 
            setToastNotification({ title: "Error", message: "Usuario no encontrado con ese email.", icon: "close" }); 
            return; 
        } 
        const recipientDoc = querySnapshot.docs[0]; 
        const recipientData = recipientDoc.data(); 
        if(intisBalanceState < amount) { 
            setToastNotification({ title: "Error", message: "Saldo insuficiente.", icon: "wallet" }); 
            return; 
        } 
        const batch = writeBatch(db); 
        const senderRef = doc(db, "users", currentUser.uid); 
        batch.update(senderRef, { intisBalance: increment(-amount) }); 
        const recipientRef = doc(db, "users", recipientDoc.id); 
        batch.update(recipientRef, { intisBalance: increment(amount) }); 
        const txId = `tx_${Date.now()}`; 
        const senderTxRef = doc(db, `users/${currentUser.uid}/transactions`, txId); 
        batch.set(senderTxRef, { id: txId, type: 'Enviado', amount: amount, description: `A: ${recipientData.name}. Nota: ${note}`, date: new Date().toISOString() }); 
        const recipientTxRef = doc(db, `users/${recipientDoc.id}/transactions`, txId); 
        batch.set(recipientTxRef, { id: txId, type: 'Recibido', amount: amount, description: `De: ${userProfile.name}. Nota: ${note}`, date: new Date().toISOString() }); 
        await batch.commit(); 
        await createNotification(recipientDoc.id, { type: 'general', text: `💰 Recibiste <strong>${amount} Intis</strong> de <strong>${userProfile.name}</strong>.<br/>Nota: ${note}`, link: '/#wallet', fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl } }); 
        setIntisBalanceState(prev => prev - amount); 
        setToastNotification({ title: "Enviado", message: `Has enviado ${amount} Intis exitosamente.`, icon: "check" }); 
        
        // Background email receipt sending
        fetch('/api/wallet/receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ownerId: currentUser.uid,
                ownerName: userProfile.name,
                recipientEmail: email,
                amount: amount,
                note: note,
                txId: txId
            })
        }).catch(err => console.error("Failed to trigger background email receipt", err));

    } catch(e) { 
        console.error("Send intis failed", e); 
        setToastNotification({ title: "Error", message: "Falló la transferencia.", icon: "close" }); 
    } 
  };
  const addIntisTransaction = async (tx: any) => { };
  const applyToJob = async () => { triggerReward('job_apply'); };
  const sendHubMediaToProject = async (media: { url: string; name: string; type: string }, projectId: string) => { const project = projects.find(p => p.id === projectId); if (!project) return; const newDoc = { id: `doc-${Date.now()}`, name: media.name, content: media.url, uploadedAt: new Date().toISOString(), size: 0, fileType: media.type }; const existingDocs = project.documents || []; await updateProject(projectId, { documents: [newDoc, ...existingDocs] }); };
  const sendDataUrlToProject = async (dataUrl: string, name: string, type: string, projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const size = Math.round((dataUrl.length * 3) / 4);
    if (await handleLimitCheck('storage', size)) {
        throw new Error("Storage limit reached");
    }

    const newDoc = {
      id: `doc-${Date.now()}`,
      name: name,
      content: dataUrl,
      uploadedAt: new Date().toISOString(),
      size: size,
      fileType: type
    };
    const existingDocs = project.documents || [];
    await updateProject(projectId, { documents: [newDoc, ...existingDocs] });
  };
  const sendArticleToProject = async (article: GoatifyArticle, projectId: string) => { const project = projects.find(p => p.id === projectId); if (!project) return; const content = `# ${article.title}\n\n**Fuente:** ${article.source}\n**Resumen:** ${article.summary}\n\n${article.content}\n\n**Goatify Takeaway:** ${article.goatifyTakeaway}`; const newNote = { id: `note-article-${Date.now()}`, title: `Artículo: ${article.title}`, content: content, createdAt: new Date().toISOString() }; const existingNotes = project.notes || []; await updateProject(projectId, { notes: [newNote, ...existingNotes] }); };
  const sendFormResponsesToProject = async (form: Form, projectId: string, format: 'csv' | 'pdf') => { setToastNotification({ title: "Enviado", message: "Respuestas enviadas.", icon: "check" }); };
  const inviteUserToProject = async (projectId: string, email: string) => {
    if (!currentUser) return;
    try {
      const emailLower = email.toLowerCase();
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      const q = query(collection(db, "users"), where("email", "==", emailLower));
      const snapshot = await getDocs(q);

      const targetUrl = `${window.location.origin}/#/projects/${projectId}`;

      if (snapshot.empty) {
        // Usuario no existe en Goatify aún
        if (project.pendingInvites?.includes(emailLower)) {
          setToastNotification({ title: "Info", message: "Ya se ha invitado a este correo.", icon: "user" });
          return;
        }

        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, {
          pendingInvites: arrayUnion(emailLower)
        });

        // Enviar email de invitación
        await fetch('/api/project/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerId: currentUser.uid,
            ownerName: userProfile.name,
            projectName: project.name,
            guestEmail: emailLower,
            targetUrl
          })
        });

        setToastNotification({ title: "Invitación Enviada", message: `Se ha enviado un correo a ${emailLower}.`, icon: "check" });
      } else {
        // Usuario existe en Goatify
        const targetUserDoc = snapshot.docs[0];
        const targetUser = targetUserDoc.data() as UserProfile;
        const targetUid = targetUserDoc.id;

        if (project.memberIds.includes(targetUid)) {
          setToastNotification({ title: "Info", message: "El usuario ya es miembro.", icon: "user" });
          return;
        }

        // Crear notificación interna
        await createNotification(targetUid, {
          type: 'project_invite',
          text: `🤝 **Invitación de Colaboración**: <strong>${userProfile.name}</strong> te ha invitado a trabajar en el proyecto "**${project.name || 'Sin Nombre'}**".`,
          link: '',
          fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl },
          metadata: { projectId, projectName: project.name }
        });

        // Enviar email de invitación también
        await fetch('/api/project/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerId: currentUser.uid,
            ownerName: userProfile.name,
            projectName: project.name,
            guestEmail: emailLower,
            targetUrl
          })
        });

        setToastNotification({ title: "Invitación Enviada", message: `Se ha notificado a ${targetUser.name} y enviado un correo.`, icon: "check" });
      }
    } catch (e) {
      console.error("Project invite error", e);
      setToastNotification({ title: "Error", message: "No se pudo enviar la invitación.", icon: "close" });
    }
  };
  const acceptProjectInvite = async (notificationId: string, projectId: string) => { if (!currentUser) return; try { const projectRef = doc(db, "projects", projectId); const memberData = { uid: userProfile.uid, name: userProfile.name, email: userProfile.email, avatarUrl: userProfile.headline && userProfile.avatarUrl, headline: userProfile.headline, plan: userProfile.plan }; await updateDoc(projectRef, { memberIds: arrayUnion(currentUser.uid), members: arrayUnion(memberData) }); await deleteDoc(doc(db, `users/${currentUser.uid}/notifications`, notificationId)); setToastNotification({ title: "Proyecto Unido", message: "El proyecto ahora aparece en tu lista.", icon: "projects" }); } catch (e) { console.error("Accept project invite error", e); setToastNotification({ title: "Error", message: "No se pudo unir al proyecto.", icon: "close" }); } };
  const declineProjectInvite = async (notificationId: string) => { if (!currentUser) return; try { await deleteDoc(doc(db, `users/${currentUser.uid}/notifications`, notificationId)); setToastNotification({ title: "Invitación Rechazada", message: "Notificación eliminada.", icon: "trash" }); } catch (e) { console.error("Decline error", e); } };
  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
  const toggleFolderCollapse = (id: string) => setCollapsedFolderIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const addActivityLog = () => {};
  const rewardFileUpload = () => { triggerReward('upload'); };
  const markNotificationAsRead = async (id: string) => { await updateDoc(doc(db, `users/${currentUser?.uid}/notifications`, id), { read: true }); };
  const markNotificationsAsReadByType = async () => {};
  const markAllNotificationsAsRead = async () => { if (!currentUser) return; setNotifications(prev => prev.map(n => ({ ...n, read: true }))); const batch = writeBatch(db); const unread = notifications.filter(n => !n.read); if (unread.length === 0) return; unread.forEach(n => { const ref = doc(db, `users/${currentUser.uid}/notifications`, n.id); batch.update(ref, { read: true }); }); await batch.commit(); };
  const markGroupNotificationsAsRead = async () => {};
  
  const markNotificationsReadForSender = async (senderUid: string) => { 
      if (!currentUser) return; 
      const unread = notifications.filter(n => !n.read && (n.fromUser?.uid === senderUid || (n.metadata?.requesterId === senderUid))); 
      if (unread.length === 0) return; 
      const batch = writeBatch(db); 
      unread.forEach(n => { batch.update(doc(db, `users/${currentUser.uid}/notifications`, n.id), { read: true }); }); 
      await batch.commit(); 
  };

  const deleteNotification = async (id: string) => { await deleteDoc(doc(db, `users/${currentUser?.uid}/notifications`, id)); setNotifications(prev => prev.filter(n => n.id !== id)); };
  const deleteAllNotifications = async () => { if (!currentUser) return; setNotifications([]); const ref = collection(db, `users/${currentUser.uid}/notifications`); const snap = await getDocs(ref); const batch = writeBatch(db); snap.forEach(doc => batch.delete(doc.ref)); await batch.commit(); };
  
  const sendMediaToProject = async (media: any, projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const newDoc = {
      id: `doc-ai-${Date.now()}`,
      name: media.name || `AI_Media_${Date.now()}.${media.type === 'video' ? 'mp4' : 'png'}`,
      content: media.resultUrl || media.url,
      uploadedAt: new Date().toISOString(),
      size: media.size || 0,
      fileType: media.type === 'video' ? 'video/mp4' : 'image/png'
    };
    const existingDocs = project.documents || [];
    await updateProject(projectId, { documents: [newDoc, ...existingDocs] });
    setToastNotification({ title: "Guardado", message: "Archivo enviado al proyecto.", icon: 'check' });
  };

  const deleteProjectChat = async (projectId: string, chatId: string) => { const project = projects.find(p => p.id === projectId); if (!project || !currentUser) return; const updatedChats = project.chats.map(c => { if (c.id === chatId) { return { ...c, deletedBy: [...(c.deletedBy || []), currentUser.uid] }; } return c; }); await updateProject(projectId, { chats: updatedChats }); };
  const addCustomSticker = async (file: File): Promise<string | undefined> => { if (!currentUser) return undefined; try { const uploaded = await uploadWithQuotaCheck({ userId: currentUser.uid, data: file, sizeBytes: file.size || 204800, path: safeStoragePath('stickers', currentUser.uid, `${Date.now()}_${file.name}`), metadata: { contentType: file.type || 'application/octet-stream' }, plan: userProfile.plan }); await addDoc(collection(db, `users/${currentUser.uid}/customStickers`), { url: uploaded.url, ownerId: currentUser.uid, sizeBytes: uploaded.sizeBytes || file.size || 204800, createdAt: new Date().toISOString() }); return uploaded.url; } catch (e) { console.error("Error adding sticker:", e); return undefined; } };
  const deleteCustomSticker = async (stickerId: string, stickerUrl: string) => { if (!currentUser) return; try { await deleteDoc(doc(db, `users/${currentUser.uid}/customStickers`, stickerId)); const storageRef = ref(storage, stickerUrl); await deleteObject(storageRef).catch(e => console.warn("Storage delete error", e)); } catch (e) { console.error("Error deleting sticker:", e); } };
  const markArticleAsRead = () => {};
  const saveCallRecording = async (url: string, sizeBytes: number, title?: string) => { if (!currentUser) return; if (await handleLimitCheck('storage', sizeBytes)) { throw new Error("Storage limit exceeded"); } await addDoc(collection(db, `users/${currentUser.uid}/recordings`), { url, sizeBytes, title: title || `Grabación ${new Date().toLocaleDateString()}`, createdAt: new Date().toISOString() }); };
  const deleteCallRecording = async (recordingId: string, url: string, sizeBytes: number) => { if (!currentUser) return; try { await deleteDoc(doc(db, `users/${currentUser.uid}/recordings`, recordingId)); const storageRef = ref(storage, url); await deleteObject(storageRef); await releaseLimit(currentUser.uid, 'storage', sizeBytes); setToastNotification({ title: "Eliminado", message: "Grabación eliminada permanentemente.", icon: 'trash' }); } catch (e) { console.error("Delete recording failed", e); setToastNotification({ title: "Error", message: "No se pudo eliminar la grabación.", icon: 'close' }); } };

  const toggleSiteStatus = async (siteId: string, isActive: boolean) => {
      if (!isSuperAdmin) return;
      try {
          await updateDoc(doc(db, 'published_sites', siteId), { active: isActive });
          setToastNotification({ title: "Estado Actualizado", message: `Sitio ${isActive ? 'activado' : 'desactivado'}.`, icon: "check" });
      } catch (e) {
          console.error("Error updating site status", e);
          setToastNotification({ title: "Error", message: "No se pudo actualizar.", icon: "close" });
      }
  };

  return (
    <AppContext.Provider value={{
      currentUser, authLoading, theme, setTheme, language, setLanguage, isOnboardingComplete, setOnboardingComplete, isSuperAdmin,
      currentView, setCurrentView, activeHubView, setActiveHubView, projects, addProject, updateProject, deleteProject,
      createTask, updateTask, reorderOrMoveTask, deleteTask, selectedProjectId, setSelectedProjectId, agents, addAgent, updateAgent,
      deleteAgent, agentConversations, deleteAgentConversation, globalChats, setGlobalChats, activeGlobalChatId, setActiveGlobalChatId,
      addNewGlobalChat, updateGlobalChatName, deleteGlobalChat, assignGlobalChatToProject, isNewTaskModalOpen, setNewTaskModalOpen,
      newTaskModalDate, setNewTaskModalDate, isTaskEditModalOpen, setTaskEditModalOpen, editingTask, setEditingTask, isProModalOpen,
      setProModalOpen, proModalMode, setProModalMode, isAiChatOpen, setAiChatOpen, imageToEditUrl, setImageToEditUrl, emailAccounts, fetchEmailAccounts, goatifyNews, areNewsLoading, hasNewNews,
      setHasNewNews, hasNewStudioContent, setHasNewStudioContent, markArticleAsRead, automationSettings, hubPosts, setHubPosts, addHubPost, repostPost, updateHubPost,
      deleteHubPost, likePost, addCommentToPost, updateComment, likeComment, deleteComment, markPostAsRead, applyToJob, sendHubMediaToProject,
      marketplaceListings, setMarketplaceListings, addMarketplaceListing, addJobListing, jobListings: marketplaceListings.filter(l => l.type === 'job'),
      deleteMarketplaceListing, buyItem, hubGroups, setHubGroups, addHubGroup, updateHubGroup, joinGroup, deleteHubGroup, joinedGroupIds: new Set(hubGroups.filter(g => g.members.includes(currentUser?.uid || '')).map(g => g.id)),
      approveGroupMember, denyGroupMember, removeGroupMember, conversations, sendDirectMessage, deleteConversation, 
      totalUnreadMessages: conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
      userProfile, updateUserProfile, viewingProfile, setViewingProfile, sendCircleRequest, acceptCircleRequest, declineCircleRequest,
      allBooks, addBook, updateBook, deleteBook, seedBooks,
      logOut, logInWithEmail, deleteUserAccount, allUsers, mockBooks: MOCK_BOOKS, mockProducts: MOCK_PRODUCTS, intisBalance: intisBalanceState, setIntisBalance: setIntisBalanceState,
      intisTransactions, addIntisTransaction, sendIntis, isAiMuted, setIsAiMuted, inviteUserToProject, acceptProjectInvite, declineProjectInvite,
      checkTaskLimit, checkQueryLimit, checkThinkingQueryLimit, checkMediaLimit, releaseMediaLimit, checkAgentLimit, 
      buyExtraAgent, checkLiveConversationLimit, checkAndConsumeLimit, checkFormLimit, checkWebSearchLimit,
      checkWebProgrammerLimit, checkPresentationLimit, checkProjectLimit, checkSocialPostLimit, checkShivoLimit, checkCrmLimit, checkMeetingLimit,
      startupPrompt, setStartupPrompt, toastNotification, setToastNotification, deepLinkTarget, setDeepLinkTarget,
      webDevSessions, setWebDevSessions, activeWebDevSessionId, setActiveWebDevSessionId, addNewWebDevSession, updateWebDevSession, updateWebDevFile,
      deleteWebDevSession, assignCodeToProject, isSidebarCollapsed, toggleSidebar, activityLog, addActivityLog, collapsedFolderIds,
      toggleFolderCollapse, isDrawingPadFullScreen, setDrawingPadFullScreen, rewardFileUpload, notifications, markNotificationAsRead,
      markNotificationsAsReadByType, markAllNotificationsAsRead, markGroupNotificationsAsRead, markNotificationsReadForSender, deleteNotification,
      deleteAllNotifications, createNotification, aiTaskHistory, startAiTask, deleteAiTask, sendMediaToProject, sendDataUrlToProject,
      sendArticleToProject, sendFormResponsesToProject, deleteProjectChat, removeProjectMember, forms, addForm, updateForm, deleteForm, formResponses, loadFormResponses,
      customStickers, addCustomSticker, deleteCustomSticker, GOATIFY_SERVICES, nextNewsUpdate, isAnalyzing, setIsAnalyzing, trends: [], isNewsRefreshing: false,
      uploadImageToStorage, unreadGroupIds, markGroupPostsAsRead, isLiveSessionActive, setIsLiveSessionActive, cancelGroupJoinRequest,
      userUsage, getAllUsersData, performNuclearDeletion,
      isManualOpen, setIsManualOpen, saveCallRecording, deleteCallRecording,
      notifyAdminsOfNewUser,
      isAgentFullScreen, setIsAgentFullScreen,
      registerLiveSession, disconnectLiveSession,
      forceNewsUpdate,
      announcementToShow, publishAnnouncement, dismissAnnouncement,
      publishedSites, toggleSiteStatus,
      cancelAnnouncement,
      triggerReward,
      removeConnection, blockUser, unblockUser, isUserBlocked,
      addPartnerLead,
      updatePartnerLead,
      allLeads,
      isMeetsInfoOpen, setMeetsInfoOpen,
      isScheduleModalOpen, setScheduleModalOpen,
      liveSessionMode, setLiveSessionMode,
      liveSessionContext, setLiveSessionContext,
      isScreenSharingGlobal, setIsScreenSharingGlobal,
      textSizeLevel, setTextSizeLevel,
      processLoyaltyClaim,
      isFullScreenActive, setIsFullScreenActive,
      getProjectNotes, saveProjectNote, deleteProjectNote,
      mailDraft, setMailDraft,
      mailLists, mailContacts
    }}>
      {children}
    </AppContext.Provider>
  );
};
