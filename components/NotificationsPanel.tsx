
import React, { useContext, useMemo, useState, useRef, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { CallContext } from '../context/CallContext';
import type { Notification, UserProfile } from '../types';
import Icon from './Icon';
import Button from './ui/Button';
import { useTranslation } from '../hooks/useTranslation';

interface NotificationsPanelProps {
    onClose: () => void;
    onOpenSettings: () => void;
}

type FilterType = 'all' | 'unread' | 'likes' | 'comments' | 'agents' | 'groups' | 'projects' | 'news' | 'system' | 'calls';

const NotificationItem: React.FC<{ 
    notification: Notification; 
    onClick: () => void; 
    onDelete: (id: string) => void;
    onAcceptCircle?: (id: string) => void;
    onDeclineCircle?: (id: string) => void;
    onAcceptProject?: (notifId: string, projectId: string) => void;
    onDeclineProject?: (notifId: string) => void;
    onAcceptMeeting?: (callId: string) => void;
    onDeclineMeeting?: (callId: string) => void;
    onProcessLoyalty?: (claimId: string, status: 'approved' | 'rejected') => void;
}> = ({ notification, onClick, onDelete, onAcceptCircle, onDeclineCircle, onAcceptProject, onDeclineProject, onAcceptMeeting, onDeclineMeeting, onProcessLoyalty }) => {
    let iconColorClass = "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
    let iconName: React.ComponentProps<typeof Icon>['name'] = "bell";
    
    const isMissedCall = notification.text.includes("Llamada perdida") || (notification as any).metadata?.isMissed;
    const isCircleRequest = notification.metadata?.type === 'circle_request';
    const isProjectInvite = notification.type === 'project_invite' && !notification.metadata?.isMeetingInvite;
    const isMeetingInvite = notification.metadata?.isMeetingInvite;
    const isLoyaltyClaim = notification.type === 'loyalty_claim';

    switch (notification.type) {
        case 'agent_message':
            iconColorClass = "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400";
            iconName = "agent";
            break;
        case 'group_post':
        case 'group_join_request':
        case 'group_join_accepted':
        case 'group_join_denied':
            iconColorClass = "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
            iconName = "hub";
            break;
        case 'like':
            iconColorClass = "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400";
            iconName = "like";
            break;
        case 'comment':
            iconColorClass = "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
            iconName = "message";
            break;
        case 'task_due':
        case 'project_invite':
        case 'project_update':
            iconColorClass = "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400";
            iconName = "projects";
            break;
        case 'new_message':
        case 'sticker':
            iconColorClass = "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400";
            iconName = "send";
            break;
        case 'news_alert':
            iconColorClass = "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400";
            iconName = "news";
            break;
        case 'general':
        case 'ai_task_complete':
             if (notification.text.includes("Llamada")) {
                 iconColorClass = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
                 iconName = "video";
             } else if (isCircleRequest) {
                 iconColorClass = "bg-brand-primary/10 text-brand-primary";
                 iconName = "users";
             } else {
                 iconColorClass = "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
                 iconName = "bell";
             }
            break;
        case 'loyalty_claim':
            iconColorClass = "bg-brand-accent/20 text-brand-primary";
            iconName = "wallet";
            break;
        case 'incoming_call':
             iconColorClass = isMissedCall ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "bg-green-100 text-green-600";
             iconName = isMissedCall ? "close" : "video";
             break;
    }

    // SINCRONIZACIÓN DE HORA CON EL DASHBOARD v5.6
    const formattedTime = new Date(notification.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const formattedDate = new Date(notification.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

    return (
        <li onClick={onClick} className={`p-4 flex items-start gap-3 cursor-pointer hover:bg-light-bg dark:hover:bg-dark-bg transition-all duration-200 border-b border-light-border dark:border-dark-border last:border-0 group relative ${!notification.read ? 'bg-brand-accent/5' : ''}`}>
            <div className="flex-shrink-0 mt-1 relative">
                {notification.fromUser?.avatarUrl ? (
                    <img src={notification.fromUser.avatarUrl} alt={notification.fromUser.name} className="w-10 h-10 rounded-full object-contain border border-light-border dark:border-dark-border shadow-sm" />
                ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${iconColorClass}`}>
                        <Icon name={iconName} className="w-5 h-5" />
                    </div>
                )}
                {!notification.read && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-dark-surface animate-pulse"></div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-light-text-primary dark:text-dark-text-primary leading-snug" dangerouslySetInnerHTML={{ __html: notification.text }}></p>
                <p className="text-[10px] text-light-text-secondary dark:text-dark-text-secondary mt-1.5 font-black uppercase tracking-widest opacity-60">
                    {formattedDate} • {formattedTime}
                </p>
                
                {isMeetingInvite && (
                    <div className="flex gap-2 mt-3">
                        <button onClick={(e) => { e.stopPropagation(); onAcceptMeeting?.(notification.metadata.meetingId); onDelete(notification.id); }} className="px-4 py-1.5 bg-brand-primary text-white text-[10px] font-black uppercase rounded-lg shadow-md hover:scale-105 transition-all"> Aceptar </button>
                        <button onClick={(e) => { e.stopPropagation(); onDeclineMeeting?.(notification.metadata.meetingId); onDelete(notification.id); }} className="px-4 py-1.5 bg-white dark:bg-neutral-800 text-red-500 border border-red-200 text-[10px] font-black uppercase rounded-lg hover:bg-red-50 transition-all"> Rechazar </button>
                    </div>
                )}
                {isLoyaltyClaim && onProcessLoyalty && notification.metadata?.claimId && (
                    <div className="flex gap-2 mt-3">
                        <button onClick={(e) => { e.stopPropagation(); onProcessLoyalty(notification.metadata.claimId, 'approved'); onDelete(notification.id); }} className="px-4 py-1.5 bg-brand-primary text-white text-[10px] font-black uppercase rounded-lg shadow-md hover:scale-105 transition-all"> Aprobar </button>
                        <button onClick={(e) => { e.stopPropagation(); onProcessLoyalty(notification.metadata.claimId, 'rejected'); onDelete(notification.id); }} className="px-4 py-1.5 bg-white dark:bg-neutral-800 text-red-500 border border-red-200 text-[10px] font-black uppercase rounded-lg hover:bg-red-50 transition-all"> Rechazar </button>
                    </div>
                )}
                {isCircleRequest && onAcceptCircle && onDeclineCircle && notification.metadata?.requesterId && (
                    <div className="flex gap-2 mt-2">
                        <button onClick={(e) => { e.stopPropagation(); onAcceptCircle(notification.metadata!.requesterId); onDelete(notification.id); }} className="px-4 py-1.5 bg-brand-primary text-white text-[10px] font-black uppercase rounded-lg shadow-md">Aceptar</button>
                        <button onClick={(e) => { e.stopPropagation(); onDeclineCircle(notification.metadata!.requesterId); onDelete(notification.id); }} className="px-4 py-1.5 bg-white dark:bg-neutral-800 text-neutral-500 border border-neutral-200 text-[10px] font-black uppercase rounded-lg">Rechazar</button>
                    </div>
                )}
                {isProjectInvite && onAcceptProject && onDeclineProject && notification.metadata?.projectId && (
                    <div className="flex gap-2 mt-3">
                        <button onClick={(e) => { e.stopPropagation(); onAcceptProject(notification.id, notification.metadata.projectId); }} className="px-4 py-1.5 bg-green-600 text-white text-[10px] font-black uppercase rounded-lg shadow-md">Unirme</button>
                        <button onClick={(e) => { e.stopPropagation(); onDeclineProject(notification.id); }} className="px-4 py-1.5 bg-white dark:bg-neutral-800 text-neutral-500 border border-neutral-200 text-[10px] font-black uppercase rounded-lg">Ignorar</button>
                    </div>
                )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }} className="absolute top-2 right-2 p-1.5 text-neutral-300 hover:text-red-500 transition-opacity opacity-0 group-hover:opacity-100">
                <Icon name="trash" className="w-4 h-4" />
            </button>
        </li>
    );
}

const FilterPill: React.FC<{ label: string; active: boolean; onClick: () => void; count?: number }> = ({ label, active, onClick, count }) => (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 whitespace-nowrap mb-1 ${active ? 'bg-brand-primary text-white shadow-md' : 'bg-light-bg dark:bg-dark-bg text-light-text-secondary dark:text-dark-text-secondary hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'}`}>
        {label}
        {count !== undefined && count > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-neutral-300 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-300'}`}>
                {count}
            </span>
        )}
    </button>
);

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ onClose, onOpenSettings }) => {
    const { notifications, markNotificationAsRead, markAllNotificationsAsRead, userProfile, deleteNotification, deleteAllNotifications, setCurrentView, setDeepLinkTarget, setActiveHubView, acceptCircleRequest, declineCircleRequest, acceptProjectInvite, declineProjectInvite, processLoyaltyClaim } = useContext(AppContext);
    const { startCall, acceptMeeting, declineMeeting } = useContext(CallContext);
    const [filter, setFilter] = useState<FilterType>('all');
    const [isFullScreen, setIsFullScreen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    const enabledNotifications = useMemo(() => {
        const settings = userProfile.notificationSettings;
        if (!settings) return notifications;
        return notifications.filter(n => {
            let settingKey = n.type;
            if (n.type === 'group_join_request' || n.type === 'group_join_accepted' || n.type === 'group_join_denied') settingKey = 'groupPosts';
            if (n.type === 'project_update') settingKey = 'projectUpdates';
            if (n.type === 'news_alert') settingKey = 'newsAlerts';
            if (n.type === 'agent_message') settingKey = 'agentMessages';
            if (n.type === 'incoming_call' || (n.type === 'general' && n.text.includes('Llamada'))) return true; 
            return (settings as any)[settingKey] !== false;
        });
    }, [notifications, userProfile.notificationSettings]);

    const displayedNotifications = useMemo(() => {
        switch (filter) {
            case 'unread': return enabledNotifications.filter(n => !n.read);
            case 'likes': return enabledNotifications.filter(n => n.type === 'like');
            case 'comments': return enabledNotifications.filter(n => n.type === 'comment');
            case 'agents': return enabledNotifications.filter(n => n.type === 'agent_message');
            case 'groups': return enabledNotifications.filter(n => n.type.startsWith('group'));
            case 'projects': return enabledNotifications.filter(n => n.type === 'project_invite' || n.type === 'task_due' || n.type === 'project_update');
            case 'news': return enabledNotifications.filter(n => n.type === 'news_alert');
            case 'system': return enabledNotifications.filter(n => n.type === 'general' || n.type === 'ai_task_complete');
            case 'calls': return enabledNotifications.filter(n => n.type === 'incoming_call' || (n.type === 'general' && n.text.includes('Llamada')));
            default: return enabledNotifications;
        }
    }, [enabledNotifications, filter]);

    const unreadCount = enabledNotifications.filter(n => !n.read).length;
    
    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.read) {
             await markNotificationAsRead(notification.id);
        }
        
        if (notification.type === 'project_invite' || notification.metadata?.isMeetingInvite) return;

        const isCallNotification = notification.type === 'incoming_call' || (notification.type === 'general' && notification.text.includes('Llamada'));
        if (isCallNotification && notification.fromUser) {
             const callType = (notification as any).metadata?.callType || 'audio';
             const userToCall: UserProfile = notification.fromUser as UserProfile; 
             startCall([userToCall], callType);
             onClose();
             return;
        }
        
        if (notification.type === 'news_alert') {
            setCurrentView('discovery');
            window.location.hash = 'discovery';
            onClose();
            return;
        }

        if (notification.link) {
            const cleanHash = notification.link.replace('/#', '').replace('#', '');
            window.location.hash = cleanHash;
            
            const parts = cleanHash.split('/');
            if (parts[0] === 'hub') {
                setCurrentView('hub');
                if (parts[1]) setActiveHubView(parts[1] as any);
                if (parts[2]) setDeepLinkTarget({ view: parts[1] as any, id: parts[2] });
            } else if (parts[0] === 'projects') {
                setCurrentView('projects');
                if (parts[1]) {
                    setDeepLinkTarget({ view: 'overview', id: parts[1] });
                    if (parts[2] === 'task' && parts[3]) {
                        setDeepLinkTarget({ view: 'task', id: parts[3] });
                    }
                }
            } else if (parts[0] === 'calls' && parts[1]) {
                 setDeepLinkTarget({ view: 'calls', id: parts[1] });
            }
        }
        onClose();
    };

    // Z-INDEX SUPREMO v5.6: 3000000 para que tape TODO (sidebar, studio, etc)
    const containerClasses = isFullScreen 
        ? "fixed inset-0 w-screen h-screen z-[3000000] bg-white dark:bg-[#0a0a0a] flex flex-col animate-fade-in"
        : "fixed top-20 right-4 w-80 sm:w-[32rem] bg-light-surface dark:bg-dark-surface rounded-3xl shadow-2xl border border-light-border dark:border-dark-border z-[3000000] overflow-hidden flex flex-col max-h-[80vh] animate-scale-in origin-top-right ring-1 ring-black/5";

    return (
        <div ref={panelRef} className={containerClasses}>
            <div className="flex justify-between items-center p-4 sm:p-5 border-b border-light-border dark:border-dark-border flex-shrink-0 bg-white dark:bg-dark-surface z-10">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                        {t('notifications')}
                        {unreadCount > 0 && <span className="bg-brand-primary text-white text-[10px] px-2 py-0.5 rounded-full">{unreadCount}</span>}
                    </h3>
                    <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all text-brand-primary" title="Pantalla Completa">
                        <Icon name={isFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                    </button>
                </div>
                <div className="flex gap-2">
                    <button onClick={onOpenSettings} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors" title="Configuración"><Icon name="settings" className="w-5 h-5"/></button>
                    <button onClick={markAllNotificationsAsRead} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors" title="Marcar todo como leído"><Icon name="check-double" className="w-5 h-5"/></button>
                    <button onClick={deleteAllNotifications} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-red-500 transition-colors" title="Borrar todo"><Icon name="trash" className="w-5 h-5"/></button>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl"><Icon name="close" className="w-6 h-6"/></button>
                </div>
            </div>
            
            <div className="p-3 border-b border-light-border dark:border-dark-border flex items-center gap-2 bg-neutral-50 dark:bg-black/10 flex-shrink-0 overflow-x-auto no-scrollbar">
                <FilterPill label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
                <FilterPill label="Pendientes" active={filter === 'unread'} onClick={() => setFilter('unread')} count={unreadCount} />
                <FilterPill label="Meets" active={filter === 'calls'} onClick={() => setFilter('calls')} />
                <FilterPill label="Grupos" active={filter === 'groups'} onClick={() => setFilter('groups')} />
                <FilterPill label="Vendedores IA" active={filter === 'agents'} onClick={() => setFilter('agents')} />
                <FilterPill label="Proyectos" active={filter === 'projects'} onClick={() => setFilter('projects')} />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-dark-surface relative">
                {displayedNotifications.length > 0 ? (
                    <ul className="divide-y dark:divide-neutral-800">
                        {displayedNotifications.map((notification) => (
                            <NotificationItem 
                                key={notification.id} 
                                notification={notification} 
                                onClick={() => handleNotificationClick(notification)} 
                                onDelete={deleteNotification}
                                onAcceptCircle={acceptCircleRequest}
                                onDeclineCircle={declineCircleRequest}
                                onAcceptProject={acceptProjectInvite}
                                onDeclineProject={declineProjectInvite}
                                onAcceptMeeting={acceptMeeting}
                                onDeclineMeeting={declineMeeting}
                                onProcessLoyalty={processLoyaltyClaim}
                            />
                        ))}
                    </ul>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8 opacity-40">
                        <Icon name="bell" className="w-16 h-16 text-neutral-300 mb-4"/>
                        <p className="text-sm font-black uppercase tracking-widest">Bandeja Vacía</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPanel;
