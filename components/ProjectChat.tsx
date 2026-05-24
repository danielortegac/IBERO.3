
import React, { useContext, useState, useEffect, useMemo, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import type { ChatMessage, Project } from '../types';
import AdvancedChat from './AdvancedChat';
import Icon from './Icon';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';

interface ProjectChatProps {
    project: Project;
}

const ProjectChat: React.FC<ProjectChatProps> = ({ project }) => {
    const { updateProject, userProfile, deleteProjectChat, setToastNotification } = useContext(AppContext);
    
    const [localChats, setLocalChats] = useState(project.chats || []);
    
    // Full Screen State for Mobile
    const [isFullScreen, setIsFullScreen] = useState(false);

    useEffect(() => {
        if (project.chats) {
            setLocalChats(project.chats);
        }
    }, [project.chats]);

    const visibleChats = useMemo(() =>
        (Array.isArray(localChats) ? localChats : []).filter(c => !c.deletedBy?.includes(userProfile.uid)),
        [localChats, userProfile.uid]
    );

    const [activeChatId, setActiveChatId] = useState<string>('');

    useEffect(() => {
        if (visibleChats.length > 0) {
            if (!activeChatId || !visibleChats.some(c => c.id === activeChatId)) {
                setActiveChatId(visibleChats[visibleChats.length - 1].id);
            }
        } else {
            setActiveChatId('');
        }
    }, [visibleChats, activeChatId]);

    const [editingChat, setEditingChat] = useState<{ id: string; name: string } | null>(null);
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

    // Esta función se pasa al AdvancedChat para manejar el historial de forma persistente
    const handleSetChatHistory = (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
        setLocalChats(prevLocalChats => {
            const updatedChats = prevLocalChats.map(c => {
                if (c.id === activeChatId) {
                    const newHistory = updater(c.history);
                    return { ...c, history: newHistory };
                }
                return c;
            });
            
            // Persistir inmediatamente el cambio estructural en el proyecto
            updateProject(project.id, { chats: updatedChats });
            return updatedChats;
        });
    };

    const handleNewChat = () => {
        const newChatId = `chat-${Date.now()}`;
        const newChat = {
            id: newChatId,
            name: `Chat ${localChats.length + 1}`,
            history: [{
                id: `msg-${Date.now()}`,
                role: 'model' as const,
                text: `Hola ${userProfile.name}, empecemos una nueva conversación para el proyecto "${project.name}". ¿En qué puedo ayudarte?`
            }]
        };
        
        const updated = [...localChats, newChat];
        setLocalChats(updated);
        updateProject(project.id, { chats: updated });
        setActiveChatId(newChatId);
    };

    const handleSaveChatName = () => {
        if (!editingChat || !editingChat.name.trim()) return;
        
        const updatedChats = localChats.map(c => c.id === editingChat.id ? {...c, name: editingChat.name.trim()} : c);
        setLocalChats(updatedChats);
        updateProject(project.id, { chats: updatedChats });
        setEditingChat(null);
    };

    const handleDeleteChat = () => {
        if (!deletingChatId) return;
        if (visibleChats.length <= 1) {
            setToastNotification({ title: "Error", message: "No puedes eliminar el último chat.", icon: 'close' });
            setDeletingChatId(null);
            return;
        }
        
        deleteProjectChat(project.id, deletingChatId);
        
        const updatedLocal = localChats.map(c => c.id === deletingChatId ? { ...c, deletedBy: [...(c.deletedBy || []), userProfile.uid] } : c);
        setLocalChats(updatedLocal);
        
        if (activeChatId === deletingChatId) {
            const nextChat = visibleChats.find(c => c.id !== deletingChatId);
            if (nextChat) setActiveChatId(nextChat.id);
        }
        
        setDeletingChatId(null);
    };

    const activeChat = visibleChats.find(c => c.id === activeChatId);

    return (
        <div className={`flex flex-col bg-white dark:bg-dark-bg shadow-sm overflow-hidden transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-[1200] h-[100dvh] rounded-none' : 'h-full rounded-xl'}`}>
             {deletingChatId && (
                <Modal isOpen={!!deletingChatId} onClose={() => setDeletingChatId(null)} title="Eliminar Chat">
                    <p>¿Estás seguro de que quieres eliminar este chat de tu vista? Otros miembros del proyecto seguirán viéndolo.</p>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button variant="secondary" onClick={() => setDeletingChatId(null)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleDeleteChat} className="bg-red-500 hover:bg-red-600">Eliminar</Button>
                    </div>
                </Modal>
            )}
            <div className="p-3 sm:p-4 border-b border-light-border dark:border-dark-border flex items-center gap-2 flex-shrink-0 bg-light-surface/90 dark:bg-dark-surface/90 backdrop-blur-md z-10 sticky top-0">
                {editingChat ? (
                    <div className="flex items-center gap-2 flex-grow">
                         <Input 
                            value={editingChat.name} 
                            onChange={(e) => setEditingChat({ ...editingChat, name: e.target.value })} 
                            onBlur={handleSaveChatName}
                            onKeyDown={e => e.key === 'Enter' && handleSaveChatName()}
                            autoFocus
                            className="!mt-0 text-sm font-bold"
                        />
                        <Button size="sm" onClick={handleSaveChatName}>Guardar</Button>
                    </div>
                ) : (
                    <div className="relative flex-grow max-w-xs group cursor-pointer touch-manipulation">
                        <div className="bg-brand-accent/10 dark:bg-white/5 rounded-lg px-3 py-1.5 transition-colors flex items-center justify-between active:bg-brand-accent/20 lg:hover:bg-brand-accent/20">
                             <select 
                                value={activeChatId} 
                                onChange={e => setActiveChatId(e.target.value)}
                                className="appearance-none w-full bg-transparent text-base font-bold text-brand-primary dark:text-brand-accent focus:ring-0 cursor-pointer pr-6"
                            >
                                {visibleChats.map(chat => (
                                    <option key={chat.id} value={chat.id} className="bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary font-normal">{chat.name}</option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                                <Icon name="chevronDown" className="w-4 h-4 text-brand-primary dark:text-brand-accent" />
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-1 ml-auto">
                     <Button onClick={handleNewChat} variant="ghost" size="sm" className="!p-2 hover:bg-brand-accent/20 text-brand-primary active:bg-brand-accent/20 lg:hover:bg-brand-accent/20" title="Nuevo Chat">
                        <Icon name="plus" className="w-5 h-5"/>
                    </Button>
                     <Button onClick={() => activeChat && setEditingChat({ id: activeChat.id, name: activeChat.name })} variant="ghost" size="sm" className="!p-2 hover:bg-brand-accent/20 active:bg-brand-accent/20 lg:hover:bg-brand-accent/20" title="Renombrar Chat">
                        <Icon name="edit" className="w-4 h-4"/>
                    </Button>
                     <Button onClick={() => setDeletingChatId(activeChatId)} variant="ghost" size="sm" className="!p-2 hover:bg-red-500/10 active:bg-red-500/10 text-red-500 lg:hover:bg-red-500/10" title="Eliminar Chat" disabled={visibleChats.length <= 1}>
                        <Icon name="trash" className="w-4 h-4"/>
                    </Button>
                    <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-700 mx-1 lg:hidden"></div>
                    <Button onClick={() => setIsFullScreen(!isFullScreen)} variant="ghost" size="sm" className={`!p-2 lg:hidden ${isFullScreen ? 'bg-brand-primary/10 text-brand-primary' : 'text-neutral-500'}`} title={isFullScreen ? "Salir Pantalla Completa" : "Pantalla Completa"}>
                        <Icon name={isFullScreen ? "close" : "expand"} className="w-5 h-5"/>
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
                {activeChat && (
                    <AdvancedChat
                        key={activeChat.id} 
                        isGlobal={false}
                        chatHistory={activeChat.history}
                        setChatHistory={handleSetChatHistory}
                        projectContext={project}
                    />
                )}
            </div>
        </div>
    );
};

export default ProjectChat;
