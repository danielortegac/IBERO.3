
import React, { useState, useRef, useContext, useEffect } from 'react';
import type { View, UserProfile } from '../types';
import Icon from './Icon';
import PlanCreditBadge from './PlanCreditBadge';
import { AppContext } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import type { Translations } from '../localization/en';
import NotificationsPanel from './NotificationsPanel';
import { useSwipe } from '../hooks/useSwipe';

interface SidebarProps {
  isMobileOpen: boolean;
  setMobileOpen: (isOpen: boolean) => void;
  onToggleAIChat: () => void;
  onShowProModal: () => void;
}

const Avatar: React.FC<{ user: UserProfile, isCollapsed: boolean, isSuperAdmin?: boolean }> = ({ user, isCollapsed, isSuperAdmin }) => {
  const sizeClasses = isCollapsed ? 'w-10 h-10' : 'w-10 h-10';
  const textClasses = isCollapsed ? 'text-sm' : 'text-lg';

  const getInitials = (name: string) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const renderSuperAdminBadge = () => (
      isSuperAdmin && (
          <div className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-0.5 shadow-sm border border-white" title="Súper Administrador">
              <Icon name="star" className="w-2.5 h-2.5 text-white" />
          </div>
      )
  );

  if (user.avatarUrl) {
    return (
        <div className={`relative ${sizeClasses}`}>
             <img src={user.avatarUrl} alt={user.name} className={`rounded-full object-contain w-full h-full border-2 ${isSuperAdmin ? 'border-amber-400' : 'border-transparent'}`} />
             {renderSuperAdminBadge()}
        </div>
    );
  }

  return (
    <div className={`rounded-full bg-brand-primary flex items-center justify-center text-white font-bold relative ${sizeClasses} border-2 ${isSuperAdmin ? 'border-amber-400' : 'border-transparent'}`}>
      {user.name ? <span className={textClasses}>{getInitials(user.name)}</span> : <Icon name="user" className="w-6 h-6" />}
      {renderSuperAdminBadge()}
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, setMobileOpen, onToggleAIChat, onShowProModal }) => {
  const { 
      theme, setTheme, language, setLanguage, 
      currentView, setCurrentView, setSelectedProjectId, 
      projects, selectedProjectId,
      userProfile, hasNewNews, hasNewStudioContent, setHasNewStudioContent,
      isSidebarCollapsed, toggleSidebar,
      logOut, currentUser,
      notifications,
      totalUnreadMessages,
      unreadGroupIds,
      setViewingProfile,
      isSuperAdmin,
      setMeetsInfoOpen,
      addNewGlobalChat,
      setAiChatOpen,
      textSizeLevel,
      setTextSizeLevel
  } = useContext(AppContext);
  const { t } = useTranslation();
  const sidebarRef = useRef<HTMLElement>(null);
  const LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/goatify-app-ia.firebasestorage.app/o/Logos%20HD.png?alt=media&token=293a80b4-b5b8-4249-8d57-cc4925598747";
  const [imgError, setImgError] = useState(false);

  const touchHandlers = useSwipe({
    onSwipedLeft: () => setMobileOpen(false)
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (window.innerWidth < 1024 && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setMobileOpen]);
  
  useEffect(() => {
    if (isMobileOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isMobileOpen]);

  const navItems: { name: View; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
    { name: 'dashboard', label: t('dashboard'), icon: 'dashboard' },
    { name: 'projects', label: t('projects'), icon: 'projects' },
    { name: 'drive', label: 'Goatify Drive', icon: 'folder' },
    { name: 'mail' as any, label: 'Mailing & Campañas', icon: 'message' },
    { name: 'globalCalendar', label: t('globalCalendar'), icon: 'calendar' },
    { name: 'discovery', label: t('discovery'), icon: 'discover' },
    { name: 'hub', label: t('hub'), icon: 'message' },
    { name: 'wallet', label: t('intisWallet'), icon: 'wallet' },
    { name: 'aiStudio', label: t('aiStudio'), icon: 'studio' },
    { name: 'chill' as any, label: '🎮 Chill', icon: 'rocket' },
    { name: 'partners', label: t('partners'), icon: 'partners' },
    { name: 'calls' as any, label: 'Goatify Meets', icon: 'video' },
    { name: 'scheduler' as any, label: 'Goatify Scheduler', icon: 'calendar' },
  ];

  const handleNavClick = (e: React.MouseEvent, view: View) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (view as any === 'calls') {
      setMeetsInfoOpen(true);
      if (window.innerWidth < 1024) setMobileOpen(false);
      return;
    }
    if (view === 'projects') setSelectedProjectId(null);
    if (view === 'aiStudio') setHasNewStudioContent(false);
    if (view === 'profile') setViewingProfile(null);
    if (view as any === 'pos') {
      const targetId = selectedProjectId || (projects && projects.length > 0 ? projects[0].id : 'default');
      window.open(`/#/pos/${targetId}`, '_blank');
      return;
    }
    setCurrentView(view);
    window.location.hash = view;
    if (window.innerWidth < 1024) setMobileOpen(false);
  };

  const handleAssistantClick = async () => {
    // Comportamiento solicitado: Siempre abrir chat nuevo en blanco
    await addNewGlobalChat();
    setAiChatOpen(true);
    if (window.innerWidth < 1024) setMobileOpen(false);
  };

  const baseButtonClass = "flex items-center w-full text-sm font-medium rounded-lg transition-all duration-200";
  const inactiveClass = "text-light-text-secondary dark:text-dark-text-secondary hover:bg-light-border dark:hover:bg-dark-border";
  const activeClass = "bg-brand-primary text-white shadow-lg";
  
  const isPremium = userProfile.plan === 'premium';
  
  let upgradeText = 'Probar 30 días gratis';
  if (isPremium) upgradeText = 'Beneficios Premium';

  const upgradeBtnClass = "relative overflow-hidden flex items-center justify-center w-full px-3 py-2.5 mt-1 lg:mt-2 rounded-xl transition-all duration-300 transform animate-pulse-subtle bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-800 dark:border-purple-900 shadow-sm font-bold group";

  return (
    <>
      <div className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity ${isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setMobileOpen(false)}></div>
      <nav 
        ref={sidebarRef}
        {...touchHandlers}
        className={`fixed top-0 left-0 flex flex-col bg-light-surface dark:bg-dark-surface shadow-xl z-40 h-full transition-all duration-300 ease-in-out lg:translate-x-0 ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'} pt-[calc(env(safe-area-inset-top)+1rem)] pb-[env(safe-area-inset-bottom)] lg:pt-2 lg:pb-2`} 
      >
        <div className={`flex items-center mb-2 lg:mb-3 shrink-0 px-4 ${isSidebarCollapsed && 'lg:justify-center'}`}>
          <div className="w-full flex items-center justify-center">
             {isSidebarCollapsed ? (
                <div className="bg-light-surface dark:bg-dark-surface p-1 rounded-lg w-8 h-8 flex items-center justify-center overflow-hidden">
                    {!imgError ? <img src={LOGO_URL} alt="Goatify" className="w-full h-full object-contain" onError={() => setImgError(true)} /> : <Icon name="goat" className="w-6 h-6 text-brand-primary" />}
                </div>
             ) : (
                 !imgError ? <img src={LOGO_URL} alt="Goatify" className="h-8 lg:h-10 object-contain" onError={() => setImgError(true)} /> : <div className="flex items-center gap-2"><Icon name="goat" className="w-6 h-6 text-brand-primary" /><span className="font-bold text-lg text-brand-primary">Goatify</span></div>
             )}
          </div>
        </div>
        
        <div className={`space-y-1 mb-2 px-4 shrink-0 ${isSidebarCollapsed && 'lg:space-y-0'}`}>
          <button onClick={handleAssistantClick} className={`flex items-center justify-center w-full px-3 py-1.5 lg:py-2 bg-gradient-to-r from-brand-secondary to-brand-primary hover:from-brand-primary hover:to-brand-secondary rounded-lg text-white font-semibold transition-all duration-300 transform hover:scale-105 shadow-md ${isSidebarCollapsed && 'lg:px-0'}`} title={t('aiAssistant')}>
              <Icon name="ai" className="w-5 h-5 flex-shrink-0"/><span className={`ml-3 transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : ''}`}>{t('aiAssistant')}</span>
          </button>

          {!isPremium && (
              <div className="space-y-1">
                <button onClick={onShowProModal} className={`${upgradeBtnClass} ${isSidebarCollapsed && 'lg:hidden'}`}>
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none"></div>
                    <Icon name="partners" className="w-4 h-4 flex-shrink-0 text-purple-600" />
                    <span className="ml-2 text-[10px] uppercase tracking-tight">{upgradeText}</span>
                </button>
              </div>
          )}
        </div>

        {!isSidebarCollapsed && (
          <div className="px-4 mb-2 hidden lg:block">
            <PlanCreditBadge compact className="w-full justify-between" />
          </div>
        )}

        <ul className="flex-1 space-y-4 lg:space-y-4 overflow-y-auto overflow-x-hidden px-4 custom-scrollbar">
            {navItems.map((item) => {
                const showBadge = (item.name === 'discovery' && hasNewNews) || (item.name === 'aiStudio' && hasNewStudioContent) || (item.name === 'hub' && (totalUnreadMessages > 0 || unreadGroupIds.length > 0));
                
                return (
                    <li key={item.name}>
                        <a href={`#${item.name}`} onClick={(e) => handleNavClick(e, item.name)} className={`${baseButtonClass} ${currentView === item.name ? activeClass : inactiveClass} p-1.5 lg:p-2.5 ${isSidebarCollapsed ? 'lg:justify-center' : 'lg:px-3 lg:py-2'}`} title={item.label}>
                            <Icon name={item.icon} className={`w-5 h-5 flex-shrink-0 ${currentView !== item.name ? 'text-brand-primary' : ''}`} />
                            <span className={`ml-4 transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : ''}`}>{item.label}</span>
                            {showBadge && <span className={`w-2 h-2 bg-brand-primary rounded-full animate-pulse ring-2 ring-brand-accent/50 ${isSidebarCollapsed ? 'lg:absolute lg:top-1 lg:right-1' : 'ml-auto'}`}></span>}
                        </a>
                    </li>
                );
            })}
        </ul>

        <div className="mt-auto pt-2 border-t border-light-border dark:border-dark-border shrink-0 px-4">
            <div className={`w-full flex items-center p-1.5 rounded-lg hover:bg-light-border dark:hover:bg-dark-border ${isSidebarCollapsed && 'lg:justify-center'}`}>
                <a href="#profile" onClick={(e) => handleNavClick(e, 'profile')} className="flex items-center flex-1 min-w-0">
                    <Avatar user={userProfile} isCollapsed={isSidebarCollapsed} isSuperAdmin={isSuperAdmin} />
                    <div className={`ml-3 text-left transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : ''} min-w-0`}>
                        <div className="text-xs font-semibold flex items-center gap-1 truncate">{userProfile.name}{isSuperAdmin && <Icon name="star" className="w-3 h-3 text-amber-400" />}</div>
                        <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary truncate w-24">{isSuperAdmin ? "Súper Admin" : isPremium ? "Premium" : userProfile.plan === 'pro' ? "Pro" : "Start"}</p>
                        
                        {/* CONTROL DE TAMAÑO DE TEXTO */}
                        <div className="mt-1.5 flex items-center gap-2">
                             <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTextSizeLevel(Math.max(1, textSizeLevel - 1)); }}
                                className={`text-[10px] font-black transition-all hover:text-brand-primary p-0.5 px-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 ${textSizeLevel === 1 ? 'opacity-20 pointer-events-none' : 'opacity-60'}`}
                             >
                                 A
                             </button>
                             <button 
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTextSizeLevel(Math.min(4, textSizeLevel + 1)); }}
                                className={`text-sm font-black transition-all hover:text-brand-primary p-0.5 px-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 ${textSizeLevel === 4 ? 'opacity-20 pointer-events-none' : 'opacity-60'}`}
                             >
                                 A
                             </button>
                        </div>
                    </div>
                </a>
            </div>
            {currentUser && <button onClick={logOut} className={`w-full mt-1 p-1 rounded-md text-red-500 hover:bg-red-50/10 flex items-center gap-2 ${isSidebarCollapsed ? 'justify-center' : 'px-2'}`} title={t('logout')}><Icon name="logout" className="w-4 h-4"/><span className="text-[10px] font-medium transition-opacity duration-200 lg:hidden">Cerrar</span></button>}
            <button onClick={toggleSidebar} className={`w-full mt-1 p-1.5 rounded-lg hover:bg-light-border dark:hover:bg-dark-border hidden lg:flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-end'}`} title="Collapse sidebar"><Icon name="kanban" className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? 'transform -rotate-180' : ''}`}/></button>
        </div>
      </nav>
    </>
  );
};

export default Sidebar;
