import React, { useState, useEffect, useRef, useContext } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { AiStudioView } from '../types';
import Icon from './Icon';
import AiAgent from './AiAgent';
import ImageEditor from './ImageEditor';
import VideoInsights from './VideoInsights';
import AudioTools from './AudioTools';
import LiveConversation from './LiveConversation';
import AdvancedChat from './AdvancedChat';
import MediaGenerator from './MediaGenerator';
import WebProgrammer from './WebProgrammer';
import FormBuilder from './FormBuilder';
import PresentationBuilder from './PresentationBuilder'; 
import SocialMediaManager from './SocialMediaManager'; 
import { useSwipe } from '../hooks/useSwipe';
import PlanCreditBadge from './PlanCreditBadge';

const AiStudio: React.FC = () => {
    const { t } = useTranslation();
    const { setIsFullScreenActive } = useContext(AppContext);
    const [activeTool, setActiveTool] = useState<AiStudioView>('chat');
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(() => {
        const isDesktop = window.innerWidth >= 1024;
        if (isDesktop) return true;
        return window.location.hash === '#aiStudio';
    });
    
    const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
    const [isModuleFullScreen, setIsModuleFullScreen] = useState(false);
    const submenuRef = useRef<HTMLElement>(null);

    useEffect(() => {
        setIsFullScreenActive(isModuleFullScreen);
        return () => setIsFullScreenActive(false);
    }, [isModuleFullScreen, setIsFullScreenActive]);

    useEffect(() => {
        const handleInteraction = (event: any) => {
            if (event.detail?.open !== undefined) {
                setIsSubmenuOpen(event.detail.open);
            }
        };
        window.addEventListener('toggleSubmenu', handleInteraction);
        return () => window.removeEventListener('toggleSubmenu', handleInteraction);
    }, []);

    const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
        onSwipedRight: () => { if (!isSubmenuOpen && window.innerWidth < 1024) setIsSubmenuOpen(true); else if ((window as any).openMainSidebar) (window as any).openMainSidebar(); },
        onSwipedLeft: () => { if (isSubmenuOpen && window.innerWidth < 1024) setIsSubmenuOpen(false); }
    });
    
    const tools: { id: AiStudioView; title: string; desc: string, icon: React.ComponentProps<typeof Icon>['name'] }[] = [
        { id: 'chat', title: t('studioChat'), desc: t('studioChatDesc'), icon: 'ai' },
        { id: 'agents', title: 'Vendedores IA', desc: 'Fuerza de ventas digital 24/7.', icon: 'agent' },
        { id: 'live', title: 'Conversación en Vivo', desc: 'Habla y muestra tu entorno por cámara.', icon: 'video' },
        { id: 'presentations', title: 'Presentaciones Web', desc: 'Genera slides inteligentes.', icon: 'monitor' },
        { id: 'socialManager', title: 'Social Media Studio', desc: 'Campañas, calendario y publicación asistida.', icon: 'share' },
        { id: 'webProgrammer', title: t('webProgrammer'), desc: t('webProgrammerDesc'), icon: 'code' },
        { id: 'formBuilder', title: 'Creador de Formularios', desc: 'Convierte prompts en formularios.', icon: 'form' },
        { id: 'mediaGenerator', title: t('mediaGenerator'), desc: t('mediaGeneratorDesc'), icon: 'image' },
        { id: 'imageEditor', title: t('imageEditor'), desc: t('imageEditorDesc'), icon: 'edit' },
        { id: 'videoInsights', title: t('videoInsights'), desc: t('videoInsightsDesc'), icon: 'video' },
        { id: 'audioTools', title: t('audioTools'), desc: t('audioToolsDesc'), icon: 'volume' },
    ];

    useEffect(() => {
        const getToolFromHash = () => {
            const path = window.location.hash.slice(1);
            const [view, subview] = path.split('/');
            if (view === 'aiStudio') {
                const toolId = subview as AiStudioView;
                if (toolId && tools.some(t => t.id === toolId)) { setActiveTool(toolId); } else { setActiveTool('chat'); }
            }
        };
        window.addEventListener('hashchange', getToolFromHash);
        getToolFromHash();
        return () => window.removeEventListener('hashchange', getToolFromHash);
    }, []); 

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => { if (window.innerWidth < 1024 && submenuRef.current && !submenuRef.current.contains(event.target as Node)) setIsSubmenuOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleToolSelect = (e: React.MouseEvent, toolId: AiStudioView) => {
        e.preventDefault();
        setActiveTool(toolId);
        window.location.hash = `aiStudio/${toolId}`;
        if (window.innerWidth < 1024) setIsSubmenuOpen(false);
    };

    const renderContent = () => {
        switch (activeTool) {
            case 'chat': return <AdvancedChat isGlobal={true} />;
            case 'live': return <LiveConversation />;
            case 'webProgrammer': return <WebProgrammer isModuleFullScreen={isModuleFullScreen} setIsModuleFullScreen={setIsModuleFullScreen} />;
            case 'mediaGenerator': return <MediaGenerator />;
            case 'imageEditor': return <ImageEditor />;
            case 'videoInsights': return <VideoInsights />;
            case 'audioTools': return <AudioTools />;
            case 'agents': return <AiAgent />;
            case 'formBuilder': return <FormBuilder />;
            case 'presentations': return <PresentationBuilder />; 
            case 'socialManager': return <SocialMediaManager />; 
            default: return null;
        }
    };
    
    const selectedTool = tools.find(t => t.id === activeTool);

    return (
        <div className="h-full flex flex-col lg:flex-row relative overflow-hidden bg-light-bg dark:bg-dark-bg" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <div className={`fixed inset-0 bg-black/50 z-[14000] lg:hidden transition-opacity ${isSubmenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSubmenuOpen(false)}></div>
            <nav ref={submenuRef} className={`flex flex-col bg-light-surface dark:bg-dark-surface shadow-xl flex-shrink-0 transition-all duration-300 ease-in-out z-[15000] fixed top-0 left-0 h-full lg:relative lg:translate-x-0 overflow-y-auto overscroll-behavior-contain ${isSubmenuOpen ? 'translate-x-0 w-72' : '-translate-x-full w-72'} ${isDesktopSidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} p-4 pt-[calc(env(safe-area-inset-top)+1rem)]`}>
                <div className={`flex items-center mb-6 ${isDesktopSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!isDesktopSidebarCollapsed && <h2 className="text-lg font-bold">Apps IA</h2>}
                    <button onClick={() => setIsSubmenuOpen(false)} className="p-2 lg:hidden"><Icon name="close" /></button>
                    <button onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)} className="hidden lg:block p-1 hover:bg-light-bg dark:hover:bg-dark-bg rounded-md transition-colors" title={isDesktopSidebarCollapsed ? "Expandir menú" : "Colapsar menú"}><Icon name="chevronLeft" className={`w-5 h-5 transition-transform ${isDesktopSidebarCollapsed ? 'rotate-180' : ''}`} /></button>
                </div>
                <div className="flex flex-col gap-0.5 lg:gap-1 pb-20">
                    {tools.map(tool => {
                        const isActive = activeTool === tool.id;
                        return (
                            <a key={tool.id} href={`#aiStudio/${tool.id}`} onClick={(e) => handleToolSelect(e, tool.id)} className={`w-full flex items-center justify-between p-3 rounded-xl transition-all duration-300 font-medium group ${isActive ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-lg shadow-brand-primary/30 scale-[1.02]' : 'text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-bg dark:hover:bg-dark-bg hover:shadow-sm'} ${isDesktopSidebarCollapsed ? 'justify-center px-0' : ''}`} title={tool.title}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${isActive ? 'bg-white/20 text-white' : 'bg-brand-accent/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-white'}`}><Icon name={tool.icon} className="w-5 h-5 lg:w-4 lg:h-4"/></div>
                                    <div className={`flex flex-col overflow-hidden ${isDesktopSidebarCollapsed ? 'hidden' : 'block'}`}><span className="text-sm truncate">{tool.title}</span></div>
                                </div>
                                {isActive && !isDesktopSidebarCollapsed && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0"></span>}
                            </a>
                        );
                    })}
                </div>
            </nav>
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="hidden lg:flex p-6 border-b border-light-border dark:border-dark-border items-start gap-4 animate-subtle-slide-in-up bg-light-surface dark:bg-dark-surface flex-none z-10">
                     {selectedTool && ( 
                        <>
                            <div className="p-3 bg-brand-accent/10 rounded-xl">
                                <Icon name={selectedTool.icon} className="w-8 h-8 text-brand-primary flex-shrink-0"/>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold truncate">{selectedTool.title}</h1>
                                    {activeTool === 'webProgrammer' && (
                                        <button 
                                            onClick={() => setIsModuleFullScreen(!isModuleFullScreen)} 
                                            className={`p-2 rounded-xl transition-all ${isModuleFullScreen ? 'bg-brand-primary text-white shadow-lg' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'}`}
                                            title={isModuleFullScreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
                                        >
                                            <Icon name={isModuleFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary mt-1">{selectedTool.desc}</p>
                            </div>
                            <PlanCreditBadge compact className="ml-auto" />
                        </> 
                    )}
                </div>
                <div className="lg:hidden p-3 border-b border-light-border dark:border-dark-border flex items-center gap-3 bg-light-surface dark:bg-dark-surface flex-none z-10 shadow-sm pt-[env(safe-area-inset-top)]">
                    <button onClick={() => setIsSubmenuOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-sm font-bold text-brand-primary hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"><Icon name="chevronLeft" className="w-4 h-4"/> Menú IA</button>
                    {selectedTool && (
                        <div className="flex-1 flex items-center gap-2 truncate">
                            <h2 className="text-sm font-bold truncate">{selectedTool.title}</h2>
                            {activeTool === 'webProgrammer' && (
                                <button 
                                    onClick={() => setIsModuleFullScreen(!isModuleFullScreen)} 
                                    className={`p-1.5 rounded-lg transition-all ${isModuleFullScreen ? 'bg-brand-primary text-white shadow-sm' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500'}`}
                                    title="Pantalla Completa"
                                >
                                    <Icon name={isModuleFullScreen ? "close" : "expand"} className="w-4 h-4"/>
                                </button>
                            )}
                        </div>
                    )}
                    <PlanCreditBadge compact className="ml-auto max-w-[48vw]" />
                </div>
                <div className="flex-1 overflow-hidden relative h-full pb-[env(safe-area-inset-bottom)]">{renderContent()}</div>
            </div>
        </div>
    );
};

export default AiStudio;