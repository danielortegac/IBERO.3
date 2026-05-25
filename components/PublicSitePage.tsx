import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../firebaseConfig';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import Icon from './Icon';
import Spinner from './ui/Spinner';
import { UserProfile, PartnerLead, getPlanConfig, SUPER_ADMIN_EMAILS } from '../types';

interface PublicSitePageProps {
    siteId: string;
}

type PublishedFile = { name: string; code: string };

const normalizeFileName = (name: string = '') => name.split('?')[0].split('#')[0].split('/').pop()?.trim() || 'index.html';

const normalizePublishedFiles = (data: any): PublishedFile[] => {
    const rawFiles = Array.isArray(data?.files) ? data.files : [];
    const files = rawFiles
        .map((f: any) => ({ name: normalizeFileName(String(f?.name || 'index.html')), code: String(f?.code || '') }))
        .filter((f: PublishedFile) => f.name && f.code.trim().length > 0);

    if (files.length > 0) return files;
    if (typeof data?.htmlCode === 'string' && data.htmlCode.trim().length > 0) {
        return [{ name: normalizeFileName(data?.homeFileName || 'index.html'), code: data.htmlCode }];
    }
    return [];
};

const pickHomeFileName = (data: any, files: PublishedFile[]) => {
    const requested = normalizeFileName(data?.homeFileName || 'index.html');
    const exact = files.find(f => f.name.toLowerCase() === requested.toLowerCase());
    if (exact) return exact.name;
    return files.find(f => /^index\.html?$/i.test(f.name))?.name || files[0]?.name || 'index.html';
};

const emptySiteHtml = (brandName?: string) => `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${brandName || 'Sitio Goatify'}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:Inter,system-ui,sans-serif;color:#111827;">
  <main style="max-width:560px;padding:32px;text-align:center;">
    <h1 style="font-size:28px;margin:0 0 12px;">Sitio publicado sin contenido visible</h1>
    <p style="color:#6b7280;line-height:1.6;">El enlace existe, pero el archivo principal no tiene HTML guardado. Vuelve al Programador Web, revisa la vista previa y republica.</p>
  </main>
</body>
</html>`;

const PublicSitePage: React.FC<PublicSitePageProps> = ({ siteId }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [publishedFiles, setPublishedFiles] = useState<PublishedFile[]>([]);
    const [activeFileName, setActiveFileName] = useState<string>('index.html');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [siteData, setSiteData] = useState<any>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    const renderPublishedFile = useCallback((fileName: string, filesOverride?: PublishedFile[]) => {
        const files = filesOverride || publishedFiles;
        if (!files.length) return;
        const cleanName = normalizeFileName(fileName);
        const nextFile = files.find(f => f.name.toLowerCase() === cleanName.toLowerCase()) || files[0];
        setActiveFileName(nextFile.name);
        setHtmlContent(nextFile.code || emptySiteHtml());
    }, [publishedFiles]);

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
                            
                            setPublishedFiles([{ name: 'index.html', code }]);
                            setActiveFileName('index.html');
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

                    const files = normalizePublishedFiles(data);
                    if (!files.length) {
                        setPublishedFiles([{ name: 'index.html', code: emptySiteHtml(data.brandName) }]);
                        setActiveFileName('index.html');
                        setHtmlContent(emptySiteHtml(data.brandName));
                    } else {
                        const homeName = pickHomeFileName(data, files);
                        setPublishedFiles(files);
                        renderPublishedFile(homeName, files);
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
    }, [siteId, isAuthReady, renderPublishedFile]);

    // 3. HANDLERS DE MENSAJES
    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
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

    // 4. Navegación multipágina dentro del iframe publicado.
    useEffect(() => {
        const frame = iframeRef.current;
        if (!frame || !publishedFiles.length) return;

        const attachNavigation = () => {
            try {
                const doc = frame.contentDocument;
                if (!doc) return;
                const handler = (event: Event) => {
                    const target = event.target as HTMLElement | null;
                    const link = target?.closest?.('a') as HTMLAnchorElement | null;
                    if (!link) return;
                    const rawHref = link.getAttribute('href') || '';
                    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;
                    const isExternal = /^https?:\/\//i.test(rawHref) && !rawHref.includes(window.location.host);
                    if (isExternal || link.target === '_blank') return;
                    const candidate = normalizeFileName(rawHref);
                    const exists = publishedFiles.some(f => f.name.toLowerCase() === candidate.toLowerCase());
                    if (exists) {
                        event.preventDefault();
                        renderPublishedFile(candidate);
                    }
                };
                doc.addEventListener('click', handler);
            } catch (e) {
                console.warn('No se pudo activar navegación interna del sitio publicado:', e);
            }
        };

        frame.addEventListener('load', attachNavigation);
        return () => frame.removeEventListener('load', attachNavigation);
    }, [activeFileName, publishedFiles, renderPublishedFile]);

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
                ref={iframeRef}
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
