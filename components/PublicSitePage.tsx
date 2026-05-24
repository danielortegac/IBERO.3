
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { UserProfile, PartnerLead, getPlanConfig, SUPER_ADMIN_EMAILS } from '../types';

interface PublicSitePageProps {
    siteId: string;
}


type PublishedSiteFile = { name: string; code: string };

const normalizePublicFileName = (name: string = 'index.html') => {
    const clean = String(name || 'index.html').trim().replace(/^\/+/, '').split('/').pop() || 'index.html';
    return /\.html?$/i.test(clean) ? clean : `${clean}.html`;
};

const humanizePublicPageName = (name: string = 'index.html') => {
    const base = normalizePublicFileName(name)
        .replace(/\.html?$/i, '')
        .replace(/^index$/i, 'inicio')
        .replace(/[-_]+/g, ' ')
        .trim();
    return base
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') || 'Inicio';
};

const pickEntryFile = (files: PublishedSiteFile[] = [], entryFile?: string) => {
    const normalizedEntry = normalizePublicFileName(entryFile || 'index.html').toLowerCase();
    return files.find(file => normalizePublicFileName(file.name).toLowerCase() === normalizedEntry)
        || files.find(file => normalizePublicFileName(file.name).toLowerCase() === 'index.html')
        || files[0];
};

const buildRuntimeNavigation = (files: PublishedSiteFile[], currentName: string, brandName: string = 'Sitio Goatify') => {
    const pages = (files || [])
        .filter(file => file?.name && file?.code)
        .map(file => ({ name: normalizePublicFileName(file.name), label: humanizePublicPageName(file.name) }));
    if (pages.length <= 1) return '';
    const current = normalizePublicFileName(currentName);
    const safeBrand = String(brandName || 'Sitio Goatify').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const links = pages.map(page => `
        <a href="${page.name}" data-goatify-page-link="${page.name}" class="goatify-site-nav-link ${page.name === current ? 'is-active' : ''}">${page.label}</a>
    `).join('');
    return `
<!-- GOATIFY_MULTIPAGE_NAV_START -->
<style>
    :root { --goatify-nav-h: 74px; }
    body { padding-top: var(--goatify-nav-h) !important; }
    .goatify-site-nav {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000;
        min-height: var(--goatify-nav-h); display: flex; align-items: center; justify-content: space-between; gap: 18px;
        padding: 14px clamp(16px, 4vw, 42px); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: rgba(255,255,255,.88); border-bottom: 1px solid rgba(15,23,42,.08);
        box-shadow: 0 18px 55px rgba(15, 23, 42, .08); backdrop-filter: blur(22px); -webkit-backdrop-filter: blur(22px);
    }
    .goatify-site-nav-brand { display: flex; align-items: center; gap: 10px; min-width: 0; color: #0f172a; font-weight: 950; letter-spacing: -.04em; text-decoration: none; }
    .goatify-site-nav-brand::before { content: ''; width: 13px; height: 13px; border-radius: 999px; background: linear-gradient(135deg,#7c3aed,#ec4899,#f59e0b); box-shadow: 0 0 0 6px rgba(124,58,237,.12); flex: none; }
    .goatify-site-nav-brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 34vw; }
    .goatify-site-nav-links { display: flex; align-items: center; justify-content: flex-end; gap: 8px; overflow-x: auto; scrollbar-width: none; }
    .goatify-site-nav-links::-webkit-scrollbar { display: none; }
    .goatify-site-nav-link { color: #475569; text-decoration: none; font-size: 12px; line-height: 1; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; padding: 11px 13px; border-radius: 999px; border: 1px solid rgba(15,23,42,.07); background: rgba(248,250,252,.72); white-space: nowrap; transition: transform .18s ease, background .18s ease, color .18s ease, border-color .18s ease; }
    .goatify-site-nav-link:hover { transform: translateY(-1px); color: #6d28d9; border-color: rgba(109,40,217,.25); background: rgba(109,40,217,.08); }
    .goatify-site-nav-link.is-active { color: white; background: linear-gradient(135deg,#6d28d9,#9333ea,#db2777); border-color: transparent; box-shadow: 0 12px 30px rgba(109,40,217,.25); }
    @media (prefers-color-scheme: dark) {
        .goatify-site-nav { background: rgba(2,6,23,.84); border-bottom-color: rgba(255,255,255,.08); box-shadow: 0 18px 55px rgba(0,0,0,.35); }
        .goatify-site-nav-brand { color: #f8fafc; }
        .goatify-site-nav-link { color: #cbd5e1; border-color: rgba(255,255,255,.09); background: rgba(15,23,42,.72); }
        .goatify-site-nav-link:hover { color: #f5d0fe; background: rgba(168,85,247,.12); }
    }
    @media (max-width: 720px) {
        :root { --goatify-nav-h: 104px; }
        .goatify-site-nav { align-items: flex-start; flex-direction: column; padding: 13px 14px 12px; gap: 10px; }
        .goatify-site-nav-brand span { max-width: 82vw; }
        .goatify-site-nav-links { width: 100%; justify-content: flex-start; }
        .goatify-site-nav-link { font-size: 10px; padding: 10px 11px; }
    }
</style>
<nav class="goatify-site-nav" data-goatify-project-nav="true" aria-label="Navegación del sitio">
    <a class="goatify-site-nav-brand" href="index.html" data-goatify-page-link="index.html"><span>${safeBrand}</span></a>
    <div class="goatify-site-nav-links">${links}</div>
</nav>
<!-- GOATIFY_MULTIPAGE_NAV_END -->`;
};

const buildRuntimeNavigationScript = () => `
<script>
(function(){
    function resolveGoatifyPage(href){
        if(!href || href === '#' || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
        if(href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return null;
        var clean = href.split('#')[0].split('?')[0].split('/').pop();
        if(!clean) return null;
        if(!/\.html?$/i.test(clean)) clean = clean + '.html';
        return clean;
    }
    document.addEventListener('click', function(e){
        var link = e.target.closest && e.target.closest('a');
        if(!link) return;
        var target = link.getAttribute('data-goatify-page-link') || resolveGoatifyPage(link.getAttribute('href'));
        if(target){
            e.preventDefault();
            window.parent.postMessage({ type: 'GOATIFY_PUBLIC_SITE_NAVIGATE', file: target }, '*');
        }
    }, true);
})();
</script>`;

const injectRuntimeNavigation = (code: string, files: PublishedSiteFile[] = [], activeFileName: string = 'index.html', brandName?: string) => {
    if (!code) return '';
    const cleaned = code.replace(/<!-- GOATIFY_MULTIPAGE_NAV_START -->[\s\S]*?<!-- GOATIFY_MULTIPAGE_NAV_END -->/g, '');
    const nav = buildRuntimeNavigation(files, activeFileName, brandName);
    const script = buildRuntimeNavigationScript();
    let finalCode = cleaned;
    if (nav && /<body[^>]*>/i.test(finalCode)) {
        finalCode = finalCode.replace(/<body([^>]*)>/i, `<body$1>\n${nav}`);
    } else if (nav) {
        finalCode = `${nav}\n${finalCode}`;
    }
    if (/<\/body>/i.test(finalCode)) {
        finalCode = finalCode.replace(/<\/body>/i, `${script}\n</body>`);
    } else {
        finalCode += script;
    }
    return finalCode;
};

const PublicSitePage: React.FC<PublicSitePageProps> = ({ siteId }) => {
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [siteData, setSiteData] = useState<any>(null);
    const [activeFileName, setActiveFileName] = useState('index.html');
    const [isAuthReady, setIsAuthReady] = useState(false);

    // 1. GESTIÓN DE SESIÓN: Esperar a que la sesión anónima esté lista antes de pedir datos
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signInAnonymously(auth);
                } catch (err) {
                    console.error("Error en autenticación anónima:", err);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // 2. CARGA DEL CONTENIDO: Solo cuando isAuthReady es true
    useEffect(() => {
        if (!isAuthReady) return;

        const fetchContent = async () => {
            try {
                const siteRef = doc(db, 'published_sites', siteId);
                const siteSnap = await getDoc(siteRef);

                if (!siteSnap.exists()) {
                    setError('Sitio no encontrado.');
                    setLoading(false);
                    return;
                }

                const data = siteSnap.data();
                setSiteData(data);

                if (data.isPartnerSite && data.leadId) {
                    const leadRef = doc(db, 'partnerLeads', data.leadId);
                    
                    const unsubLead = onSnapshot(leadRef, (leadSnap) => {
                        if (leadSnap.exists()) {
                            const leadData = leadSnap.data() as PartnerLead;
                            let code = data.htmlCode;
                            
                            let initialStep = 1;
                            if (leadData.contractSigned) initialStep = 3;
                            else if (leadData.preInvoicePaid) initialStep = 3;
                            else if (leadData.proposalApproved) initialStep = 2;

                            const signedStatus = !!leadData.contractSigned;
                            const signatureName = leadData.clientRepresentative || '';
                            
                            code = code.replace(/let currentStep = \d+;/, `let currentStep = ${initialStep};`);
                            code = code.replace(/let isAlreadySigned = (true|false);/, `let isAlreadySigned = ${signedStatus};`);
                            code = code.replace(/let clientSignature = ".*?";/, `let clientSignature = "${signatureName}";`);
                            
                            setHtmlContent(code);
                            setLoading(false);
                        }
                    });
                    return () => unsubLead();
                } else {
                    if (data.active === false) {
                        setError('Este sitio fue despublicado por su propietario.');
                        setHtmlContent(null);
                        setLoading(false);
                        return;
                    }

                    // Verificación de plan coherente con los cupos publicados:
                    // Free = 1 sitio, Pro = 10 sitios, Premium = 30 sitios.
                    // Ya no se exige Premium para ver un sitio si el plan actual permite el cupo.
                    if (data.ownerId && !data.isPartnerSite) {
                        const userRef = doc(db, 'users', data.ownerId);
                        const userSnap = await getDoc(userRef);
                        if (userSnap.exists()) {
                            const userData = userSnap.data() as UserProfile;
                            const ownerEmail = String(userData.email || '').toLowerCase();
                            const isSuperAdminOwner = SUPER_ADMIN_EMAILS.includes(ownerEmail);
                            const ownerSuspended = Boolean((userData as any).suspended || (userData as any).isSuspended || (userData as any).accountStatus === 'suspended');
                            if (ownerSuspended) {
                                setError('Este sitio no está disponible temporalmente.');
                                setHtmlContent(null);
                                setLoading(false);
                                return;
                            }

                            if (!isSuperAdminOwner) {
                                const effectivePlan = userData.subscriptionStatus === 'canceled' ? 'free' : (userData.plan || 'free');
                                const publishLimit = Number((getPlanConfig(effectivePlan).limits as any).publish_sites || 0);
                                if (publishLimit <= 0) {
                                    setError('El plan actual del propietario no permite sitios publicados.');
                                    setHtmlContent(null);
                                    setLoading(false);
                                    return;
                                }

                                const sitesSnap = await getDocs(query(collection(db, 'published_sites'), where('ownerId', '==', data.ownerId)));
                                const activeSites = sitesSnap.docs
                                    .map(d => ({ id: d.id, ...(d.data() as any) }))
                                    .filter(site => site.active !== false)
                                    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
                                const allowedSiteIds = new Set(activeSites.slice(0, publishLimit).map(site => site.id));
                                if (!allowedSiteIds.has(siteId)) {
                                    setError(`Este sitio excede el cupo actual del propietario (${publishLimit} sitio${publishLimit === 1 ? '' : 's'}).`);
                                    setHtmlContent(null);
                                    setLoading(false);
                                    return;
                                }
                            }
                        }
                    }

                    if (Array.isArray(data.files) && data.files.length > 0) {
                        const files = data.files as PublishedSiteFile[];
                        const entry = pickEntryFile(files, data.entryFile);
                        const entryName = normalizePublicFileName(entry?.name || 'index.html');
                        setActiveFileName(entryName);
                        setHtmlContent(injectRuntimeNavigation(entry?.code || '', files, entryName, data.brandName));
                    } else {
                        setHtmlContent(data.htmlCode);
                    }
                    setLoading(false);
                }
            } catch (e: any) {
                console.error("Error cargando sitio público:", e);
                setError('No se pudo establecer conexión con el servidor de contenidos.');
                setLoading(false);
            }
        };

        fetchContent();
    }, [siteId, isAuthReady]);

    useEffect(() => {
        if (!siteData || !Array.isArray(siteData.files) || siteData.files.length === 0) return;
        const files = siteData.files as PublishedSiteFile[];
        const targetName = normalizePublicFileName(activeFileName);
        const target = files.find(file => normalizePublicFileName(file.name).toLowerCase() === targetName.toLowerCase()) || pickEntryFile(files, siteData.entryFile);
        if (target?.code) {
            setHtmlContent(injectRuntimeNavigation(target.code, files, normalizePublicFileName(target.name), siteData.brandName));
        }
    }, [activeFileName, siteData]);

    // 3. HANDLERS DE MENSAJES
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            if (event.data?.type === 'GOATIFY_PUBLIC_SITE_NAVIGATE' && event.data?.file) {
                setActiveFileName(normalizePublicFileName(event.data.file));
                return;
            }
            if (!siteData) return;
            if (event.data?.type === 'CLIENT_SITE_FINAL_APPROVAL' || 
                event.data?.type === 'LEAD_CHANGE_REQUEST_STATUS' ||
                event.data?.type === 'LEAD_CHANGE_REQUEST' ||
                event.data?.type === 'TALK_TO_AGENT') {
                const { handlePublicSiteMessage } = await import('../services/publicSiteService');
                handlePublicSiteMessage(event, siteData);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [siteData]);

    if (loading && !htmlContent) {
        return (
            <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#050505]">
                <Spinner text="Conexión Directa..." className="text-white/20" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 text-center">
                <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
                    <Icon name="close" className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-4">Acceso Restringido</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
                    <a href="https://ia.goatify.app" className="text-brand-primary font-bold hover:underline">Regresar a Goatify IA</a>
                </div>
            </div>
        );
    }

    return (
        <div className="w-screen h-screen bg-white relative overflow-hidden">
             <iframe
                key={`${siteId}-${activeFileName}`}
                title="Goatify Secure Site"
                srcDoc={htmlContent || ''}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads"
            />
        </div>
    );
};

export default PublicSitePage;
