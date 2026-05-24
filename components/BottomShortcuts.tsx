
import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import Icon from './Icon';
import type { View } from '../types';

const SHORTCUTS: { id: string; view: View | string; label: string; icon: React.ComponentProps<typeof Icon>['name']; subview?: string }[] = [
    { id: 'dashboard', view: 'dashboard', label: 'Inicio', icon: 'dashboard' },
    { id: 'projects', view: 'projects', label: 'Proyectos', icon: 'projects' },
    { id: 'hub', view: 'hub', label: 'Comunidad', icon: 'hub' },
    { id: 'wallet', view: 'wallet', label: 'Billetera', icon: 'wallet' },
    { id: 'ai_chat', view: 'aiStudio', subview: 'chat', label: 'Chat IA', icon: 'ai' },
    { id: 'media', view: 'aiStudio', subview: 'mediaGenerator', label: 'Imágenes', icon: 'image' },
    { id: 'agents', view: 'aiStudio', subview: 'agents', label: 'Agentes', icon: 'agent' },
    { id: 'calendar', view: 'globalCalendar', label: 'Agenda', icon: 'calendar' },
    { id: 'partners', view: 'partners', label: 'Socios', icon: 'partners' },
    { id: 'profile', view: 'profile', label: 'Perfil', icon: 'user' },
    { id: 'new_task', view: 'newTask', label: 'Tarea +', icon: 'plus' },
    { id: 'discovery', view: 'discovery', label: 'Noticias', icon: 'discover' },
    { id: 'search', view: 'aiStudio', subview: 'webSearch', label: 'Buscar', icon: 'search' },
    { id: 'forms', view: 'aiStudio', subview: 'formBuilder', label: 'Forms', icon: 'form' },
    { id: 'code', view: 'aiStudio', subview: 'webProgrammer', label: 'Código', icon: 'code' },
    { id: 'video', view: 'aiStudio', subview: 'videoInsights', label: 'Video', icon: 'video' },
    { id: 'voice', view: 'aiStudio', subview: 'audioTools', label: 'Voz', icon: 'mic' },
    { id: 'presentations', view: 'aiStudio', subview: 'presentations', label: 'Slides', icon: 'monitor' },
    { id: 'social', view: 'aiStudio', subview: 'socialManager', label: 'Social', icon: 'share' },
    { id: 'live', view: 'aiStudio', subview: 'live', label: 'Live', icon: 'phone' },
];

const BottomShortcuts: React.FC = () => {
    const { setCurrentView, currentView, setNewTaskModalOpen, isAgentFullScreen } = useContext(AppContext);
    const [isOpen, setIsOpen] = useState(false); // Desktop state
    const [currentHash, setCurrentHash] = useState(window.location.hash);

    useEffect(() => {
        const handleHashChange = () => setCurrentHash(window.location.hash);
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    // SI EL CHAT O ASISTENTE ESTÁ ABIERTO A PANTALLA COMPLETA, OCULTAMOS ESTA BARRA
    if (isAgentFullScreen) return null;

    const handleNavigation = (item: typeof SHORTCUTS[0]) => {
        if (item.id === 'new_task') {
            setNewTaskModalOpen(true);
            return;
        }
        
        // @ts-ignore
        setCurrentView(item.view);
        
        if (item.subview) {
            window.location.hash = `${item.view}/${item.subview}`;
        } else {
            window.location.hash = item.view;
        }
    };

    const isActive = (item: typeof SHORTCUTS[0]) => {
        if (item.id === 'new_task') return false;
        if (item.subview) {
            return currentView === item.view && currentHash.includes(item.subview);
        }
        return currentView === item.view && (!currentHash.includes('/') || currentHash === `#${item.view}`);
    };

    return (
        <>
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-black/95 backdrop-blur-xl border-t border-neutral-200 dark:border-neutral-800 z-[400] lg:hidden pb-[env(safe-area-inset-bottom)] shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
                <div className="flex overflow-x-auto no-scrollbar px-1 gap-1 snap-x snap-mandatory py-1">
                    {SHORTCUTS.map(item => {
                         const active = isActive(item);
                         return (
                            <button
                                key={item.id}
                                onClick={() => handleNavigation(item)}
                                className={`flex flex-col items-center justify-center min-w-[55px] snap-center p-1 rounded-lg transition-all ${active ? 'text-brand-primary' : 'text-neutral-400 dark:text-neutral-500'}`}
                            >
                                <div className={`p-1 rounded-md ${active ? 'bg-brand-primary/10' : ''}`}>
                                    <Icon name={item.icon} className="w-5 h-5" />
                                </div>
                                <span className="text-[8px] font-medium truncate w-full text-center leading-none mt-0.5">{item.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div 
                className={`hidden lg:flex fixed top-0 right-0 h-full z-[60] transition-transform duration-300 ease-in-out pointer-events-none ${isOpen ? 'translate-x-0' : 'translate-x-[calc(100%-1.5rem)]'}`}
            >
                <div className="flex h-full items-center pointer-events-auto">
                    <button 
                        onClick={() => setIsOpen(!isOpen)}
                        className="w-6 h-12 bg-white dark:bg-neutral-900 border-l border-t border-b border-neutral-200 dark:border-neutral-700 rounded-l-lg flex items-center justify-center shadow-md hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors group"
                        title={isOpen ? "Cerrar accesos" : "Abrir accesos"}
                    >
                        <Icon name="chevronLeft" className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="w-20 h-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col overflow-y-auto custom-scrollbar py-4 pb-20">
                        <div className="mb-4 px-2 flex justify-center">
                            <div className="w-6 h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full"></div>
                        </div>
                        
                        <div className="flex flex-col gap-4 px-1 items-center">
                            {SHORTCUTS.map(item => {
                                 const active = isActive(item);
                                 return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleNavigation(item)}
                                        className={`group relative flex flex-col items-center justify-center p-2 rounded-lg transition-all duration-200 w-full ${active ? 'bg-brand-primary/10 text-brand-primary' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                                        title={item.label}
                                    >
                                        <Icon name={item.icon} className="w-5 h-5 mb-1" />
                                        <span className="text-[9px] font-medium leading-none text-center w-full truncate">{item.label}</span>
                                        {active && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-brand-primary rounded-l-full"></div>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default BottomShortcuts;
