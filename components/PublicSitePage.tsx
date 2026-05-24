
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

const PublicSitePage: React.FC<PublicSitePageProps> = ({ siteId }) => {
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [siteData, setSiteData] = useState<any>(null);
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

                    setHtmlContent(data.htmlCode);
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
                key={siteId}
                title="Goatify Secure Site"
                srcDoc={htmlContent || ''}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-popups allow-downloads"
            />
        </div>
    );
};

export default PublicSitePage;
