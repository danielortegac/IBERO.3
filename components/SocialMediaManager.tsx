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

type StudioTab = 'generator' | 'history' | 'contentCalendar' | 'brandCenter' | 'publishing' | 'guide';
type CampaignStatus = 'draft' | 'generated' | 'scheduled' | 'ready' | 'published' | 'archived';

type PostWithMedia = SocialPost & {
    generatedImageUrl?: string;
    imageAspectRatio?: string;
    brandId?: string;
    brandName?: string;
    videoScript?: string;
    onScreenText?: string[];
    videoScenes?: string[];
    mediaFormat?: string;
};

type BrandProfile = {
    id: string;
    ownerId: string;
    name: string;
    description: string;
    audience: string;
    tone: string;
    offer: string;
    whatsapp: string;
    links: string;
    hashtagsBase: string;
    wordsYes: string;
    wordsNo: string;
    visualStyle: string;
    ctas: string;
    objections: string;
    contentMemory: string;
    createdAt: string;
    updatedAt: string;
};

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
    TikTok: 'https://www.tiktok.com/upload',
    YouTube: 'https://studio.youtube.com/'
};

const NETWORKS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'X', 'YouTube'];
const TODAY = new Date();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const platformFormats: Record<string, { label: string; aspect: string; publishLabel: string; color: string }> = {
    Instagram: { label: 'Feed/Reel · 1080x1350 o 9:16', aspect: '4:5', publishLabel: 'Meta Business Suite', color: 'from-pink-500 to-purple-600' },
    Facebook: { label: 'Feed/Comunidad · 1:1 o 4:5', aspect: '1:1', publishLabel: 'Meta Business Suite', color: 'from-blue-500 to-sky-600' },
    TikTok: { label: 'Video corto · 9:16', aspect: '9:16', publishLabel: 'TikTok Upload', color: 'from-neutral-900 to-rose-600' },
    LinkedIn: { label: 'Post profesional · 1.91:1 o 4:5', aspect: '1.91:1', publishLabel: 'LinkedIn', color: 'from-blue-700 to-cyan-600' },
    X: { label: 'Post/Hilo · 16:9', aspect: '16:9', publishLabel: 'X', color: 'from-neutral-800 to-neutral-500' },
    YouTube: { label: 'Short/Community · 9:16 o 16:9', aspect: '9:16', publishLabel: 'YouTube Studio', color: 'from-red-600 to-orange-500' }
};

const normalizeHashtags = (hashtags?: string | string[]) => {
    if (Array.isArray(hashtags)) return hashtags.join(' ');
    return hashtags || '';
};

const postFullText = (post: SocialPost) => `${post.content || ''}\n\n${normalizeHashtags(post.hashtags)}`.trim();

const statusLabel: Record<string, string> = {
    draft: 'Borrador',
    generated: 'Generada',
    scheduled: 'Agendada',
    ready: 'Lista',
    published: 'Publicada',
    archived: 'Archivada'
};

const defaultContentMemory = `Hooks que han funcionado:\n- El problema no es la IA, es no tener una oferta clara.\n- Tu contenido no debe verse bonito; debe mover a alguien a actuar.\n\nCTAs favoritos:\n- Comenta QUIERO y te envío la guía.\n- Escríbenos por WhatsApp y te guiamos.\n\nObjeciones frecuentes:\n- No tengo tiempo.\n- No sé usar IA.\n- No sé si esto sirve para mi negocio.\n\nPalabras de marca:\n- práctico, real, automatizado, negocio, contenido, ventas, comunidad.`;

const emptyBrand = (ownerId: string, name = 'Mi marca'): BrandProfile => {
    const now = new Date().toISOString();
    return {
        id: `brand-${Date.now()}`,
        ownerId,
        name,
        description: '',
        audience: '',
        tone: 'Claro, humano, profesional, vendedor y fácil de entender.',
        offer: '',
        whatsapp: '',
        links: '',
        hashtagsBase: '',
        wordsYes: '',
        wordsNo: '',
        visualStyle: 'Limpio, premium, moderno, con luz cuidada y composición comercial.',
        ctas: '',
        objections: '',
        contentMemory: defaultContentMemory,
        createdAt: now,
        updatedAt: now
    };
};

const buildBrandContext = (brand?: BrandProfile | null) => {
    if (!brand) return '';
    return [
        `Marca: ${brand.name}`,
        `Descripción: ${brand.description}`,
        `Público ideal: ${brand.audience}`,
        `Tono de comunicación: ${brand.tone}`,
        `Oferta principal: ${brand.offer}`,
        `WhatsApp: ${brand.whatsapp}`,
        `Links: ${brand.links}`,
        `Hashtags base: ${brand.hashtagsBase}`,
        `Palabras que sí usa: ${brand.wordsYes}`,
        `Palabras prohibidas: ${brand.wordsNo}`,
        `Estilo visual: ${brand.visualStyle}`,
        `CTAs favoritos: ${brand.ctas}`,
        `Objeciones frecuentes: ${brand.objections}`,
        `Memoria libre: ${brand.contentMemory}`
    ].filter(Boolean).join('\n');
};

const monthGrid = (baseDate: Date) => {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const startDay = start.getDay();
    return Array.from({ length: 42 }, (_, i) => new Date(baseDate.getFullYear(), baseDate.getMonth(), i - startDay + 1));
};

const SocialMediaManager: React.FC = () => {
    const {
        setToastNotification,
        addHubPost,
        uploadImageToStorage,
        startAiTask,
        checkSocialPostLimit,
        checkMediaLimit,
        releaseMediaLimit,
        projects,
        updateProject,
        userProfile,
        userUsage,
        createNotification
    } = useContext(AppContext);

    const uid = userProfile?.uid || 'local-user';
    const [activeTab, setActiveTab] = useState<StudioTab>('generator');

    const [description, setDescription] = useState('');
    const [objective, setObjective] = useState('');
    const [offer, setOffer] = useState('');
    const [tone, setTone] = useState('Profesional, vendedor, humano, claro y actualizado 2026');
    const [networks, setNetworks] = useState<string[]>(['Instagram', 'Facebook', 'TikTok', 'LinkedIn']);
    const [campaignName, setCampaignName] = useState('');
    const [audience, setAudience] = useState('');
    const [industry, setIndustry] = useState('Negocios, educación, marketing y servicios profesionales');
    const [campaignMode, setCampaignMode] = useState('Campaña orgánica + venta suave');
    const [campaignLength, setCampaignLength] = useState('7 días');
    const [budget, setBudget] = useState('Sin presupuesto definido');
    const [contentMemory, setContentMemory] = useState(defaultContentMemory);

    const [brands, setBrands] = useState<BrandProfile[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState('');
    const [brandDraft, setBrandDraft] = useState<BrandProfile>(emptyBrand(uid, userProfile?.businessName || 'Mi marca'));

    const [isGenerating, setIsGenerating] = useState(false);
    const [results, setResults] = useState<PostWithMedia[]>([]);
    const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<SocialCampaign[]>([]);
    const [isImageGenerating, setIsImageGenerating] = useState<string | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<SocialCampaign | null>(null);

    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [postToSave, setPostToSave] = useState<PostWithMedia | null>(null);
    const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

    const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
    const [scheduleDate, setScheduleDate] = useState(isoDate(TODAY));
    const [scheduleTime, setScheduleTime] = useState('19:00');
    const [reminderMinutes, setReminderMinutes] = useState('30');
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(isoDate(TODAY));
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    const [filterBrandId, setFilterBrandId] = useState('all');
    const [filterCampaignId, setFilterCampaignId] = useState('all');
    const [filterNetwork, setFilterNetwork] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    const planConfig = getPlanConfig(userProfile.plan);
    const limit = (planConfig.limits as any).social_posts_monthly || 30;
    const used = userUsage?.counters?.monthly_posts_used || 0;
    const localStorageKey = `goatify_social_campaigns_${uid}`;
    const brandsKey = `goatify_social_brands_${uid}`;
    const contentMemoryKey = `goatify_social_content_memory_${uid}`;

    const selectedBrand = useMemo(() => brands.find(b => b.id === selectedBrandId) || null, [brands, selectedBrandId]);

    useEffect(() => {
        const cachedMemory = localStorage.getItem(contentMemoryKey);
        if (cachedMemory) setContentMemory(cachedMemory);
    }, [contentMemoryKey]);

    useEffect(() => {
        localStorage.setItem(contentMemoryKey, contentMemory);
    }, [contentMemory, contentMemoryKey]);

    useEffect(() => {
        const cachedBrands = localStorage.getItem(brandsKey);
        if (cachedBrands) {
            try {
                const parsed = JSON.parse(cachedBrands);
                setBrands(parsed);
                if (parsed[0] && !selectedBrandId) {
                    setSelectedBrandId(parsed[0].id);
                    setBrandDraft(parsed[0]);
                }
            } catch { /* cache inválido */ }
        }
        if (!uid || uid === 'local-user') return;
        const q = query(collection(db, 'users', uid, 'socialBrands'), orderBy('updatedAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as BrandProfile));
            setBrands(remote);
            localStorage.setItem(brandsKey, JSON.stringify(remote));
            if (remote.length > 0 && !selectedBrandId) {
                setSelectedBrandId(remote[0].id);
                setBrandDraft(remote[0]);
            }
        }, (error) => console.warn('[Gestor de Contenidos] Centro de Marca no disponible, usando caché:', error));
        return () => unsub();
    }, [uid, brandsKey]);

    useEffect(() => {
        if (selectedBrand) {
            setBrandDraft(selectedBrand);
            setContentMemory(selectedBrand.contentMemory || defaultContentMemory);
        }
    }, [selectedBrand?.id]);

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
        }, (error) => console.warn('[Gestor de Contenidos] Firestore no disponible, usando caché local:', error));
        return () => unsub();
    }, [uid, localStorageKey]);

    const calendarPosts = useMemo(() => {
        return campaigns.flatMap(campaign => (campaign.posts || [])
            .filter(post => post.scheduledAt)
            .map(post => ({ campaign, post }))
        ).filter(({ campaign, post }) => {
            const brandMatch = filterBrandId === 'all' || (campaign as any).brandId === filterBrandId || (post as any).brandId === filterBrandId;
            const campaignMatch = filterCampaignId === 'all' || campaign.id === filterCampaignId;
            const networkMatch = filterNetwork === 'all' || post.platform === filterNetwork;
            const statusMatch = filterStatus === 'all' || String(post.status || 'generated') === filterStatus;
            return brandMatch && campaignMatch && networkMatch && statusMatch;
        }).sort((a, b) => String(a.post.scheduledAt).localeCompare(String(b.post.scheduledAt)));
    }, [campaigns, filterBrandId, filterCampaignId, filterNetwork, filterStatus]);

    const todayPosts = useMemo(() => {
        const today = isoDate(new Date());
        return calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(today));
    }, [calendarPosts]);

    const selectedDayPosts = useMemo(() => {
        return calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(selectedCalendarDate));
    }, [calendarPosts, selectedCalendarDate]);

    const filteredCampaigns = useMemo(() => {
        return campaigns.filter(campaign => {
            const brandMatch = filterBrandId === 'all' || (campaign as any).brandId === filterBrandId;
            const campaignMatch = filterCampaignId === 'all' || campaign.id === filterCampaignId;
            const networkMatch = filterNetwork === 'all' || (campaign.networks || []).includes(filterNetwork);
            const statusMatch = filterStatus === 'all' || campaign.status === filterStatus;
            return brandMatch && campaignMatch && networkMatch && statusMatch;
        });
    }, [campaigns, filterBrandId, filterCampaignId, filterNetwork, filterStatus]);

    const saveBrand = async () => {
        const now = new Date().toISOString();
        const brand: BrandProfile = {
            ...brandDraft,
            ownerId: uid,
            name: brandDraft.name || 'Mi marca',
            contentMemory,
            updatedAt: now,
            createdAt: brandDraft.createdAt || now
        };
        const normalized = [brand, ...brands.filter(b => b.id !== brand.id)];
        setBrands(normalized);
        setSelectedBrandId(brand.id);
        localStorage.setItem(brandsKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') await setDoc(doc(db, 'users', uid, 'socialBrands', brand.id), brand, { merge: true });
        setToastNotification({ title: 'Centro de Marca guardado', message: 'La memoria de marca quedó lista para nuevas campañas.', icon: 'check' });
    };

    const newBrand = () => {
        const fresh = emptyBrand(uid, userProfile?.businessName || 'Nueva marca');
        setBrandDraft(fresh);
        setSelectedBrandId('');
        setContentMemory(fresh.contentMemory);
    };

    const saveCampaign = async (campaign: SocialCampaign) => {
        const normalized = [campaign, ...campaigns.filter(c => c.id !== campaign.id)];
        setCampaigns(normalized);
        localStorage.setItem(localStorageKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') await setDoc(doc(db, 'users', uid, 'socialCampaigns', campaign.id), campaign, { merge: true });
    };

    const updateCampaign = async (campaignId: string, patch: Partial<SocialCampaign>) => {
        const existing = campaigns.find(c => c.id === campaignId);
        if (!existing) return;
        const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as SocialCampaign;
        const normalized = campaigns.map(c => c.id === campaignId ? updated : c);
        setCampaigns(normalized);
        localStorage.setItem(localStorageKey, JSON.stringify(normalized));
        if (uid && uid !== 'local-user') await updateDoc(doc(db, 'users', uid, 'socialCampaigns', campaignId), { ...patch, updatedAt: updated.updatedAt });
    };

    const toggleNetwork = (net: string) => setNetworks(prev => prev.includes(net) ? prev.filter(n => n !== net) : [...prev, net]);

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
            const brandContext = buildBrandContext(selectedBrand) || buildBrandContext(brandDraft);
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
                brandVoice: brandDraft.tone || tone,
                contentUniverse: `${contentMemory}\n\nCENTRO DE MARCA ESTRUCTURADO:\n${brandContext}`,
                brandName: selectedBrand?.name || brandDraft.name,
                platformFormats
            } as any);

            if (posts && Array.isArray(posts) && posts.length > 0) {
                const createdAt = new Date().toISOString();
                const campaignId = `social-${Date.now()}`;
                const brandName = selectedBrand?.name || brandDraft.name || 'Mi marca';
                const normalizedPosts: PostWithMedia[] = posts.map((post: SocialPost, index: number) => {
                    const platform = post.platform || networks[index % networks.length];
                    const format = platformFormats[platform] || platformFormats.Instagram;
                    return {
                        ...post,
                        id: post.id || `${campaignId}-post-${index + 1}`,
                        campaignId,
                        brandId: selectedBrand?.id || brandDraft.id,
                        brandName,
                        status: 'generated',
                        createdAt,
                        platform,
                        hashtags: post.hashtags || selectedBrand?.hashtagsBase || brandDraft.hashtagsBase || '',
                        qualityScore: post.qualityScore || 88,
                        imageAspectRatio: (post as any).imageAspectRatio || format.aspect,
                        mediaFormat: (post as any).mediaFormat || format.label,
                        videoScript: (post as any).videoScript || post.videoBrief || '',
                        onScreenText: (post as any).onScreenText || [],
                        videoScenes: (post as any).videoScenes || post.shotList || []
                    };
                });
                await consumeServerFeature('social_post', normalizedPosts.length, {
                    module: 'social_media_studio',
                    action: 'generate_campaign',
                    campaignMode,
                    networks,
                    campaignName: campaignName || objective,
                    brandId: selectedBrand?.id || brandDraft.id,
                    brandName
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
                    brandVoice: brandDraft.tone || tone,
                    contentUniverse: `${contentMemory}\n\n${brandContext}`,
                    status: 'generated' as CampaignStatus,
                    createdAt,
                    updatedAt: createdAt,
                    posts: normalizedPosts,
                    creditsNote: `Generación social registrada. Redes generadas: ${normalizedPosts.length}. Imágenes, video real y análisis de pantalla consumen cupos separados cuando se ejecuten.`,
                    ...(selectedBrand?.id || brandDraft.id ? { brandId: selectedBrand?.id || brandDraft.id, brandName } : {})
                } as SocialCampaign;
                await saveCampaign(campaign);
                setCurrentCampaignId(campaignId);
                setResults(normalizedPosts);
                setSelectedCampaign(campaign);
                setToastNotification({ title: 'Campaña creada', message: 'Se guardó en tu memoria, historial y calendario de contenidos.', icon: 'check' });
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

    const handleGenerateImage = async (post: PostWithMedia) => {
        const prompt = post.photoPrompt || post.imagePrompt || '';
        if (!prompt) return;
        const isBlocked = await checkMediaLimit('image');
        if (isBlocked) return;
        setIsImageGenerating(post.id || prompt);
        try {
            const aspectRatio = post.imageAspectRatio || platformFormats[post.platform]?.aspect || '1:1';
            const base64 = await generateImage(prompt, aspectRatio as any);
            const url = await uploadImageToStorage(base64);
            await startAiTask({ type: 'image', prompt, status: 'completed', resultUrl: url, aspectRatio });
            const updatedResults = results.map(p => p.id === post.id ? { ...p, generatedImageUrl: url } : p);
            setResults(updatedResults);
            if (currentCampaignId) await updateCampaign(currentCampaignId, { posts: updatedResults as SocialPost[] });
            setToastNotification({ title: 'Imagen lista', message: `Imagen generada en formato ${aspectRatio}.`, icon: 'image' });
        } catch (e) {
            console.error(e);
            try { await releaseMediaLimit('image'); } catch (releaseErr) { console.warn('No se pudo liberar crédito de imagen:', releaseErr); }
            setToastNotification({ title: 'Error', message: 'No se pudo generar la imagen. Se liberó el cupo reservado si la generación no se completó.', icon: 'close' });
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
        if (platform === 'YouTube') return PLATFORM_URLS.YouTube;
        return PLATFORM_URLS.Instagram;
    };

    const handleAssistedPublish = async (post: PostWithMedia, campaignId?: string) => {
        await copyToClipboard(postFullText(post), `Copy listo. Se abrirá ${platformFormats[post.platform]?.publishLabel || post.platform}.`);
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
        const content = `🚀 **Contenido para ${post.platform}**\n\n${post.content}\n\n${normalizeHashtags(post.hashtags)}`;
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
        const noteContent = `### 📱 Post para ${postToSave.platform}\n\n**Marca:** ${postToSave.brandName || selectedBrand?.name || 'Sin marca'}\n\n${postToSave.content}\n\n**Hashtags:** ${normalizeHashtags(postToSave.hashtags)}\n\n**Hook:** ${postToSave.hook || ''}\n\n**CTA:** ${postToSave.cta || ''}\n\n**Prompt visual:** ${postToSave.photoPrompt || postToSave.imagePrompt || ''}\n\n**Formato visual:** ${postToSave.imageAspectRatio || ''} · ${postToSave.mediaFormat || ''}\n\n**Guion video:** ${postToSave.videoScript || postToSave.videoBrief || ''}\n\n${postToSave.generatedImageUrl ? `![Imagen](${postToSave.generatedImageUrl})` : ''}`;
        const newNote: Note = {
            id: `note-${Date.now()}`,
            title: `Post ${postToSave.platform}: ${postToSave.brandName || selectedBrand?.name || 'Marca'} (${new Date().toLocaleDateString()})`,
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
        const reminderAt = new Date(new Date(scheduledAt).getTime() - (Number(reminderMinutes) * 60 * 1000)).toISOString();
        const updatedPost: SocialPost = { ...scheduleDraft.post, scheduledAt, reminderMinutes: Number(reminderMinutes), status: 'scheduled' };
        const campaign = scheduleDraft.campaignId ? campaigns.find(c => c.id === scheduleDraft.campaignId) : selectedCampaign;

        if (scheduleDraft.campaignId && campaign) {
            const posts = campaign.posts.map(p => p.id === updatedPost.id ? updatedPost : p);
            await updateCampaign(scheduleDraft.campaignId, { posts, status: 'scheduled' });
        }
        if (currentCampaignId === scheduleDraft.campaignId || (!scheduleDraft.campaignId && typeof scheduleDraft.postIndex === 'number')) {
            setResults(prev => prev.map((p, index) => p.id === updatedPost.id || index === scheduleDraft.postIndex ? { ...p, ...updatedPost } : p));
        }

        if (uid && uid !== 'local-user') {
            const itemId = `${scheduleDraft.campaignId || currentCampaignId || 'campaign'}_${updatedPost.id || Date.now()}`;
            await setDoc(doc(db, 'users', uid, 'socialCalendar', itemId), {
                id: itemId,
                eventType: 'social_post',
                campaignId: scheduleDraft.campaignId || currentCampaignId,
                campaignName: campaign?.name || campaignName,
                postId: updatedPost.id,
                ownerId: uid,
                brandId: (updatedPost as any).brandId || (campaign as any)?.brandId || selectedBrand?.id || brandDraft.id,
                brandName: (updatedPost as any).brandName || (campaign as any)?.brandName || selectedBrand?.name || brandDraft.name,
                platform: updatedPost.platform,
                title: `${updatedPost.platform}: ${campaign?.name || campaignName || 'Contenido'}`,
                scheduledAt,
                reminderAt,
                reminderMinutes: Number(reminderMinutes),
                status: 'scheduled',
                copy: updatedPost.content || '',
                hashtags: normalizeHashtags(updatedPost.hashtags),
                imagePrompt: updatedPost.photoPrompt || updatedPost.imagePrompt || '',
                videoPrompt: (updatedPost as any).videoScript || updatedPost.videoBrief || updatedPost.videoPrompt || '',
                publishUrl: getPublishUrl(updatedPost),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            await createNotification(uid, {
                type: 'general',
                text: `📅 Contenido agendado: <strong>${updatedPost.platform}</strong> para ${new Date(scheduledAt).toLocaleString()}.`,
                link: '/#aiStudio',
                fromUser: { uid: 'system_goatify', name: 'Goatify Social', avatarUrl: userProfile.avatarUrl }
            });
        }
        setScheduleDraft(null);
        setToastNotification({ title: 'Calendarizado', message: 'El post quedó en el Calendario de Contenidos y en la memoria social.', icon: 'calendar' });
    };

    const markPublished = async (campaignId: string, post: SocialPost) => {
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return;
        const posts = campaign.posts.map(p => p.id === post.id ? { ...p, status: 'published', publishedAt: new Date().toISOString() } : p);
        await updateCampaign(campaignId, { posts, status: 'published' });
        if (uid && uid !== 'local-user' && post.id) {
            await setDoc(doc(db, 'users', uid, 'socialCalendar', `${campaignId}_${post.id}`), { status: 'published', publishedAt: new Date().toISOString() }, { merge: true });
        }
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
        setContentMemory(campaign.contentUniverse || contentMemory);
        if ((campaign as any).brandId) setSelectedBrandId((campaign as any).brandId);
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

    const exportCampaignTxt = (campaign: SocialCampaign) => {
        const txt = [`CAMPAÑA: ${campaign.name}`, `OBJETIVO: ${campaign.objective}`, `REDES: ${campaign.networks?.join(', ')}`, '', ...(campaign.posts || []).map((post, i) => `--- POST ${i + 1} · ${post.platform} ---\n${post.content}\n${normalizeHashtags(post.hashtags)}\n\nPROMPT IMAGEN:\n${post.photoPrompt || post.imagePrompt || ''}\n\nVIDEO:\n${(post as any).videoScript || post.videoBrief || ''}`)].join('\n\n');
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-posts.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderScore = (post: SocialPost) => {
        const score = typeof post.qualityScore === 'number' ? post.qualityScore : 88;
        const tone = score >= 90 ? 'emerald' : score >= 75 ? 'amber' : 'rose';
        const cls = tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : tone === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-300';
        return <span className={`px-2 py-1 rounded-full ${cls} text-[10px] font-black`}>Score {score}/100</span>;
    };

    const renderFilters = () => (
        <Card className="p-4 border border-neutral-200 dark:border-neutral-800 mb-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <select value={filterBrandId} onChange={e => setFilterBrandId(e.target.value)} className="p-2 rounded-xl text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 font-bold">
                    <option value="all">Todas las marcas</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={filterCampaignId} onChange={e => setFilterCampaignId(e.target.value)} className="p-2 rounded-xl text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 font-bold">
                    <option value="all">Todas las campañas</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={filterNetwork} onChange={e => setFilterNetwork(e.target.value)} className="p-2 rounded-xl text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 font-bold">
                    <option value="all">Todas las redes</option>
                    {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p-2 rounded-xl text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 font-bold">
                    <option value="all">Todos los estados</option>
                    {Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
            </div>
        </Card>
    );

    const renderPostPreview = (post: PostWithMedia) => {
        const hashtags = normalizeHashtags(post.hashtags);
        const gradient = platformFormats[post.platform]?.color || platformFormats.Instagram.color;
        return (
            <div className="rounded-[2rem] border-8 border-neutral-900 dark:border-neutral-700 bg-white dark:bg-neutral-950 shadow-xl overflow-hidden max-w-sm mx-auto">
                <div className="h-7 bg-neutral-900 dark:bg-neutral-800 flex items-center justify-center"><div className="w-16 h-1 bg-neutral-600 rounded-full" /></div>
                <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-black`}>{(post.brandName || selectedBrand?.name || brandDraft.name || 'G').slice(0, 1)}</div>
                        <div>
                            <p className="text-sm font-black text-neutral-900 dark:text-white">{post.brandName || selectedBrand?.name || brandDraft.name || 'Tu marca'}</p>
                            <p className="text-[10px] text-neutral-500">{post.platform} · {post.mediaFormat || platformFormats[post.platform]?.label || 'vista previa'}</p>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 h-44 flex items-center justify-center text-center p-4 mb-4 overflow-hidden">
                        {post.generatedImageUrl ? <img src={post.generatedImageUrl} alt="preview" className="w-full h-full object-cover rounded-xl" /> : <p className="text-xs font-bold text-neutral-500 line-clamp-6">{post.photoPrompt || post.imagePrompt || 'Prompt visual listo para generar imagen.'}</p>}
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

    const renderPostCard = (post: PostWithMedia, idx: number, campaignId?: string) => {
        const platformInfo = platformFormats[post.platform] || platformFormats.Instagram;
        return (
            <Card key={post.id || `${post.platform}-${idx}`} className="p-6 border border-neutral-200 dark:border-neutral-800 relative overflow-hidden bg-white dark:bg-dark-surface transition-all hover:shadow-xl">
                <div className={`absolute top-0 right-0 bg-gradient-to-r ${platformInfo.color} text-white text-[10px] font-bold px-4 py-1.5 rounded-bl-xl uppercase`}>{post.platform}</div>
                <div className="flex flex-wrap items-center gap-2 mb-4 pr-24">
                    {renderScore(post)}
                    <span className="px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-[10px] font-bold uppercase">{post.format || 'Post'}</span>
                    <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 text-[10px] font-bold uppercase">{statusLabel[String(post.status || 'generated')] || 'Generada'}</span>
                    <span className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-bold uppercase">{post.imageAspectRatio || platformInfo.aspect}</span>
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
                                <p className="text-[10px] font-black uppercase text-orange-600 mb-2">Prompt de imagen pro</p>
                                <p className="text-xs text-orange-900 dark:text-orange-200 italic line-clamp-6">{post.photoPrompt || post.imagePrompt || 'No generado.'}</p>
                                <p className="mt-2 text-[10px] font-bold text-orange-700 dark:text-orange-300">Formato recomendado: {post.imageAspectRatio || platformInfo.aspect} · {post.mediaFormat || platformInfo.label}</p>
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    <Button size="sm" variant="secondary" onClick={() => copyToClipboard(post.photoPrompt || post.imagePrompt || '')}><Icon name="copy" className="w-4 h-4"/> Prompt</Button>
                                    <Button size="sm" variant="secondary" onClick={() => handleGenerateImage(post)} disabled={isImageGenerating === (post.id || '')}>{isImageGenerating === (post.id || '') ? <Spinner /> : <><Icon name="image" className="w-4 h-4"/> Generar</>}</Button>
                                </div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                                <p className="text-[10px] font-black uppercase text-blue-600 mb-2">Guion de video / Reel</p>
                                <p className="text-xs text-blue-900 dark:text-blue-200 line-clamp-6">{post.videoScript || post.videoBrief || post.videoPrompt || post.visualCues || 'Hook, escenas, texto en pantalla y CTA se generan aquí.'}</p>
                                {((post.videoScenes && post.videoScenes.length > 0) || (post.shotList && post.shotList.length > 0)) && <ul className="mt-2 space-y-1 text-[11px] text-blue-800 dark:text-blue-200">{(post.videoScenes || post.shotList || []).slice(0, 4).map((shot, i) => <li key={i}>• {shot}</li>)}</ul>}
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
                    <Button size="sm" onClick={() => handleAssistedPublish(post, campaignId)} className="bg-neutral-900 dark:bg-white text-white dark:text-black hover:opacity-90"><Icon name="externalLink" className="w-4 h-4"/> Publicar en {platformInfo.publishLabel}</Button>
                    <Button size="sm" variant="secondary" onClick={() => openScheduleModal(post, campaignId, idx)}><Icon name="calendar" className="w-4 h-4"/> Agendar</Button>
                    <Button size="sm" variant="secondary" onClick={() => copyToClipboard(postFullText(post))}><Icon name="copy" className="w-4 h-4"/> Copy</Button>
                    <Button size="sm" variant="secondary" onClick={() => copyToClipboard(post.videoScript || post.videoBrief || post.videoPrompt || '')}><Icon name="video" className="w-4 h-4"/> Guion</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleSaveToHub(post)}>Hub</Button>
                    <Button size="sm" variant="secondary" onClick={() => openSaveModal(post)}>Proyecto</Button>
                    {campaignId && <Button size="sm" variant="ghost" onClick={() => markPublished(campaignId, post)}><Icon name="check" className="w-4 h-4"/> Publicado</Button>}
                </div>
            </Card>
        );
    };

    const renderCalendarGrid = () => {
        const days = monthGrid(calendarMonth);
        const title = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(calendarMonth);
        return (
            <Card className="p-4 border border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-lg capitalize">{title}</h3>
                    <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>←</Button>
                        <Button size="sm" variant="secondary" onClick={() => setCalendarMonth(new Date())}>Hoy</Button>
                        <Button size="sm" variant="secondary" onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>→</Button>
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-px bg-neutral-200 dark:bg-neutral-800 rounded-2xl overflow-hidden">
                    {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(day => <div key={day} className="bg-neutral-50 dark:bg-neutral-900 text-center font-black text-[10px] text-neutral-400 py-2 uppercase">{day}</div>)}
                    {days.map((date, i) => {
                        const dateStr = isoDate(date);
                        const events = calendarPosts.filter(item => String(item.post.scheduledAt).startsWith(dateStr));
                        const isCurrent = date.getMonth() === calendarMonth.getMonth();
                        const isToday = date.toDateString() === new Date().toDateString();
                        return (
                            <button key={i} onClick={() => setSelectedCalendarDate(dateStr)} className={`min-h-[92px] text-left p-2 bg-white dark:bg-dark-surface hover:bg-brand-primary/5 transition-all ${!isCurrent ? 'opacity-40' : ''} ${selectedCalendarDate === dateStr ? 'ring-2 ring-brand-primary z-10' : ''}`}>
                                <span className={`text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-lg mb-1 ${isToday ? 'bg-brand-primary text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>{date.getDate()}</span>
                                <div className="space-y-1">
                                    {events.slice(0, 3).map(({ post, campaign }) => <div key={`${campaign.id}-${post.id}`} className="px-1.5 py-1 rounded-md text-[9px] font-black bg-pink-500/10 text-pink-600 dark:text-pink-300 truncate">{String(post.scheduledAt).slice(11,16)} · {post.platform}</div>)}
                                    {events.length > 3 && <p className="text-[9px] font-bold text-neutral-400">+{events.length - 3} más</p>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </Card>
        );
    };

    return (
        <div className="p-4 sm:p-6 h-full overflow-y-auto animate-fade-in bg-neutral-100 dark:bg-black pb-32">
            <Modal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} title="Guardar en Proyecto">
                <div className="space-y-4">
                    <p className="text-sm">Selecciona un proyecto para guardar este post como una nota completa:</p>
                    <select value={targetProjectId} onChange={e => setTargetProjectId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setIsSaveModalOpen(false)}>Cancelar</Button><Button onClick={handleSaveToProject}>Guardar</Button></div>
                </div>
            </Modal>

            <Modal isOpen={!!scheduleDraft} onClose={() => setScheduleDraft(null)} title="Agendar publicación">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-500">Guarda fecha, hora y recordatorio. El post aparece en el Calendario de Contenidos y también en el calendario general de Goatify.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} /><Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} /></div>
                    <select value={reminderMinutes} onChange={e => setReminderMinutes(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 mt-1 text-sm">
                        <option value="10">Recordar 10 min antes</option><option value="30">Recordar 30 min antes</option><option value="60">Recordar 1 hora antes</option><option value="1440">Recordar 1 día antes</option>
                    </select>
                    <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-3 text-xs text-neutral-600 dark:text-neutral-300">Para push en celular, el usuario debe tener notificaciones activas. El evento queda guardado para campana interna y futuras notificaciones programadas.</div>
                    <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setScheduleDraft(null)}>Cancelar</Button><Button onClick={saveSchedule}>Guardar calendario</Button></div>
                </div>
            </Modal>

            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
                    <div>
                        <button onClick={() => window.history.back()} className="text-xs font-black uppercase tracking-widest text-neutral-400 hover:text-brand-primary mb-2 flex items-center gap-1">← Volver al último lugar</button>
                        <h1 className="text-4xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-violet-600 to-blue-500">Gestor de Contenidos</h1>
                        <p className="text-neutral-500 max-w-3xl">Centro de marca, campañas, posts, prompts visuales, guiones de video, pauta, calendario, recordatorios y publicación asistida.</p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{brands.length}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Marcas</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{campaigns.length}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Campañas</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{calendarPosts.length}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Agendados</p></div>
                        <div className="bg-white dark:bg-dark-surface rounded-2xl p-3 border border-neutral-200 dark:border-neutral-800"><p className="text-lg font-black">{used}/{limit}</p><p className="text-[10px] uppercase font-bold text-neutral-500">Cupo</p></div>
                    </div>
                </div>

                {todayPosts.length > 0 && <div className="mb-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-3xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div className="flex items-center gap-3"><Icon name="bell" className="w-6 h-6 text-amber-600"/><div><p className="font-black text-neutral-900 dark:text-white">Tienes {todayPosts.length} publicación(es) para hoy</p><p className="text-xs text-neutral-500">Copia, abre la plataforma y marca como publicado.</p></div></div><Button size="sm" variant="secondary" onClick={() => { setActiveTab('contentCalendar'); setSelectedCalendarDate(isoDate(new Date())); }}>Ver calendario</Button></div>}

                <div className="flex gap-2 overflow-x-auto pb-3 mb-6">
                    {[
                        ['generator', 'Crear campaña'], ['brandCenter', 'Centro de Marca'], ['history', 'Campañas guardadas'], ['contentCalendar', 'Calendario de Contenidos'], ['publishing', 'Publicador / Pautas'], ['guide', 'Manual de Uso']
                    ].map(([id, label]) => <button key={id} onClick={() => setActiveTab(id as StudioTab)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase whitespace-nowrap border ${activeTab === id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-dark-surface border-neutral-200 dark:border-neutral-800 text-neutral-500'}`}>{label}</button>)}
                </div>

                {activeTab === 'generator' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-4 space-y-5 bg-white dark:bg-dark-surface p-6 rounded-3xl shadow-xl border border-neutral-200 dark:border-neutral-800 h-fit lg:sticky lg:top-4">
                            <div className="bg-brand-primary/5 p-4 rounded-2xl border border-brand-primary/10 flex justify-between items-center"><div><p className="text-[10px] font-black uppercase text-brand-primary tracking-widest">Cupo mensual</p><p className="text-sm font-bold text-neutral-800 dark:text-white">{used} de {limit} posts</p></div><Icon name="share" className="w-6 h-6 text-brand-primary"/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Marca</label><select value={selectedBrandId} onChange={e => setSelectedBrandId(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm"><option value="">Usar borrador rápido</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button onClick={() => setActiveTab('brandCenter')} className="mt-2 text-[11px] font-black text-brand-primary">Configurar Centro de Marca →</button></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nombre de campaña</label><Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ej: Lanzamiento Certificación IA"/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Idea / contexto</label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Qué vendes, qué problema resuelves, qué debe entender la audiencia..." rows={4}/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Objetivo</label><Input value={objective} onChange={e => setObjective(e.target.value)} placeholder="Vender, generar leads, agendar, crecer comunidad..."/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Oferta / CTA</label><Input value={offer} onChange={e => setOffer(e.target.value)} placeholder="Precio, bono, link, WhatsApp, clase gratis..."/></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Audiencia</label><Input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Emprendedores, docentes..."/></div><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Industria</label><Input value={industry} onChange={e => setIndustry(e.target.value)} /></div></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Modo campaña</label><select value={campaignMode} onChange={e => setCampaignMode(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm"><option>Campaña orgánica + venta suave</option><option>Lanzamiento con urgencia</option><option>Pauta Meta Ads / Facebook Ads</option><option>Contenido educativo de autoridad</option><option>Reactivación de clientes</option><option>Campaña de comunidad</option></select></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Duración</label><select value={campaignLength} onChange={e => setCampaignLength(e.target.value)} className="w-full bg-light-bg dark:bg-dark-bg border border-neutral-300 dark:border-neutral-600 rounded-lg p-2 text-sm"><option>Post rápido</option><option>7 días</option><option>14 días</option><option>30 días</option></select></div><div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Presupuesto pauta</label><Input value={budget} onChange={e => setBudget(e.target.value)} placeholder="$5/día, $100 total..."/></div></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Voz de Marca</label><Textarea value={tone} onChange={e => setTone(e.target.value)} rows={2}/></div>
                            <div><label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Redes</label><div className="flex flex-wrap gap-2">{NETWORKS.map(net => <button key={net} onClick={() => toggleNetwork(net)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${networks.includes(net) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-neutral-50 dark:bg-neutral-900 text-neutral-500 border-neutral-200 dark:border-neutral-700'}`}>{net}</button>)}</div></div>
                            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full py-4 shadow-xl bg-gradient-to-r from-brand-primary to-purple-600 text-white">{isGenerating ? <Spinner text="Creando campaña..." className="text-white font-bold text-lg" /> : <><Icon name="ai" className="w-6 h-6"/> Generar campaña pro</>}</Button>
                        </div>
                        <div className="lg:col-span-8 space-y-6">
                            {results.length === 0 && !isGenerating && <div className="text-center py-16 bg-white dark:bg-dark-surface rounded-3xl border border-dashed border-neutral-300 dark:border-neutral-700"><Icon name="share" className="w-16 h-16 mx-auto mb-4 text-neutral-300"/><h3 className="text-xl font-black mb-2">Tu campaña aparecerá aquí</h3><p className="text-neutral-500 max-w-xl mx-auto">Genera posts por red, prompts de imagen, guiones de video, pauta, calendario sugerido y botones para publicar asistido.</p></div>}
                            {results.map((post, idx) => renderPostCard(post, idx, currentCampaignId || undefined))}
                        </div>
                    </div>
                )}

                {activeTab === 'brandCenter' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="p-6 lg:col-span-2 border border-neutral-200 dark:border-neutral-800"><div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="text-xl font-black">Centro de Marca</h3><p className="text-sm text-neutral-500">Memoria clara por marca: tono, oferta, público, links, CTAs, objeciones y estilo visual.</p></div><Button size="sm" variant="secondary" onClick={newBrand}>Nueva marca</Button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><Input value={brandDraft.name} onChange={e => setBrandDraft({ ...brandDraft, name: e.target.value })} placeholder="Nombre de marca"/><Input value={brandDraft.whatsapp} onChange={e => setBrandDraft({ ...brandDraft, whatsapp: e.target.value })} placeholder="WhatsApp"/><Textarea value={brandDraft.description} onChange={e => setBrandDraft({ ...brandDraft, description: e.target.value })} rows={3} placeholder="Descripción de la marca"/><Textarea value={brandDraft.audience} onChange={e => setBrandDraft({ ...brandDraft, audience: e.target.value })} rows={3} placeholder="Público ideal"/><Textarea value={brandDraft.tone} onChange={e => setBrandDraft({ ...brandDraft, tone: e.target.value })} rows={3} placeholder="Tono de comunicación"/><Textarea value={brandDraft.offer} onChange={e => setBrandDraft({ ...brandDraft, offer: e.target.value })} rows={3} placeholder="Oferta principal"/><Textarea value={brandDraft.links} onChange={e => setBrandDraft({ ...brandDraft, links: e.target.value })} rows={3} placeholder="Links importantes"/><Textarea value={brandDraft.hashtagsBase} onChange={e => setBrandDraft({ ...brandDraft, hashtagsBase: e.target.value })} rows={3} placeholder="Hashtags base"/><Textarea value={brandDraft.wordsYes} onChange={e => setBrandDraft({ ...brandDraft, wordsYes: e.target.value })} rows={3} placeholder="Palabras que sí usa"/><Textarea value={brandDraft.wordsNo} onChange={e => setBrandDraft({ ...brandDraft, wordsNo: e.target.value })} rows={3} placeholder="Palabras prohibidas"/><Textarea value={brandDraft.ctas} onChange={e => setBrandDraft({ ...brandDraft, ctas: e.target.value })} rows={3} placeholder="CTAs favoritos"/><Textarea value={brandDraft.objections} onChange={e => setBrandDraft({ ...brandDraft, objections: e.target.value })} rows={3} placeholder="Objeciones frecuentes"/></div><div className="mt-3"><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Estilo visual</label><Textarea value={brandDraft.visualStyle} onChange={e => setBrandDraft({ ...brandDraft, visualStyle: e.target.value })} rows={3}/></div><div className="mt-3"><label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Memoria libre de contenido</label><Textarea value={contentMemory} onChange={e => setContentMemory(e.target.value)} rows={8}/></div><div className="mt-4 flex justify-end"><Button onClick={saveBrand}><Icon name="check" className="w-4 h-4"/> Guardar Centro de Marca</Button></div></Card>
                        <div className="space-y-4"><Card className="p-5 border border-neutral-200 dark:border-neutral-800"><h4 className="font-black mb-3">Marcas guardadas</h4><div className="space-y-2">{brands.length === 0 && <p className="text-sm text-neutral-500">Aún no hay marcas guardadas.</p>}{brands.map(b => <button key={b.id} onClick={() => { setSelectedBrandId(b.id); setBrandDraft(b); setContentMemory(b.contentMemory || defaultContentMemory); }} className={`w-full text-left p-3 rounded-xl border ${selectedBrandId === b.id ? 'border-brand-primary bg-brand-primary/5' : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900'}`}><p className="font-black text-sm">{b.name}</p><p className="text-[11px] text-neutral-500 line-clamp-2">{b.description || b.tone}</p></button>)}</div></Card><Card className="p-5 border border-neutral-200 dark:border-neutral-800"><h4 className="font-black mb-3">Valor real</h4><p className="text-sm text-neutral-500">Mientras más completo esté el Centro de Marca, menos genérico sale el contenido. Goatify usa estos datos en campañas, prompts visuales, guiones, pautas y calendario.</p></Card></div>
                    </div>
                )}

                {activeTab === 'history' && <div>{renderFilters()}<div className="space-y-4">{filteredCampaigns.length === 0 && <Card className="p-8 text-center text-neutral-500">Todavía no hay campañas guardadas con esos filtros.</Card>}{filteredCampaigns.map(campaign => <Card key={campaign.id} className="p-5 border border-neutral-200 dark:border-neutral-800"><div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-lg font-black text-neutral-900 dark:text-white">{campaign.name}</h3><span className="px-2 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-black uppercase">{statusLabel[String(campaign.status)] || campaign.status}</span>{(campaign as any).brandName && <span className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-300 text-[10px] font-black uppercase">{(campaign as any).brandName}</span>}</div><p className="text-xs text-neutral-500 mt-1">{new Date(campaign.createdAt).toLocaleString()} · {campaign.networks?.join(', ')} · {campaign.posts?.length || 0} posts</p><p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2 line-clamp-2">{campaign.objective}</p></div><div className="flex gap-2 flex-wrap"><Button size="sm" onClick={() => loadCampaign(campaign)}>Abrir</Button><Button size="sm" variant="secondary" onClick={() => duplicateCampaign(campaign)}>Duplicar</Button><Button size="sm" variant="secondary" onClick={() => exportCampaign(campaign)}>JSON</Button><Button size="sm" variant="secondary" onClick={() => exportCampaignTxt(campaign)}>TXT</Button><Button size="sm" variant="secondary" onClick={() => archiveCampaign(campaign.id)}>Archivar</Button><Button size="sm" variant="ghost" onClick={() => deleteCampaign(campaign.id)}><Icon name="trash" className="w-4 h-4"/></Button></div></div></Card>)}</div></div>}

                {activeTab === 'contentCalendar' && <div>{renderFilters()}<div className="grid grid-cols-1 xl:grid-cols-3 gap-6"><div className="xl:col-span-1">{renderCalendarGrid()}</div><div className="xl:col-span-2 space-y-4"><h3 className="font-black text-lg">Publicaciones del {selectedCalendarDate}</h3>{selectedDayPosts.length === 0 && <Card className="p-8 text-center text-neutral-500">No hay posts para este día.</Card>}{selectedDayPosts.map(({ campaign, post }, idx) => renderPostCard(post as PostWithMedia, idx, campaign.id))}</div></div></div>}

                {activeTab === 'publishing' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Publicador Asistido</h3><div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-300"><p><strong>Meta Business Suite:</strong> copia el copy, abre el compositor, selecciona Facebook/Instagram, sube imagen/video, revisa preview y programa o publica.</p><p><strong>X:</strong> abre el compositor con texto prellenado cuando aplica. Para hilos, usa variantes A/B.</p><p><strong>LinkedIn:</strong> pega el texto, añade imagen/documento y usa tono profesional.</p><p><strong>TikTok/Reels/Shorts:</strong> usa guion, escenas, texto en pantalla y prompt de video.</p></div><div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => window.open(PLATFORM_URLS.Instagram, '_blank')}>Abrir Meta</Button><Button variant="secondary" onClick={() => window.open(PLATFORM_URLS.LinkedIn, '_blank')}>LinkedIn</Button><Button variant="secondary" onClick={() => window.open(PLATFORM_URLS.TikTok, '_blank')}>TikTok</Button><Button variant="secondary" onClick={() => window.open(PLATFORM_URLS.YouTube, '_blank')}>YouTube</Button></div></Card><Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Planificador de Pautas</h3><p className="text-sm text-neutral-500 mb-4">Cada campaña genera brief de pauta. Úsalo para estructurar objetivo, audiencia, presupuesto, creativos y métricas.</p><div className="space-y-3 text-sm"><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">1. Objetivo: mensajes, leads, tráfico o ventas.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">2. Audiencia: país, edad, intereses, comportamiento y exclusiones.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">3. Creativo: imagen/video claro, texto corto, CTA visible.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">4. Presupuesto: prueba pequeña, mide, duplica ganador.</div><div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900">5. Calendario: programa y activa recordatorio en Goatify.</div></div></Card></div>}

                {activeTab === 'guide' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Flujo recomendado</h3><ol className="text-sm space-y-2 text-neutral-600 dark:text-neutral-300 list-decimal list-inside"><li>Crea una marca en Centro de Marca.</li><li>Crea campaña y elige redes.</li><li>Revisa copy, prompt visual y guion.</li><li>Genera imagen si tu plan lo permite.</li><li>Agenda cada post.</li><li>Publica asistido y marca como publicado.</li></ol></Card><Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Ayúdame aquí</h3><p className="text-sm text-neutral-500">La guía contextual queda preparada para leer marca, campaña, post, red, estado, calendario y créditos disponibles. En esta V5 queda visible y lista para conectar con análisis de pantalla avanzado.</p></Card><Card className="p-6 border border-neutral-200 dark:border-neutral-800"><h3 className="text-xl font-black mb-3">Créditos</h3><p className="text-sm text-neutral-500">Generar campañas consume cupo social/IA. Generar imágenes consume cupo de media. Video real y análisis de pantalla se deben contar como acciones premium separadas cuando se conecten.</p></Card></div>}
            </div>
        </div>
    );
};

export default SocialMediaManager;
