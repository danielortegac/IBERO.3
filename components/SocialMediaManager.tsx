
import React, { useState, useContext, useEffect, useMemo } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { AppContext } from '../context/AppContext';
import { db } from '../firebaseConfig';
import Icon from './Icon';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Input from './ui/Input';
import Spinner from './ui/Spinner';
import { generateSocialContent, generateImage } from '../services/geminiService';
import { SocialPost, Note, SocialCampaign } from '../types';
import Card from './ui/Card';
import Modal from './ui/Modal';
import { getPlanConfig } from '../types';
import { consumeServerFeature } from '../services/usageService';

type StudioTab = 'generator' | 'history' | 'calendar' | 'universe' | 'guide';
type CampaignStatus = 'draft' | 'generated' | 'scheduled' | 'ready' | 'published' | 'archived';

type PostWithMedia = SocialPost & { generatedImageUrl?: string };

type ScheduleDraft = {
    post: PostWithMedia;
    campaignId?: string;
    postIndex?: number;
};

const PLATFORM_URLS: Record<string, string> = {
    Instagram: 'https://business.facebook.com/latest/post/composer',
    Facebook: 'https://business.facebook.com/latest/post/composer',
    X: 'https://twitter.com/intent/tweet?text=',
    LinkedIn: 'https://www.linkedin.com/feed/?shareActive=true',
    TikTok: 'https://www.tiktok.com/upload'
};

const NETWORKS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'X'];
const TODAY = new Date();
const isoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const normalizeHashtags = (hashtags?: string | string[]) => {
    if (Array.isArray(hashtags)) return hashtags.join(' ');
    return hashtags || '';
};

const postFullText = (post: SocialPost) => `${post.content || ''}\n\n${normalizeHashtags(post.hashtags)}`.trim();

const statusLabel: Record<string, string> = {
    draft: 'Borrador',
    generated: 'Generada',
    scheduled: 'Programada',
    ready: 'Lista',
    published: 'Publicada',
    archived: 'Archivada'
};

const platformTone: Record<string, string> = {
    Instagram: 'Visual, emocional y directo a DM/comentario.',
    Facebook: 'Conversacional, comunidad, confianza y WhatsApp.',
    TikTok: 'Hook de 3 segundos, ritmo, escena y retención.',
    LinkedIn: 'Autoridad, caso de negocio, aprendizaje y lead.',
    X: 'Breve, filoso, opinable y compartible.'
};

const defaultUniverse = `Hooks que han funcionado:\n- El problema no es la IA, es no tener una oferta clara.\n- Tu contenido no debe verse bonito; debe mover a alguien a actuar.\n\nCTAs favoritos:\n- Comenta QUIERO y te envío la guía.\n- Escríbenos por WhatsApp y te guiamos.\n\nObjeciones frecuentes:\n- No tengo tiempo.\n- No sé usar IA.\n- No sé si esto sirve para mi negocio.\n\nPalabras de marca:\n- práctico, real, automatizado, negocio, contenido, ventas, comunidad.`;

const SocialMediaManager: React.FC = () => {
    const { setToastNotification, addHubPost, uploadImageToStorage, startAiTask, checkSocialPostLimit, checkMediaLimit, projects, updateProject, userProfile, userUsage } = useContext(AppContext);
    const uid = userProfile?.uid || 'local-user';

    const [activeTab, setActiveTab] = useState<StudioTab>('generator');
    const [description, setDescription] = useState('');
    const [objective, setObjective] = useState('');
    const [offer, setOffer] = useState('');
    const [tone, setTone] = useState('Profesional, vendedor, humano y actualizado 2026');
    const [networks, setNetworks] = useState<string[]>(['Instagram', 'Facebook', 'TikTok', 'LinkedIn']);
    const [campaignName, setCampaignName] = useState('');
    const [audience, setAudience] = useState('');
    const [industry, setIndustry] = useState('Negocios, educación, marketing y servicios profesionales');
    const [campaignMode, setCampaignMode] = useState('Campaña orgánica + venta suave');
    const [campaignLength, setCampaignLength] = useState('7 días');
    const [budget, setBudget] = useState('Sin presupuesto definido');
    const [brandVoice, setBrandVoice] = useState('Claro, elegante, práctico, vendedor, con energía moderna y cero relleno.');
    const [contentUniverse, setContentUniverse] = useState(defaultUniverse);

    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<PostWithMedia[]>([]);
    const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
    const [isImageGenerating, setIsImageGenerating] = useState<number | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<SocialCampaign | null>(null);

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [postToSave, setPostToSave] = useState<PostWithMedia | null>(null);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

    const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
    const [scheduleDate, setScheduleDate] = useState(isoDate(TODAY));
    const [scheduleTime, setScheduleTime] = useState('19:00');
    const [reminderMinutes, setReminderMinutes] = useState('30');
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(isoDate(TODAY));

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).social_posts_monthly || 30;
    const used = userUsage?.counters?.monthly_posts_used || 0;
    const localStorageKey = `goatify_social_campaigns_${uid}`;
    const universeKey = `goatify_social_universe_${uid}`;

    useEffect(() => {
        const savedUniverse = localStorage.getItem(universeKey);
        if (savedUniverse) setContentUniverse(savedUniverse);
    }, [universeKey]);

    useEffect(() => {
        localStorage.setItem(universeKey, contentUniverse);
    }, [contentUniverse, universeKey]);

    useEffect(() => {
        const cached = localStorage.getItem(localStorageKey);
        if (cached) {
            try { setCampaigns(JSON.parse(cached)); } catch { /* cache inválido */ }
        }
        if (!uid || uid === 'local-user') return;
        const q = query(collection(db, 'users', uid, 'socialCampaigns'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as SocialCampaign));
            setCampaigns(remote);
            localStorage.setItem(localStorageKey, JSON.stringify(remote));
        }, (error) => {
            console.warn('[Social Media Studio] Firestore no disponible, usando caché local:', error);
        });
        return () => unsub();
    }, [uid, localStorageKey]);

    const calendarPosts = useMemo(() => {
        return campaigns.flatMap(campaign => (campaign.posts || [])
            .filter(post => post.scheduledAt)
            .map(post => ({ campaign, post }))
        ).sort((a, b) => String(a.post.scheduledAt).localeCompare(String(b.post.scheduledAt)));
    }, [campaigns]);

    const todayPosts = useMemo(() => {
        const today = isoDate(new Date());
        return calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(today));
    }, [calendarPosts]);

    const selectedDayPosts = useMemo(() => {
        return calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(selectedCalendarDate));
    }, [calendarPosts, selectedCalendarDate]);

    const calendarGridDays = useMemo(() => {
        const [year, month] = selectedCalendarDate.split('-').map(Number);
        const base = new Date(year || TODAY.getFullYear(), (month || TODAY.getMonth() + 1) - 1, 1);
        const start = new Date(base);
        start.setDate(base.getDate() - base.getDay());
        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [selectedCalendarDate]);

    const socialWeekDays = useMemo(() => ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], []);

    const calendarMonthLabel = useMemo(() => {
        const [year, month] = selectedCalendarDate.split('-').map(Number);
        return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(year || TODAY.getFullYear(), (month || TODAY.getMonth() + 1) - 1, 1));
    }, [selectedCalendarDate]);

    const saveCampaign = async (campaign: SocialCampaign) => {
        const normalized = [campaign, ...campaigns.filter(c => c.id !== campaign.id)];
        setCampaigns(normalized);
        localStorage.setItem(localStorageKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') {
            await setDoc(doc(db, 'users', uid, 'socialCampaigns', campaign.id), campaign, { merge: true });
        }
    };

    const updateCampaign = async (campaignId: string, patch: Partial<SocialCampaign>) => {
        const existing = campaigns.find(c => c.id === campaignId);
        if (!existing) return;
        const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as SocialCampaign;
        const normalized = campaigns.map(c => c.id === campaignId ? updated : c);
        setCampaigns(normalized);
        localStorage.setItem(localStorageKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') {
            await updateDoc(doc(db, 'users', uid, 'socialCampaigns', campaignId), { ...patch, updatedAt: updated.updatedAt });
        }
    };


    const syncGlobalSocialCalendar = async (campaignId: string, post: SocialPost) => {
        if (!uid || uid === 'local-user' || !post.scheduledAt) return;
        const itemId = `${campaignId}_${post.id || post.platform}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const campaign = campaigns.find(c => c.id === campaignId);
        await setDoc(doc(db, 'users', uid, 'socialCalendar', itemId), {
            id: itemId,
            type: 'social_post',
            source: 'social_media_studio',
            campaignId,
            postId: post.id || itemId,
            platform: post.platform,
            title: `${post.platform} · ${campaign?.name || campaignName || 'Campaña social'}`,
            copy: post.content || '',
            hashtags: post.hashtags || '',
            scheduledAt: post.scheduledAt,
            reminderMinutes: post.reminderMinutes || 30,
            status: post.status || 'scheduled',
            updatedAt: new Date().toISOString()
        }, { merge: true });
    };

    const toggleNetwork = (net: string) => {
        setNetworks(prev => prev.includes(net) ? prev.filter(n => n !== net) : [...prev, net]);
    };

    const handleGenerate = async () => {
        if (!description || !objective || networks.length === 0) {
            alert('Completa idea, objetivo y al menos una red.');
            return;
        }
        const expectedPosts = Math.max(1, networks.length);
        const isBlocked = await checkSocialPostLimit(expectedPosts);
        if (isBlocked) return;
        setIsGenerating(true);
        setResults([]);
        try {
            const posts = await generateSocialContent({
                description,
                objective,
                offer,
                tone,
                networks,
                audience,
                industry,
                campaignMode,
                campaignLength,
                budget,
                brandVoice,
                contentUniverse
            } as any);
            if (posts && Array.isArray(posts) && posts.length > 0) {
                const createdAt = new Date().toISOString();
                const campaignId = `social-${Date.now()}`;
                const normalizedPosts: PostWithMedia[] = posts.map((post: SocialPost, index: number) => ({
                    ...post,
                    id: post.id || `${campaignId}-post-${index + 1}`,
                    campaignId,
                    status: 'generated',
                    createdAt,
                    platform: post.platform || networks[index % networks.length],
                    hashtags: post.hashtags || '',
                    qualityScore: post.qualityScore || 88
                }));
                await consumeServerFeature('social_post', normalizedPosts.length, {
                    module: 'social_media_studio',
                    action: 'generate_campaign',
                    campaignMode,
                    networks,
                    campaignName: campaignName || objective
                });
                const campaign: SocialCampaign = {
                    id: campaignId,
                    ownerId: uid,
                    name: campaignName || `Campaña ${objective.slice(0, 36) || 'Social'} - ${new Date().toLocaleDateString()}`,
                    description,
                    objective,
                    offer,
                    tone,
                    networks,
                    audience,
                    industry,
                    campaignMode,
                    campaignLength,
                    budget,
                    brandVoice,
                    contentUniverse,
                    status: 'generated' as CampaignStatus,
                    createdAt,
                    updatedAt: createdAt,
                    posts: normalizedPosts,
                    creditsNote: `Generación registrada: ${normalizedPosts.length} post${normalizedPosts.length === 1 ? '' : 's'} social${normalizedPosts.length === 1 ? '' : 'es'}. Las imágenes y medios consumen cupo de media aparte.`
                };
                await saveCampaign(campaign);
                setCurrentCampaignId(campaignId);
                setResults(normalizedPosts);
                setSelectedCampaign(campaign);
                setToastNotification({ title: 'Campaña creada', message: 'Se guardó en tu memoria de Social Media Studio.', icon: 'check' });
            } else {
                setToastNotification({ title: 'Error', message: 'La IA no generó contenido válido. Intenta de nuevo.', icon: 'close' });
            }
        } catch (e) {
            console.error(e);
            setToastNotification({ title: 'Error', message: 'Falló la generación social.', icon: 'close' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateImage = async (prompt: string, index: number) => {
        if (!prompt) return;
        const isBlocked = await checkMediaLimit('image');
        if (isBlocked) return;
        setIsImageGenerating(index);
        try {
            const base64 = await generateImage(prompt, '1:1');
            const url = await uploadImageToStorage(base64);
            await startAiTask({
                type: 'image',
                prompt,
                status: 'completed',
                resultUrl: url,
                aspectRatio: '1:1'
            });
            const updatedResults = results.map((p, i) => i === index ? { ...p, generatedImageUrl: url } : p);
            setResults(updatedResults);
            if (currentCampaignId) await updateCampaign(currentCampaignId, { posts: updatedResults as SocialPost[] });
            setToastNotification({ title: 'Imagen lista', message: 'Imagen generada y guardada en galería.', icon: 'image' });
        } catch (e) {
            console.error(e);
            setToastNotification({ title: 'Error', message: 'No se pudo generar la imagen.', icon: 'close' });
        } finally {
            setIsImageGenerating(null);
        }
    };

    const copyToClipboard = async (text: string, message = 'Copiado al portapapeles') => {
        await navigator.clipboard.writeText(text);
        setToastNotification({ title: 'Copiado', message, icon: 'copy' });
    };

    const getPublishUrl = (post: SocialPost) => {
        const platform = post.platform || '';
        if (platform === 'X') return `${PLATFORM_URLS.X}${encodeURIComponent(postFullText(post))}`;
        if (platform === 'LinkedIn') return PLATFORM_URLS.LinkedIn;
        if (platform === 'TikTok') return PLATFORM_URLS.TikTok;
        return PLATFORM_URLS.Instagram;
    };

    const handleAssistedPublish = async (post: PostWithMedia, campaignId?: string) => {
        await copyToClipboard(postFullText(post), `Copy listo. Se abrirá ${post.platform}.`);
        window.open(getPublishUrl(post), '_blank', 'noopener,noreferrer');
        if (campaignId) {
            const campaign = campaigns.find(c => c.id === campaignId);
            if (campaign) {
                const posts = campaign.posts.map(p => p.id === post.id ? { ...p, status: 'ready', lastPublishActionAt: new Date().toISOString() } : p);
                await updateCampaign(campaignId, { posts, status: 'ready' });
            }
        }
    };

    const handleSaveToHub = (post: PostWithMedia) => {
        const content = `🚀 **Campaña Social: ${post.platform}**\n\n${post.content}\n\n${normalizeHashtags(post.hashtags)}`;
        const media = post.generatedImageUrl ? { url: post.generatedImageUrl, type: 'image', name: 'campaign.png', originalType: 'image/png' } : undefined;
        addHubPost(content, undefined, media);
        setToastNotification({ title: 'Guardado', message: 'Posteado en el Hub.', icon: 'check' });
    };

    const openSaveModal = (post: PostWithMedia) => {
        setPostToSave(post);
        setIsSaveModalOpen(true);
    };

    const handleSaveToProject = async () => {
        if (!postToSave || !targetProjectId) return;
        const project = projects.find(p => p.id === targetProjectId);
        if (!project) return;
        const noteContent = `### 📱 Post para ${postToSave.platform}\n\n${postToSave.content}\n\n**Hashtags:** ${normalizeHashtags(postToSave.hashtags)}\n\n**Hook:** ${postToSave.hook || ''}\n\n**CTA:** ${postToSave.cta || ''}\n\n**Prompt visual:** ${postToSave.imagePrompt || postToSave.photoPrompt || ''}\n\n**Guion video:** ${postToSave.videoBrief || ''}\n\n${postToSave.generatedImageUrl ? `![Imagen](${postToSave.generatedImageUrl})` : ''}`;
        const newNote: Note = {
            id: `note-${Date.now()}`,
            title: `Post: ${postToSave.platform} (${new Date().toLocaleDateString()})`,
            content: noteContent,
            createdAt: new Date().toISOString()
        };
        await updateProject(project.id, { notes: [newNote, ...project.notes] });
        setToastNotification({ title: 'Guardado', message: 'Guardado como nota en el proyecto.', icon: 'check' });
        setIsSaveModalOpen(false);
        setPostToSave(null);
    };

    const openScheduleModal = (post: PostWithMedia, campaignId?: string, postIndex?: number) => {
        setScheduleDraft({ post, campaignId, postIndex });
        setScheduleDate(post.scheduledAt ? String(post.scheduledAt).slice(0, 10) : isoDate(TODAY));
        setScheduleTime(post.scheduledAt ? String(post.scheduledAt).slice(11, 16) : '19:00');
        setReminderMinutes(String(post.reminderMinutes || 30));
    };

    const saveSchedule = async () => {
        if (!scheduleDraft) return;
        const scheduledAt = `${scheduleDate}T${scheduleTime}:00`;
        const updatedPost: SocialPost = { ...scheduleDraft.post, scheduledAt, reminderMinutes: Number(reminderMinutes), status: 'scheduled' };

        if (scheduleDraft.campaignId) {
            const campaign = campaigns.find(c => c.id === scheduleDraft.campaignId);
            if (campaign) {
                const posts = campaign.posts.map(p => p.id === updatedPost.id ? updatedPost : p);
                await updateCampaign(scheduleDraft.campaignId, { posts, status: 'scheduled' });
                await syncGlobalSocialCalendar(scheduleDraft.campaignId, updatedPost);
                await syncGlobalSocialCalendar(scheduleDraft.campaignId, updatedPost);
            }
        }
        if (currentCampaignId === scheduleDraft.campaignId || (!scheduleDraft.campaignId && typeof scheduleDraft.postIndex === 'number')) {
            setResults(prev => prev.map((p, index) => p.id === updatedPost.id || index === scheduleDraft.postIndex ? { ...p, ...updatedPost } : p));
        }
        setSelectedCalendarDate(scheduleDate);
        setScheduleDraft(null);
        setToastNotification({ title: 'Calendarizado', message: 'El post quedó con fecha, hora y recordatorio.', icon: 'calendar' });
    };

    const moveScheduledPost = async (campaignId: string, postId: string, newDate: string) => {
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return;
        const targetPost = campaign.posts.find(p => p.id === postId);
        if (!targetPost) return;

        const previousTime = targetPost.scheduledAt ? String(targetPost.scheduledAt).slice(11, 16) : '19:00';
        const scheduledAt = `${newDate}T${previousTime || '19:00'}:00`;
        const posts = campaign.posts.map(p => p.id === postId ? { ...p, scheduledAt, status: 'scheduled' as const } : p);
        await updateCampaign(campaignId, { posts, status: 'scheduled' });
        await syncGlobalSocialCalendar(campaignId, { ...targetPost, scheduledAt, status: 'scheduled' as const });

        if (currentCampaignId === campaignId) {
            setResults(prev => prev.map(p => p.id === postId ? { ...p, scheduledAt, status: 'scheduled' } : p));
        }
        setSelectedCalendarDate(newDate);
        setToastNotification({ title: 'Post movido', message: `Nueva fecha: ${newDate}. La hora se conservó.`, icon: 'calendar' });
    };

    const handleSocialDragStart = (e: React.DragEvent<HTMLDivElement>, campaignId: string, postId?: string) => {
        if (!postId) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('socialCampaignId', campaignId);
        e.dataTransfer.setData('socialPostId', postId);
    };

    const handleSocialDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleSocialDrop = async (e: React.DragEvent<HTMLDivElement>, newDate: string) => {
        e.preventDefault();
        e.stopPropagation();
        const campaignId = e.dataTransfer.getData('socialCampaignId');
        const postId = e.dataTransfer.getData('socialPostId');
        if (!campaignId || !postId) return;
        await moveScheduledPost(campaignId, postId, newDate);
    };

    const markPublished = async (campaignId: string, post: SocialPost) => {
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return;
        const posts = campaign.posts.map(p => p.id === post.id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p);
        await updateCampaign(campaignId, { posts, status: 'published' });
        setToastNotification({ title: 'Marcado', message: 'Post marcado como publicado.', icon: 'check' });
    };

    const archiveCampaign = async (campaignId: string) => {
        await updateCampaign(campaignId, { status: 'archived' as CampaignStatus });
        setToastNotification({ title: 'Archivada', message: 'La campaña no se borró; quedó archivada.', icon: 'folder' });
    };

    const deleteCampaign = async (campaignId: string) => {
        if (!confirm('¿Eliminar definitivamente esta campaña? Esta acción sí borra el registro.')) return;
        const normalized = campaigns.filter(c => c.id !== campaignId);
        setCampaigns(normalized);
        localStorage.setItem(localStorageKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') await deleteDoc(doc(db, 'users', uid, 'socialCampaigns', campaignId));
        setToastNotification({ title: 'Eliminada', message: 'Campaña eliminada definitivamente.', icon: 'trash' });
    };

    const loadCampaign = (campaign: SocialCampaign) => {
        setSelectedCampaign(campaign);
        setCurrentCampaignId(campaign.id);
        setResults((campaign.posts || []) as PostWithMedia[]);
        setDescription(campaign.description || '');
        setObjective(campaign.objective || '');
        setOffer(campaign.offer || '');
        setTone(campaign.tone || tone);
        setNetworks(campaign.networks || networks);
        setCampaignName(campaign.name || '');
        setAudience(campaign.audience || '');
        setIndustry(campaign.industry || industry);
        setCampaignMode(campaign.campaignMode || campaignMode);
        setCampaignLength(campaign.campaignLength || campaignLength);
        setBudget(campaign.budget || budget);
        setBrandVoice(campaign.brandVoice || brandVoice);
        setContentUniverse(campaign.contentUniverse || contentUniverse);
        setActiveTab('generator');
        setToastNotification({ title: 'Campaña cargada', message: 'Puedes editar, publicar o calendarizar.', icon: 'check' });
    };

    const duplicateCampaign = async (campaign: SocialCampaign) => {
        const now = new Date().toISOString();
        const id = `social-${Date.now()}`;
        const copy: SocialCampaign = {
            ...campaign,
            id,
            name: `${campaign.name} - copia`,
            createdAt: now,
            updatedAt: now,
            status: 'draft',
            posts: (campaign.posts || []).map((post, index) => ({ ...post, id: `${id}-post-${index + 1}`, campaignId: id, status: 'generated' }))
        };
        await saveCampaign(copy);
        loadCampaign(copy);
    };

    const exportCampaign = (campaign: SocialCampaign) => {
        const payload = JSON.stringify(campaign, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderScore = (post: SocialPost) => {
        const score = typeof post.qualityScore === 'number' ? post.qualityScore : 88;
        return <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-[10px] font-black">Score {score}/100</span>;
    };

    const renderPostPreview = (post: PostWithMedia) => {
        const hashtags = normalizeHashtags(post.hashtags);
        return (
            <div className="rounded-[2rem] border-8 border-neutral-900 dark:border-neutral-700 bg-white dark:bg-neutral-950 shadow-xl overflow-hidden max-w-sm mx-auto">
                <div className="h-7 bg-neutral-900 dark:bg-neutral-800 flex items-center justify-center"><div className="w-16 h-1 bg-neutral-600 rounded-full" /></div>
                <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-primary to-purple-600 flex items-center justify-center text-white font-black">G</div>
                        <div>
                            <p className="text-sm font-black text-neutral-900 dark:text-white">{campaignName || 'Tu marca'}</p>
                            <p className="text-[10px] text-neutral-500">{post.platform} · vista previa</p>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 h-40 flex items-center justify-center text-center p-4 mb-4">
                        {post.generatedImageUrl ? <img src={post.generatedImageUrl} alt="preview" className="w-full h-full object-cover rounded-xl" /> : <p className="text-xs font-bold text-neutral-500">{post.photoPrompt || post.imagePrompt || 'Prompt visual listo para generar imagen.'}</p>}
                    </div>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap text-neutral-800 dark:text-neutral-200 line-clamp-6">{post.content}</p>
                    <p className="text-[10px] text-brand-primary font-bold mt-2 line-clamp-2">{hashtags}</p>
                    <div className="flex justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-[10px] font-bold text-neutral-500">
                        <span>♡ Like</span><span>💬 Comentar</span><span>↗ Compartir</span>
                    </div>
                </div>
            </div>
        );
    };

    const renderPostCard = (post: PostWithMedia, idx: number, campaignId?: string) => (
        <Card key={post.id || `${post.platform}-${idx}`} className="p-6 border border-neutral-200 dark:border-neutral-800 relative overflow-hidden bg-white dark:bg-dark-surface transition-all hover:shadow-xl">
            <div className="absolute top-0 right-0 bg-brand-primary text-white text-[10px] font-bold px-4 py-1.5 rounded-bl-xl uppercase">{post.platform}</div>
            <div className="flex flex-wrap items-center gap-2 mb-4 pr-24">
                {renderScore(post)}
                <span className="px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-[10px] font-bold uppercase">{post.format || 'Post'}</span>
                <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 text-[10px] font-bold uppercase">{statusLabel[String(post.status || 'generated')] || 'Generada'}</span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <div className="xl:col-span-3 space-y-5">
                    {post.hook && <div className="bg-pink-50 dark:bg-pink-900/10 p-4 rounded-2xl border border-pink-100 dark:border-pink-900/30"><p className="text-[10px] font-black uppercase text-pink-600 mb-1">Hook</p><p className="text-sm font-bold text-neutral-900 dark:text-white">{post.hook}</p></div>}
                    <div>
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1 block">Copy final</label>
                        <div className="bg-neutral-50 dark:bg-neutral-900 p-5 rounded-2xl text-sm whitespace-pre-wrap font-medium leading-relaxed border border-neutral-100 dark:border-neutral-800">
                            {post.content}
                            <div className="mt-3 text-brand-primary font-bold text-xs">{normalizeHashtags(post.hashtags)}</div>
                        </div>
                    </div>
                    {post.cta && <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30"><p className="text-[10px] font-black uppercase text-emerald-600 mb-1">CTA</p><p className="text-sm text-emerald-800 dark:text-emerald-200 font-bold">{post.cta}</p></div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-2xl border border-orange-100 dark:border-orange-900/30">
                            <p className="text-[10px] font-black uppercase text-orange-600 mb-2">Prompt foto pro</p>
                            <p className="text-xs text-orange-900 dark:text-orange-200 italic line-clamp-5">{post.photoPrompt || post.imagePrompt || 'No generado.'}</p>
                            <div className="mt-3 flex gap-2 flex-wrap">
                                <Button size="sm" variant="secondary" onClick={() => copyToClipboard(post.photoPrompt || post.imagePrompt || '')}><Icon name="copy" className="w-4 h-4"/> Prompt</Button>
                                <Button size="sm" variant="secondary" onClick={() => handleGenerateImage(post.photoPrompt || post.imagePrompt || '', idx)} disabled={isImageGenerating === idx}>{isImageGenerating === idx ? <Spinner /> : <><Icon name="image" className="w-4 h-4"/> Generar</>}</Button>
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                            <p className="text-[10px] font-black uppercase text-blue-600 mb-2">Blueprint video</p>
                            <p className="text-xs text-blue-900 dark:text-blue-200 line-clamp-5">{post.videoBrief || post.videoPrompt || post.visualCues || 'Hook, escenas, texto en pantalla y CTA se generan aquí.'}</p>
                            {post.shotList && post.shotList.length > 0 && <ul className="mt-2 space-y-1 text-[11px] text-blue-800 dark:text-blue-200">{post.shotList.slice(0, 4).map((shot, i) => <li key={i}>• {shot}</li>)}</ul>}
                        </div>
                    </div>

                    {(post.adBrief || post.targetingSuggestion || post.publishingChecklist) && (
                        <div className="bg-violet-50 dark:bg-violet-900/10 p-4 rounded-2xl border border-violet-100 dark:border-violet-900/30">
                            <p className="text-[10px] font-black uppercase text-violet-600 mb-2">Pauta / Meta Business</p>
                            <p className="text-xs text-violet-900 dark:text-violet-200 whitespace-pre-wrap">{post.adBrief || post.targetingSuggestion || post.publishingChecklist}</p>
                        </div>
                    )}

                    {post.abVariants && post.abVariants.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {post.abVariants.slice(0, 4).map((variant, i) => <div key={i} className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 text-xs"><span className="font-black text-brand-primary">Variante {String.fromCharCode(65 + i)}:</span> {variant}</div>)}
                        </div>
                    )}
                </div>
                <div className="xl:col-span-2">{renderPostPreview(post)}</div>
            </div>

            <div className="flex gap-2 pt-6 mt-6 border-t border-neutral-100 dark:border-neutral-800 flex-wrap">
                <Button size="sm" onClick={() => handleAssistedPublish(post, campaignId)} className="bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90"><Icon name="externalLink" className="w-4 h-4"/> Publicar en {post.platform === 'Instagram' || post.platform === 'Facebook' ? 'Meta Business Suite' : post.platform}</Button>
                <Button size="sm" variant="secondary" onClick={() => openScheduleModal(post, campaignId, idx)}><Icon name="calendar" className="w-4 h-4"/> Calendarizar</Button>
                <Button size="sm" variant="secondary" onClick={() => copyToClipboard(postFullText(post))}><Icon name="copy" className="w-4 h-4"/> Copy</Button>
                <Button size="sm" variant="secondary" onClick={() => handleSaveToHub(post)}>Hub</Button>
                <Button size="sm" variant="secondary" onClick={() => openSaveModal(post)}>Proyecto</Button>
                {campaignId && <Button size="sm" variant="ghost" onClick={() => markPublished(campaignId, post)}><Icon name="check" className="w-4 h-4"/> Publicado</Button>}
            </div>
        </Card>
    );

    return (
        <div className="p-4 sm:p-6 h-full overflow-y-auto animate-fade-in bg-neutral-100 dark:bg-black pb-32">
            <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} title="Guardar en Proyecto">
                <div className="space-y-4">
                    <p className="text-sm">Selecciona un proyecto para guardar este post como una nota completa:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsSaveModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveToProject}>Guardar</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={!!scheduleDraft} onClose={() => setScheduleDraft(null)} title="Programar publicación">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Guarda fecha, hora y recordatorio. Luego puedes copiar y abrir la plataforma correcta desde el calendario.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                        <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                    </div>
                    <select value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1 text-sm">
                        <option value="10">Recordar 10 min antes</option>
                        <option value="30">Recordar 30 min antes</option>
                        <option value="60">Recordar 1 hora antes</option>
                        <option value="1440">Recordar 1 día antes</option>
                    </select>
                    <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-3 text-xs text-neutral-600 dark:text-neutral-300">
                        Para notificaciones push en celular, el usuario debe tener permisos activos. En iPhone conviene instalar Goatify como PWA en pantalla de inicio.
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setScheduleDraft(null)}>Cancelar</Button>
                        <Button onClick={saveSchedule}>Guardar calendario</Button>
                    </div>
                </div>
            </Modal>

            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
                    <div>
                        <button onClick={() => window.history.back()} className="text-xs font-black uppercase tracking-widest text-neutral-400 hover:text-brand-primary mb-2 flex items-center gap-1">← Volver al último lugar</button>
                        <h1 className="text-4xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-violet-600 to-blue-500">Social Media Studio</h1>
                        <p className="text-neutral-500 max-w-3xl">Ecosistema para crear campañas, posts, prompts visuales, guiones de video, pautas, calendario, recordatorios y publicación asistida.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{campaigns.length}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Campañas</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{calendarPosts.length}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Agendados</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{used}/{limit}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Cupo</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">2026</p><p className="text-[10px] uppercase font-bold text-neutral-500">Playbook</p></div>
                    </div>
                </div>

                {todayPosts.length > 0 && (
                    <div className="mb-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-3xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-3"><Icon name="bell" className="w-6 h-6 text-amber-600"/><div><p className="font-black text-neutral-900 dark:text-white">Tienes {todayPosts.length} publicación(es) para hoy</p><p className="text-xs text-neutral-500">Copia, abre la plataforma y marca como publicado.</p></div></div>
                        <Button size="sm" variant="secondary" onClick={() => { setActiveTab('calendar'); setSelectedCalendarDate(isoDate(new Date())); }}>Ver calendario</Button>
                    </div>
                )}

                <div className="flex gap-2 overflow-x-auto pb-3 mb-6">
                    {[['generator', 'Generador'], ['history', 'Campañas guardadas'], ['calendar', 'Calendario'], ['universe', 'Universo de Contenido'], ['guide', 'Guía / Meta Business']].map(([id, label]) => (
                        <button key={id} onClick={() => setActiveTab(id as StudioTab)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap border ${activeTab === id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-dark-surface border-neutral-200 dark:border-neutral-800 text-neutral-500'}`}>{label}</button>
                    ))}
                </div>

                {activeTab === 'generator' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-4 space-y-5 bg-white dark:bg-dark-surface p-6 rounded-3xl shadow-xl border border-neutral-200 dark:border-neutral-800 h-fit lg:sticky lg:top-4">
                            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/10 flex justify-between items-center">
                                <div><p className="text-[10px] font-black uppercase text-brand-primary tracking-widest">Cupo mensual</p><p className="text-sm font-bold text-neutral-800 dark:text-white">{used} de {limit} posts</p></div>
                                <Icon name="share" className="w-6 h-6 text-brand-primary"/>
                            </div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nombre de campaña</label><Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ej: Lanzamiento Certificación IA"/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Idea / contexto</label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Qué vendes, qué problema resuelves, qué debe entender la audiencia..." rows={4}/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Objetivo</label><Input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Vender, generar leads, agendar, crecer comunidad..."/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Oferta / CTA</label><Input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Precio, bono, link, WhatsApp, clase gratis..."/></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Audiencia</label><Input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Emprendedores, docentes..."/></div><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Industria</label><Input value={industry} onChange={e => setIndustry(e.target.value)} /></div></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Modo campaña</label><select value={campaignMode} onChange={e => setCampaignMode(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm"><option>Campaña orgánica + venta suave</option><option>Lanzamiento con urgencia</option><option>Pauta Meta Ads / Facebook Ads</option><option>Contenido educativo de autoridad</option><option>Reactivación de clientes</option><option>Campaña de comunidad</option></select></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Duración</label><select value={campaignLength} onChange={e => setCampaignLength(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm"><option>Post rápido</option><option>7 días</option><option>14 días</option><option>30 días</option></select></div><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Presupuesto pauta</label><Input value={budget} onChange={e => setBudget(e.target.value)} placeholder="$5/día, $100 total..."/></div></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Brand Voice</label><Textarea value={brandVoice} onChange={e => setBrandVoice(e.target.value)} rows={2}/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Redes</label><div className="flex flex-wrap gap-2">{NETWORKS.map(net => (<button key={net} onClick={() => toggleNetwork(net)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${networks.includes(net) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-700'}`}>{net}</button>))}</div></div>
                            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full py-4 shadow-xl bg-gradient-to-r from-brand-primary to-purple-600 text-white">{isGenerating ? <Spinner text="Creando campaña..." className="text-white font-bold text-lg" /> : <><Icon name="ai" className="w-6 h-6"/> Generar campaña pro</>}</Button>
                        </div>

                        <div className="lg:col-span-8 space-y-6">
                            {results.length === 0 && !isGenerating && (
                                <div className="text-center py-16 bg-white dark:bg-dark-surface rounded-3xl border border-dashed border-neutral-300 dark:border-neutral-700">
                                    <Icon name="share" className="w-16 h-16 mx-auto mb-4 text-neutral-300"/>
                                    <h3 className="text-xl font-black mb-2">Tu campaña aparecerá aquí</h3>
                                    <p className="text-neutral-500 max-w-xl mx-auto">Genera posts por red, prompts de foto, guiones de video, pauta, calendario sugerido y botones para publicar asistido.</p>
                                </div>
                            )}
                            {results.map((post, idx) => renderPostCard(post, idx, currentCampaignId || undefined))}
                        </div>
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-4">
                        {campaigns.length === 0 && <Card className="p-8 text-center text-neutral-500">Todavía no hay campañas guardadas.</Card>}
                        {campaigns.map(campaign => (
                            <Card key={campaign.id} className="p-5 border border-neutral-200 dark:border-neutral-800">
                                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                                    <div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-black text-neutral-900 dark:text-white">{campaign.name}</h3><span className="px-2 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-black uppercase">{statusLabel[String(campaign.status)] || campaign.status}</span></div><p className="text-xs text-neutral-500 mt-1">{new Date(campaign.createdAt).toLocaleString()} · {campaign.networks?.join(', ')} · {campaign.posts?.length || 0} posts</p><p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 line-clamp-2">{campaign.objective}</p></div>
                                    <div className="flex gap-2 flex-wrap"><Button size="sm" onClick={() => loadCampaign(campaign)}>Abrir</Button><Button size="sm" variant="secondary" onClick={() => duplicateCampaign(campaign)}>Duplicar</Button><Button size="sm" variant="secondary" onClick={() => exportCampaign(campaign)}>Exportar</Button><Button size="sm" variant="secondary" onClick={() => archiveCampaign(campaign.id)}>Archivar</Button><Button size="sm" variant="ghost" onClick={() => deleteCampaign(campaign.id)}><Icon name="trash" className="w-4 h-4"/></Button></div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {activeTab === 'calendar' && (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                        <Card className="p-5 border border-neutral-200 dark:border-neutral-800 xl:col-span-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                                <div>
                                    <h3 className="font-black text-xl flex items-center gap-2 capitalize"><Icon name="calendar" className="w-5 h-5"/> {calendarMonthLabel}</h3>
                                    <p className="text-xs text-neutral-500 mt-1">Arrastra cualquier post agendado a otro día. Goatify actualiza la fecha y conserva la hora.</p>
                                </div>
                                <Input type="date" value={selectedCalendarDate} onChange={e => setSelectedCalendarDate(e.target.value)} className="sm:max-w-[180px]" />
                            </div>
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {socialWeekDays.map(day => <div key={day} className="text-center text-[10px] font-black uppercase text-neutral-400 py-1">{day}</div>)}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {calendarGridDays.map(day => {
                                    const dateStr = isoDate(day);
                                    const [selectedYear, selectedMonth] = selectedCalendarDate.split('-').map(Number);
                                    const isCurrentMonth = day.getFullYear() === selectedYear && day.getMonth() === (selectedMonth - 1);
                                    const isSelected = dateStr === selectedCalendarDate;
                                    const isToday = dateStr === isoDate(new Date());
                                    const items = calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(dateStr));
                                    return (
                                        <div
                                            key={dateStr}
                                            onDragOver={handleSocialDragOver}
                                            onDrop={(e) => handleSocialDrop(e, dateStr)}
                                            onClick={() => setSelectedCalendarDate(dateStr)}
                                            className={`min-h-[108px] rounded-2xl border p-2 transition-all cursor-pointer ${isSelected ? 'border-brand-primary ring-2 ring-brand-primary/20 bg-brand-primary/5' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950'} ${!isCurrentMonth ? 'opacity-50' : ''}`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className={`text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-brand-primary text-white' : 'text-neutral-500'}`}>{day.getDate()}</span>
                                                {items.length > 0 && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{items.length}</span>}
                                            </div>
                                            <div className="space-y-1 max-h-[72px] overflow-y-auto custom-scrollbar">
                                                {items.slice(0, 3).map(({ campaign, post }) => (
                                                    <div
                                                        key={`${campaign.id}-${post.id}`}
                                                        draggable
                                                        onDragStart={(e) => handleSocialDragStart(e, campaign.id, post.id)}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedCalendarDate(dateStr); }}
                                                        className="rounded-lg px-2 py-1 bg-gradient-to-r from-brand-primary to-purple-600 text-white shadow-sm cursor-grab active:cursor-grabbing"
                                                        title="Arrastra para mover este post"
                                                    >
                                                        <p className="text-[9px] font-black truncate">{String(post.scheduledAt).slice(11, 16)} · {post.platform}</p>
                                                        <p className="text-[9px] opacity-90 truncate">{campaign.name}</p>
                                                    </div>
                                                ))}
                                                {items.length > 3 && <p className="text-[9px] font-bold text-neutral-400 px-1">+{items.length - 3} más</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <div className="space-y-4">
                            <Card className="p-5 border border-neutral-200 dark:border-neutral-800">
                                <h3 className="font-black mb-3 flex items-center gap-2"><Icon name="bell" className="w-5 h-5"/> Próximos posts</h3>
                                <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar">
                                    {calendarPosts.length === 0 && <p className="text-sm text-neutral-500">Todavía no hay posts calendarizados.</p>}
                                    {calendarPosts.slice(0, 12).map(item => (
                                        <div
                                            key={`${item.campaign.id}-${item.post.id}-side`}
                                            draggable
                                            onDragStart={(e) => handleSocialDragStart(e, item.campaign.id, item.post.id)}
                                            onClick={() => setSelectedCalendarDate(String(item.post.scheduledAt).slice(0, 10))}
                                            className="w-full text-left p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 cursor-grab active:cursor-grabbing"
                                        >
                                            <p className="text-xs font-black">{String(item.post.scheduledAt).replace('T', ' ').slice(0, 16)} · {item.post.platform}</p>
                                            <p className="text-[11px] text-neutral-500 line-clamp-1">{item.campaign.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                            <Card className="p-5 border border-neutral-200 dark:border-neutral-800 bg-brand-primary/5">
                                <h4 className="font-black mb-2">Modo móvil</h4>
                                <p className="text-xs text-neutral-500">En celular algunos navegadores limitan drag & drop. Para mover un post desde móvil usa “Calendarizar” y cambia la fecha manualmente.</p>
                            </Card>
                        </div>

                        <div className="xl:col-span-4 space-y-4">
                            <h3 className="font-black text-lg">Publicaciones del {selectedCalendarDate}</h3>
                            {selectedDayPosts.length === 0 && <Card className="p-8 text-center text-neutral-500">No hay posts para este día. Puedes arrastrar uno desde otro día o calendarizar un post generado.</Card>}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {selectedDayPosts.map(({ campaign, post }, idx) => (
                                    <div key={`${campaign.id}-${post.id}-detail`} draggable onDragStart={(e) => handleSocialDragStart(e, campaign.id, post.id)} className="cursor-grab active:cursor-grabbing">
                                        {renderPostCard(post as PostWithMedia, idx, campaign.id)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'universe' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="p-6 lg:col-span-2 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-2">Universo de Contenido</h3><p className="text-sm text-neutral-500 mb-4">No se llama NAS. Es la memoria estratégica social de Goatify: hooks, CTAs, objeciones, ofertas, palabras de marca, links, ideas y pruebas sociales. Se usa como contexto en cada campaña.</p><Textarea value={contentUniverse} onChange={e => setContentUniverse(e.target.value)} rows={18} /></Card>
                        <div className="space-y-4"><Card className="p-5 border border-neutral-200 dark:border-neutral-800"><h4 className="font-black mb-3">Qué guardar aquí</h4><ul className="text-sm space-y-2 text-neutral-600 dark:text-neutral-300"><li>• Hooks que ya funcionaron.</li><li>• Objeciones frecuentes.</li><li>• CTAs y links clave.</li><li>• Testimonios y pruebas.</li><li>• Promesas, beneficios y ofertas.</li><li>• Palabras prohibidas o favoritas.</li></ul></Card><Card className="p-5 border border-neutral-200 dark:border-neutral-800"><h4 className="font-black mb-3">Valor real</h4><p className="text-sm text-neutral-500">Mientras más use el usuario esta memoria, menos genérico será el contenido y más coherente será la marca.</p></Card></div>
                    </div>
                )}

                {activeTab === 'guide' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Guía rápida para publicar</h3><div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-300"><p><strong>Meta Business Suite:</strong> copia el copy, abre el compositor, selecciona Facebook/Instagram, sube imagen/video, revisa preview, programa o publica.</p><p><strong>X:</strong> el botón abre el intent con texto prellenado cuando aplica. Para hilos, copia variantes y publícalas secuencialmente.</p><p><strong>LinkedIn:</strong> copia el texto, abre el feed, pega, añade imagen/documento y publica con enfoque profesional.</p><p><strong>TikTok/Reels:</strong> usa el blueprint de video: hook 3s, escenas, texto en pantalla, caption y CTA.</p></div></Card>
                        <Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Asistente de pauta y pantalla</h3><p className="text-sm text-neutral-500 mb-4">Cuando el usuario esté en Meta Business, esta guía le recuerda qué revisar. No cambia el resto de Goatify ni necesita publicar directo todavía.</p><div className="space-y-3 text-sm"><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">1. Objetivo: mensajes, leads, tráfico o ventas.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">2. Audiencia: país, edad, intereses, comportamiento y exclusiones.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">3. Creativo: imagen/video claro, texto corto, CTA visible.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">4. Presupuesto: prueba pequeña, mide, duplica ganador.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">5. Calendario: programa y activa recordatorio en Goatify.</div></div></Card>
                        <Card className="p-6 lg:col-span-2 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Qué hace este módulo ahora</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"><div className="p-4 rounded-2xl bg-brand-primary/5">Genera campañas con lógica 2026.</div><div className="p-4 rounded-2xl bg-brand-primary/5">Guarda memoria por usuario.</div><div className="p-4 rounded-2xl bg-brand-primary/5">Calendariza posts y recordatorios.</div><div className="p-4 rounded-2xl bg-brand-primary/5">Crea prompts foto pro.</div><div className="p-4 rounded-2xl bg-brand-primary/5">Crea blueprints de video.</div><div className="p-4 rounded-2xl bg-brand-primary/5">Abre plataformas para publicación asistida.</div></div></Card>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SocialMediaManager;
