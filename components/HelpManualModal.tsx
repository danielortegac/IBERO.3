
import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import Button from './ui/Button';
import { AppContext } from '../context/AppContext';
import jsPDF from 'jspdf';
import Modal from './ui/Modal';
import { useTranslation } from '../hooks/useTranslation';

interface HelpManualModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ManualSection {
    id: string;
    title: string;
    icon: React.ComponentProps<typeof Icon>['name'];
    color: string;
    bgColor: string;
    content: string;
    actionLabel?: string;
    actionLink?: string;
}

const HelpManualModal: React.FC<HelpManualModalProps> = ({ isOpen, onClose }) => {
    const { setCurrentView, setProModalOpen, setToastNotification, userProfile } = useContext(AppContext);
    const { t } = useTranslation();
    const [activeSectionId, setActiveSectionId] = useState('intro');
    const contentRef = useRef<HTMLDivElement>(null);
    const printRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isSurveyOpen, setIsSurveyOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const SECTIONS: ManualSection[] = useMemo(() => [
        { id: 'intro', title: t('manualIntroTitle'), icon: 'goat', color: 'text-brand-primary', bgColor: 'bg-brand-primary/10', content: t('manualIntroContent'), actionLabel: t('manualExploreDashboard'), actionLink: "dashboard" },
        { id: 'projects_deep', title: t('manualProjectsTitle'), icon: 'projects', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/20', content: t('manualProjectsContent'), actionLabel: t('manualCreateProject'), actionLink: "projects" },
        { id: 'global_calendar', title: t('manualCalendarTitle'), icon: 'calendar', color: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/20', content: t('manualCalendarContent'), actionLabel: t('manualViewAgenda'), actionLink: "globalCalendar" },
        { id: 'ai_studio_creative', title: t('manualCreativeTitle'), icon: 'image', color: 'text-pink-600', bgColor: 'bg-pink-100 dark:bg-pink-900/20', content: t('manualCreativeContent'), actionLabel: t('manualGoMedia'), actionLink: "aiStudio/mediaGenerator" },
        { id: 'ai_studio_tech', title: t('manualTechTitle'), icon: 'code', color: 'text-cyan-600', bgColor: 'bg-cyan-100 dark:bg-cyan-900/20', content: t('manualTechContent'), actionLabel: t('manualTryWeb'), actionLink: "aiStudio/webProgrammer" },
        { id: 'ai_studio_business', title: t('manualBusinessTitle'), icon: 'monitor', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/20', content: t('manualBusinessContent'), actionLabel: t('manualCreatePres'), actionLink: "aiStudio/presentations" },
        { id: 'agents', title: t('manualAgentsTitle'), icon: 'agent', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/20', content: t('manualAgentsContent'), actionLabel: t('manualConfigAgent'), actionLink: "aiStudio/agents" },
        { id: 'voice_shivo', title: t('manualVoiceTitle'), icon: 'mic', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/20', content: t('manualVoiceContent'), actionLabel: t('manualTryShivo'), actionLink: "dashboard" },
        { id: 'hub_community', title: t('manualHubTitle'), icon: 'hub', color: 'text-indigo-600', bgColor: 'bg-indigo-100 dark:bg-indigo-900/20', content: t('manualHubContent'), actionLabel: t('manualGoHub'), actionLink: "hub" },
        { id: 'economy', title: t('manualEconomyTitle'), icon: 'wallet', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/20', content: t('manualEconomyContent'), actionLabel: t('manualViewWallet'), actionLink: "wallet" },
        { id: 'benefits', title: t('manualSynergyTitle'), icon: 'star', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/20', content: t('manualSynergyContent'), actionLabel: t('manualUpgradePro'), actionLink: "pro_modal" },
        { id: 'pricing', title: t('manualPricingTitle'), icon: 'upgrade', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/20', content: t('manualPricingContent'), actionLabel: t('manualViewPlans'), actionLink: "pro_modal" },
        { id: 'publish_article', title: t('manualArticlesTitle'), icon: 'edit', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/20', content: t('manualArticlesContent'), actionLabel: t('manualWriteArticle'), actionLink: "discovery" },
        { id: 'security_support', title: t('manualSecurityTitle'), icon: 'security', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800', content: t('manualSecurityContent'), actionLabel: t('manualContactSupport'), actionLink: "hub" },
        { id: 'pos_inventory', title: t('manualPOSTitle'), icon: 'market', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/20', content: t('manualPOSContent'), actionLabel: t('manualGoPOS'), actionLink: "dashboard" },
        { id: 'terms_conditions', title: t('manualTermsTitle'), icon: 'book', color: 'text-black dark:text-white', bgColor: 'bg-gray-200 dark:bg-gray-700', content: t('manualTermsContent'), actionLabel: t('manualReadAccept'), actionLink: "accept_terms" }
    ], [t]);
    
    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [activeSectionId]);

    const handleSectionChange = (id: string) => {
        setActiveSectionId(id);
    };

    const handleCancelSubscription = () => {
        if (userProfile.plan === 'free') {
            setToastNotification({
                title: "Plan Gratuito",
                message: "Actualmente no tienes una suscripción activa para cancelar.",
                icon: "info"
            });
            setIsSurveyOpen(false);
        } else {
            setIsSurveyOpen(false);
            window.open('https://www.paypal.com/myaccount/autopay/', '_blank');
            setToastNotification({
                title: "Gestión de Pagos",
                message: "Redirigiendo a PayPal para gestionar tu suscripción...",
                icon: "wallet",
                isLoading: true
            });
            onClose();
        }
    };

    const handleNavigation = (link: string) => {
        if (link === 'accept_terms') return;
        
        if (link === 'cancel_sub') {
            setIsSurveyOpen(true);
            return;
        }
        
        onClose();
        if (link === 'pro_modal') {
            setProModalOpen(true);
            return;
        }
        const parts = link.split('/');
        const view = parts[0];
        
        if (view === 'dashboard') setCurrentView('dashboard');
        if (view === 'projects') setCurrentView('projects');
        if (view === 'globalCalendar') setCurrentView('globalCalendar');
        if (view === 'aiStudio') {
            setCurrentView('aiStudio');
            if (parts[1]) window.location.hash = `aiStudio/${parts[1]}`;
        }
        if (view === 'hub') setCurrentView('hub');
        if (view === 'wallet') setCurrentView('wallet');
        if (view === 'discovery') setCurrentView('discovery'); 
        
        window.location.hash = link;
    };
    
    const handleAcceptTerms = () => {
        setTermsAccepted(true);
        setToastNotification({
            title: "Términos Aceptados",
            message: "Has aceptado los términos y condiciones.",
            icon: "check"
        });
    }

    const handleDownloadPDF = async () => {
        if (!window.html2canvas || !printRef.current) {
            alert("Librería de exportación no cargada.");
            return;
        }
        setIsExporting(true);
        setToastNotification({ title: "Generando PDF", message: "Preparando manual completo...", icon: "upload", isLoading: true });
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const imgWidth = 210; 
            
            const contentNodes = printRef.current.children;
            for (let i = 0; i < contentNodes.length; i++) {
                const node = contentNodes[i] as HTMLElement;
                const canvas = await window.html2canvas(node, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 1200 });
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            }
            pdf.save("Goatify_Manual_Maestro_v2.5.pdf");
            setToastNotification({ title: "Listo", message: "Manual descargado.", icon: "check" });
        } catch (error) {
            console.error("PDF Export Error", error);
            alert("Hubo un error generando el PDF.");
        } finally { setIsExporting(false); }
    };

    const activeSection = SECTIONS.find(s => s.id === activeSectionId);

    const renderPricingTable = () => (
        <div className="overflow-x-auto my-6 shadow-sm rounded-lg border border-neutral-200">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="bg-neutral-100">
                        <th className="p-3 border-b border-neutral-200 font-extrabold text-gray-900">Plan</th>
                        <th className="p-3 border-b border-neutral-200 text-gray-900">Start ($0)</th>
                        <th className="p-3 border-b border-neutral-200 text-brand-primary font-bold">Pro ($6/mo)</th>
                        <th className="p-3 border-b border-neutral-200 text-purple-600 font-bold">Premium ($12/mo)</th>
                    </tr>
                </thead>
                <tbody className="text-gray-700">
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('featureProjects')}</td><td className="p-3 border-b border-neutral-200">{t('featureProjectsLimit')}</td><td className="p-3 border-b border-neutral-200 font-bold">{t('unlimited')}</td><td className="p-3 border-b border-neutral-200 font-bold">{t('unlimited')}</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('featureAiQueries')}</td><td className="p-3 border-b border-neutral-200">{t('featureAiQueriesFree')}</td><td className="p-3 border-b border-neutral-200">{t('featureAiQueriesPro')}</td><td className="p-3 border-b border-neutral-200">{t('featureAiQueriesPremium')}</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('featureMediaGeneration')}</td><td className="p-3 border-b border-neutral-200">{t('featureMediaGenerationFree')}</td><td className="p-3 border-b border-neutral-200">{t('featureMediaGenerationPro')}</td><td className="p-3 border-b border-neutral-200">{t('featureMediaGenerationPremium')}</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">Video Insights</td><td className="p-3 border-b border-neutral-200">1 Créd. Medios</td><td className="p-3 border-b border-neutral-200">1 Créd. Medios</td><td className="p-3 border-b border-neutral-200">1 Créd. Medios</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">Audio Tools</td><td className="p-3 border-b border-neutral-200">1 Créd. Chat</td><td className="p-3 border-b border-neutral-200">1 Créd. Chat</td><td className="p-3 border-b border-neutral-200">1 Créd. Chat</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('featureAISalesAgent')}</td><td className="p-3 border-b border-neutral-200">{t('featureAISalesAgentFree')}</td><td className="p-3 border-b border-neutral-200">{t('featureAISalesAgentPro')}</td><td className="p-3 border-b border-neutral-200">{t('featureAISalesAgentPremium')}</td></tr>
                     <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('featureWebProgrammer')}</td><td className="p-3 border-b border-neutral-200">10</td><td className="p-3 border-b border-neutral-200">120</td><td className="p-3 border-b border-neutral-200">350</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('storage')}</td><td className="p-3 border-b border-neutral-200">1 GB</td><td className="p-3 border-b border-neutral-200">10 GB</td><td className="p-3 border-b border-neutral-200">50 GB</td></tr>
                    <tr><td className="p-3 border-b border-neutral-200 font-semibold">{t('publishSites')}</td><td className="p-3 border-b border-neutral-200">-</td><td className="p-3 border-b border-neutral-200">Hasta 10 sitios</td><td className="p-3 border-b border-neutral-200 font-bold">{t('upto30Sites')}</td></tr>
                </tbody>
            </table>
        </div>
    );

    const renderContent = (text: string) => {
        const lines = text.split('\n');
        return lines.map((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={index} className="h-3" />;
            if (trimmed === '<<<PRICING_TABLE>>>') return <React.Fragment key={index}>{renderPricingTable()}</React.Fragment>;
            
            if (trimmed.includes('<<<CANCEL_LINK>>>')) {
                const parts = trimmed.split('<<<CANCEL_LINK>>>');
                return (
                    <p key={index} className="mb-3 text-neutral-600 dark:text-neutral-300 text-sm leading-relaxed text-justify">
                        {parts[0]}
                        <button 
                            onClick={() => handleNavigation('cancel_sub')} 
                            className="text-red-500 font-bold underline hover:text-red-700 cursor-pointer mx-1 inline-flex items-center gap-1"
                        >
                             cancelar tu suscripción
                        </button>
                        {parts[1]}
                    </p>
                );
            }

            if (trimmed.startsWith('### ')) return <h3 key={index} className="text-xl font-bold text-neutral-900 dark:text-white mt-6 mb-3 pb-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2"><span className="w-1.5 h-6 bg-brand-primary rounded-full inline-block"></span>{trimmed.replace('### ', '')}</h3>;
            if (trimmed.startsWith('**') && trimmed.endsWith('**')) return <p key={index} className="font-bold text-sm text-brand-primary mt-4 mb-1 uppercase tracking-wider">{trimmed.replace(/\*\*/g, '')}</p>;
            if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\./.test(trimmed)) {
                const content = trimmed.replace(/^[\*\-\d\.]+\s*/, '');
                const boldParts = content.split(/(\*\*.*?\*\*)/g);
                return <li key={index} className="flex items-start gap-3 ml-2 mb-2 text-neutral-700 dark:text-neutral-300 text-sm leading-relaxed"><div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0"></div><span>{boldParts.map((part, i) => { if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-neutral-900 dark:text-white font-bold">{part.slice(2, -2)}</strong>; return <span key={i}>{part}</span>; })}</span></li>;
            }
            const boldParts = trimmed.split(/(\*\*.*?\*\*)/g);
            return <p key={index} className="mb-3 text-neutral-600 dark:text-neutral-300 text-sm leading-relaxed text-justify">{boldParts.map((part, i) => { if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-neutral-900 dark:text-white font-bold">{part.slice(2, -2)}</strong>; return <span key={i}>{part}</span>; })}</p>;
        });
    };

    if (!isOpen) return null;
    
    const TermsSection: React.FC<{ onAccept: () => void }> = ({ onAccept }) => {
        const [accepted, setAccepted] = useState(false);
        const { t } = useTranslation();
    
        const handleAccept = () => {
            setAccepted(true);
            setTimeout(() => {
                onAccept();
            }, 1000);
        };
    
        if (accepted) {
            return (
                <div className="p-6 bg-green-100 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800 text-center animate-fade-in">
                    <Icon name="check" className="w-12 h-12 text-green-500 mx-auto mb-2"/>
                    <h3 className="text-xl font-bold text-green-700 dark:text-green-400">{t('manualTermsAcceptedTitle') || "¡Términos Aceptados!"}</h3>
                    <p className="text-sm text-green-600 dark:text-green-300">{t('manualTermsAcceptedDesc') || "Gracias por ser parte de la comunidad."}</p>
                </div>
            );
        }
    
        return (
            <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-start gap-3 mb-4">
                    <input type="checkbox" id="terms-check" className="mt-1 w-5 h-5 text-brand-primary rounded focus:ring-brand-primary cursor-pointer" onChange={(e) => e.target.checked ? handleAccept() : null} />
                    <label htmlFor="terms-check" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                        {t('manualReadAccept')}
                    </label>
                </div>
                <Button onClick={handleAccept} className="w-full shadow-lg" disabled={false}>
                    {t('manualReadAccept')}
                </Button>
            </div>
        );
    };
    
    const CancellationSurveyModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void }> = ({ isOpen, onClose, onConfirm }) => {
        const [reason, setReason] = useState('');
        
        if (!isOpen) return null;
    
        return (
            <div className="fixed inset-0 z-[999999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-white/10">
                    <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
                        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Lamentamos que te vayas</h3>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><Icon name="close" className="w-5 h-5"/></button>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="bg-neutral-50 dark:bg-neutral-800 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                            <h4 className="font-bold mb-3 text-sm text-neutral-700 dark:text-neutral-300">Ayúdanos a mejorar. ¿Cuál es el motivo principal?</h4>
                            <div className="space-y-2">
                                {['Costo elevado', 'No lo uso suficiente', 'Faltan funciones', 'Encontré otra alternativa', 'Otro motivo'].map((opt) => (
                                    <label key={opt} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-neutral-900 rounded-lg cursor-pointer transition-colors">
                                        <input 
                                            type="radio" 
                                            name="cancellationReason" 
                                            value={opt} 
                                            checked={reason === opt}
                                            onChange={() => setReason(opt)}
                                            className="text-brand-primary focus:ring-brand-primary"
                                        />
                                        <span className="text-sm">{opt}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
    
                        <div className="flex flex-col gap-3">
                            <Button 
                                onClick={onConfirm} 
                                disabled={!reason}
                                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg border-none"
                            >
                                Confirmar Cancelación
                            </Button>
                            <Button variant="ghost" onClick={onClose} className="text-sm">
                                Mantener mi suscripción
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!isOpen || !mounted) return null;

    const modalContent = (
        <div className="fixed inset-0 z-[99999999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <CancellationSurveyModal isOpen={isSurveyOpen} onClose={() => setIsSurveyOpen(false)} onConfirm={handleCancelSubscription} />
            
            {/* HIDDEN PRINT CONTAINER */}
            <div ref={printRef} style={{ position: 'absolute', top: isExporting ? 0 : -9999, left: isExporting ? 0 : -9999, width: '800px', zIndex: -1, background: '#ffffff', color: '#000000', fontFamily: 'sans-serif' }}>
                <div className="p-20 min-h-[1123px] flex flex-col justify-center items-center text-center bg-gradient-to-br from-gray-50 to-white border-b-8 border-brand-primary box-border">
                    <div className="p-6 bg-brand-primary/10 rounded-full mb-10">
                         <Icon name="goat" className="w-32 h-32 text-brand-primary" />
                    </div>
                    <h1 className="text-6xl font-black text-gray-900 mb-4 tracking-tight">{t('manualTitle')}</h1>
                    <h2 className="text-3xl text-brand-primary font-bold mb-8 uppercase tracking-widest">{t('manualSubtitle')}</h2>
                    <div className="w-24 h-2 bg-gray-200 rounded-full mb-8"></div>
                    <p className="text-gray-500 text-xl max-w-md">La guía definitiva para dominar tu ecosistema de productividad.</p>
                    <div className="mt-auto text-sm text-gray-400 font-mono">Generado el {new Date().toLocaleDateString()}</div>
                </div>
                
                {SECTIONS.map(section => (
                    <div key={section.id} className="p-16 min-h-[1123px] bg-white border-b border-gray-100 box-border page-break relative">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand-primary to-purple-500"></div>
                        <div className="flex items-center gap-6 mb-12 border-b border-gray-200 pb-6">
                            <div className={`p-5 rounded-2xl shadow-sm bg-gray-100 text-brand-primary`}>
                                <Icon name={section.icon as any} className="w-12 h-12" />
                            </div>
                            <h2 className="text-4xl font-bold text-gray-900">{section.title}</h2>
                        </div>
                        <div className="text-gray-800 text-lg leading-relaxed space-y-4">
                            {section.content.split('\n').map((line, i) => { 
                                const trimmed = line.trim();
                                if (!trimmed) return <div key={i} className="h-4"></div>;
                                if(trimmed.includes('<<<PRICING_TABLE>>>')) return <div key={i} className="my-8">{renderPricingTable()}</div>;
                                if (trimmed.includes('<<<CANCEL_LINK>>>')) return null; 
                                if (trimmed.startsWith('### ')) return <h3 key={i} className="text-2xl font-bold text-brand-primary mt-8 mb-4 border-l-4 border-brand-primary pl-4">{trimmed.replace('### ', '')}</h3>;
                                if (trimmed.startsWith('**') && trimmed.endsWith('**')) return <p key={i} className="font-bold text-base text-gray-500 mt-6 mb-2 uppercase tracking-wider">{trimmed.replace(/\*\*/g, '')}</p>;
                                if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || /^\d+\./.test(trimmed)) {
                                    const content = trimmed.replace(/^[\*\-\d\.]+\s*/, '');
                                    return (
                                        <div key={i} className="flex items-start gap-3 ml-4 mb-2">
                                            <div className="mt-2 w-2 h-2 rounded-full bg-brand-primary flex-shrink-0"></div>
                                            <span className="text-gray-700">{content.replace(/\*\*/g, '')}</span>
                                        </div>
                                    );
                                }
                                return <p key={i} className="mb-3 text-justify">{line.replace(/\*\*/g, '')}</p>
                            })}
                        </div>
                        <div className="absolute bottom-8 left-16 right-16 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
                            Goatify IA - Documentación Oficial
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white dark:bg-dark-surface w-full h-full sm:h-[95vh] sm:w-[95vw] sm:max-w-[1600px] sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden relative ring-1 ring-white/10 lg:fixed lg:inset-0 lg:max-w-none lg:h-full lg:w-full lg:rounded-none lg:z-[99999999]">
                <div className="flex-none flex justify-between items-center p-4 sm:p-5 border-b border-light-border dark:border-dark-border bg-white dark:bg-dark-surface z-10">
                    <div className="flex items-center gap-4"><div className="bg-brand-primary p-2.5 rounded-xl shadow-lg shadow-brand-primary/30"><Icon name="brain" className="w-6 h-6 text-white"/></div><div><h2 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t('manualTitle')}</h2><p className="text-xs text-neutral-500 font-bold uppercase tracking-wider hidden sm:block">{t('manualSubtitle')}</p></div></div>
                    <div className="flex gap-3"><Button onClick={handleDownloadPDF} disabled={isExporting} variant="secondary" className="flex gap-2 shadow-sm bg-neutral-100 hover:bg-neutral-200 text-xs h-9">{isExporting ? t('generating') : <><Icon name="upload" className="w-4 h-4"/> PDF</>}</Button><button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500 hover:text-red-500"><Icon name="close" className="w-6 h-6" /></button></div>
                </div>
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                    <div className="lg:w-80 bg-neutral-50 dark:bg-[#121212] border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 flex-shrink-0 overflow-x-auto lg:overflow-y-auto custom-scrollbar p-3 flex lg:block gap-2 lg:space-y-1">
                        {SECTIONS.map(section => (<button key={section.id} onClick={() => handleSectionChange(section.id)} className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left group w-full min-w-[240px] lg:min-w-0 ${activeSectionId === section.id ? 'bg-white dark:bg-dark-surface shadow-md ring-1 ring-black/5 dark:ring-white/5 translate-x-1' : 'hover:bg-white/50 dark:hover:bg-white/5 text-neutral-500'}`}><div className={`p-2 rounded-lg ${section.bgColor} ${section.color} transition-transform group-hover:scale-110 shadow-sm flex-shrink-0`}><Icon name={section.icon as any} className="w-4 h-4"/></div><div className="min-w-0 flex-1"><span className={`block font-bold text-xs sm:text-sm truncate ${activeSectionId === section.id ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>{section.title}</span></div>{activeSectionId === section.id && (<div className="w-1.5 h-1.5 rounded-full bg-brand-primary hidden lg:block"></div>)}</button>))}
                    </div>
                    <div ref={contentRef} className="flex-1 overflow-y-auto p-6 sm:p-12 bg-white dark:bg-dark-surface relative scroll-smooth custom-scrollbar">
                        {activeSection && (
                            <div className="animate-fade-in max-w-5xl mx-auto pb-32">
                                <div className="flex items-center gap-6 mb-8 border-b border-neutral-100 dark:border-neutral-800 pb-6">
                                    <div className={`p-5 rounded-2xl shadow-xl ${activeSection.bgColor} hidden sm:block transform rotate-3`}><Icon name={activeSection.icon as any} className={`w-12 h-12 ${activeSection.color}`}/></div>
                                    <div><h2 className="text-3xl sm:text-4xl font-black text-neutral-900 dark:text-white mb-2 leading-tight">{activeSection.title.replace(/^\d+\.\s/, '')}</h2><p className="text-sm text-neutral-500">v2.5 • Guía Interactiva Completa</p></div>
                                </div>
                                <div className="prose dark:prose-invert max-w-none columns-1 lg:columns-1 gap-12">{renderContent(activeSection.content)}</div>
                                
                                {/* Support Buttons for Section 14 */}
                                {activeSection.id === 'security_support' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                                        <a href="https://wa.me/19125715145" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 bg-[#25D366] text-white py-3 rounded-xl font-bold shadow-md hover:bg-[#128C7E] transition-colors">
                                            <Icon name="phone" className="w-5 h-5"/> WhatsApp Directo
                                        </a>
                                        <a href="mailto:info@goatify.app" className="flex items-center justify-center gap-3 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-colors">
                                            <Icon name="mail" className="w-5 h-5"/> Soporte Email
                                        </a>
                                    </div>
                                )}
                                
                                {/* Terms Acceptance for Section 15 */}
                                {activeSection.id === 'terms_conditions' && !termsAccepted && (
                                    <TermsSection onAccept={handleAcceptTerms} />
                                )}
                                {activeSection.id === 'terms_conditions' && termsAccepted && (
                                    <div className="mt-8 p-6 bg-green-100 dark:bg-green-900/30 rounded-xl border border-green-200 dark:border-green-800 text-center animate-fade-in">
                                        <Icon name="check" className="w-12 h-12 text-green-500 mx-auto mb-2"/>
                                        <h3 className="text-xl font-bold text-green-700 dark:text-green-400">{t('manualTermsAcceptedTitle') || "¡Términos Aceptados!"}</h3>
                                    </div>
                                )}

                                {activeSection.actionLink && activeSection.id !== 'security_support' && activeSection.id !== 'terms_conditions' && (
                                    <div className="mt-12 p-1 bg-gradient-to-r from-brand-primary to-purple-600 rounded-2xl shadow-lg animate-scale-in">
                                        <div className="bg-white dark:bg-dark-surface rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                                            <div><h4 className="font-bold text-xl mb-1 text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-purple-600">Pasa a la Acción</h4><p className="text-neutral-500 text-sm max-w-md">Ya tienes el conocimiento. Ahora usa la herramienta para escalar tu negocio.</p></div>
                                            <Button onClick={() => handleNavigation(activeSection.actionLink!)} className="bg-brand-primary text-white hover:bg-brand-secondary border-none px-8 py-3 text-base shadow-lg font-bold whitespace-nowrap transform hover:scale-105 transition-transform w-full sm:w-auto">{activeSection.actionLabel || "Ir Ahora"} <Icon name="arrowRight" className="w-4 h-4 ml-2"/></Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default HelpManualModal;
