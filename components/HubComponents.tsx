
import React, { useState, useContext, useEffect, useRef } from 'react';
import type { HubPost, UserProfile, Comment } from '../types';
import { AppContext } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import Icon from './Icon';
import ChatMessageRenderer from './ui/ChatMessageRenderer';
import Textarea from './ui/Textarea';
import { detectContentSensitivity } from '../services/geminiService';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from '../firebaseConfig';
import { uploadWithQuotaCheck, safeStoragePath } from '../services/storageQuotaService';

/**
 * Componente de Sugerencias para Menciones (@)
 */
const MentionSuggestions: React.FC<{ 
    search: string; 
    onSelect: (user: UserProfile) => void;
    allUsers: UserProfile[];
}> = ({ search, onSelect, allUsers }) => {
    // Filtrar usuarios que coincidan con la búsqueda
    const filtered = allUsers.filter(u => 
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.name.split(' ')[0].toLowerCase().includes(search.toLowerCase()) ||
        u.alterEgo?.agentName?.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 8);

    if (filtered.length === 0) return null;

    return (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl z-[500] overflow-hidden animate-scale-in origin-bottom-left">
            <p className="text-[9px] font-black uppercase text-neutral-400 p-3 border-b dark:border-neutral-800 tracking-widest bg-neutral-50 dark:bg-neutral-950">Etiquetar Persona o IA</p>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {filtered.map(user => (
                    <div 
                        key={user.uid} 
                        onClick={() => onSelect(user)}
                        className="flex items-center gap-3 p-3 hover:bg-brand-primary/10 cursor-pointer transition-colors border-b last:border-0 dark:border-neutral-800 group"
                    >
                        <div className="relative flex-shrink-0">
                            <img src={user.avatarUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-9 h-9 rounded-full object-contain border border-neutral-100 dark:border-neutral-700" alt={user.name} />
                            {user.alterEgo?.enabled && <span className="absolute -bottom-1 -right-1 bg-cyan-400 text-black text-[7px] font-black rounded-full px-1 border border-white">IA</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-neutral-800 dark:text-white group-hover:text-brand-primary truncate">
                                {user.alterEgo?.enabled ? user.alterEgo.agentName : user.name.split(' ')[0]}
                                {user.alterEgo?.enabled && <span className="ml-1 opacity-40 font-normal text-[9px]">(@{user.name.split(' ')[0]})</span>}
                            </p>
                            <p className="text-[9px] text-neutral-400 truncate">{user.headline || 'Miembro de Goatify'}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const HubSidebarAds: React.FC = () => {
    const { setCurrentView, setProModalOpen, userProfile } = useContext(AppContext);
    const [carouselIndex, setCarouselIndex] = useState(0);
    
    const carouselItems = [
        { title: "Imágenes", desc: "Crea arte visual con prompts", icon: "image", color: "from-pink-500 to-rose-500" },
        { title: "Código Web", desc: "Genera apps completas", icon: "code", color: "from-blue-500 to-cyan-500" },
        { title: "Videos", desc: "Da vida a tus ideas", icon: "video", color: "from-purple-500 to-violet-500" },
        { title: "Agentes IA", desc: "Automatiza tu negocio", icon: "agent", color: "from-emerald-500 to-teal-500" }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setCarouselIndex((prev) => (prev + 1) % carouselItems.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);
    
    const handleStudioClick = () => {
        setCurrentView('aiStudio');
        window.location.hash = 'aiStudio';
    };
    
    const isPaidUser = userProfile.plan === 'pro' || userProfile.plan === 'premium';
    const handleProClick = () => {
        if (isPaidUser) {
             setCurrentView('partners');
             window.location.hash = 'partners';
        } else {
            setProModalOpen(true);
        }
    }

    const activeItem = carouselItems[carouselIndex];

    return (
        <div className="flex flex-col gap-6 h-full">
            <div 
                onClick={handleStudioClick} 
                className="relative group cursor-pointer rounded-3xl overflow-hidden shadow-xl transform hover:scale-[1.02] transition-all duration-500 flex-1 min-h-[220px]"
            >
                <div className={`absolute inset-0 bg-gradient-to-br ${activeItem.color} opacity-90 transition-colors duration-1000`}></div>
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20"></div>
                
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

                <div className="relative z-10 h-full flex flex-col p-6 text-white">
                    <div className="flex items-center justify-between mb-4">
                         <div className="bg-white/20 backdrop-blur-md p-2 rounded-xl border border-white/30 shadow-lg">
                            <Icon name="studio" className="w-6 h-6 text-white drop-shadow-md" />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">AI Studio</span>
                    </div>

                    <div className="flex-grow flex flex-col justify-center transition-all duration-500">
                        <div className="flex items-center gap-2 mb-1 animate-fade-in" key={carouselIndex}>
                            <Icon name={activeItem.icon as any} className="w-5 h-5 opacity-90" />
                            <h3 className="text-2xl font-extrabold tracking-tight">{activeItem.title}</h3>
                        </div>
                        <p className="text-sm opacity-90 font-medium animate-slide-in-up" key={`desc-${carouselIndex}`}>{activeItem.desc}</p>
                    </div>

                    <div className="mt-4">
                        <button className="w-full py-2 bg-white text-black hover:bg-opacity-90 font-bold shadow-xl border-b-4 border-neutral-300 active:border-b-0 active:translate-y-1 transition-all rounded-xl text-xs sm:text-sm">
                            Crear Ahora &rarr;
                        </button>
                    </div>
                    
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                        {carouselItems.map((_, idx) => (
                            <div key={idx} className={`h-1 rounded-full transition-all duration-300 ${idx === carouselIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}></div>
                        ))}
                    </div>
                </div>
            </div>

            <div 
                onClick={handleProClick} 
                className="relative group cursor-pointer rounded-3xl overflow-hidden shadow-xl bg-white dark:bg-neutral-900 border border-brand-primary/20 flex-1 min-h-[220px] flex flex-col"
            >
                <div className="absolute inset-0 z-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                     <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent transition-transform duration-1000 ease-in-out"></div>
                </div>

                <div className="relative z-10 p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                         <div>
                             <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider mb-1">Socios Goatify</h4>
                             <h3 className="text-xl font-black text-neutral-900 dark:text-white leading-tight">
                                 {isPaidUser ? "Panel de" : "Gana Dinero"} <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-purple-600">{isPaidUser ? "Control" : "Con Tu Talento"}</span>
                             </h3>
                         </div>
                         <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg transform group-hover:rotate-12 transition-transform duration-300">
                             <Icon name="wallet" className="w-6 h-6 text-white" />
                         </div>
                    </div>

                    <div className="space-y-2 mb-6">
                        <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                            <Icon name="check" className="w-4 h-4 text-green-500" />
                            <span>Comisiones recurrentes</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                            <Icon name="check" className="w-4 h-4 text-green-500" />
                            <span>Vende tus servicios</span>
                        </div>
                    </div>

                    <div className="mt-auto">
                        <button className="w-full py-3 rounded-xl font-bold text-sm bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center gap-2 group-hover:gap-4 transition-all duration-300 shadow-lg">
                            {isPaidUser ? "Ir a Mis Ganancias" : "Unirse a Pro"} <Icon name="arrowRight" className="w-4 h-4" />
                        </button>
                        <p className="text-[10px] text-center text-neutral-400 mt-2">Únete a +500 socios activos</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const CreatePost: React.FC<{ onPost: (content: string, groupId?: string, media?: any, stickerUrl?: string, silent?: boolean, isSensitive?: boolean) => Promise<void>; groupId?: string; isGroupChat?: boolean }> = ({ onPost, groupId, isGroupChat }) => {
    const { userProfile, allUsers, createNotification, checkAndConsumeLimit, setProModalOpen, setToastNotification } = useContext(AppContext);
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mentionSearch, setMentionSearch] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setContent(value);

        const words = value.split(/\s+/);
        const lastWord = words[words.length - 1];
        if (lastWord.startsWith('@')) {
            setMentionSearch(lastWord.substring(1));
        } else {
            setMentionSearch(null);
        }
    };

    const handleSelectMention = (user: UserProfile) => {
        const words = content.split(/\s+/);
        const nameToTag = user.alterEgo?.enabled ? user.alterEgo.agentName : user.name.split(' ')[0];
        words[words.length - 1] = `@${nameToTag}`;
        setContent(words.join(' ') + ' ');
        setMentionSearch(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if ((!content.trim() && !file) || isSubmitting) return;
        
        setIsSubmitting(true);
        const cleanContent = content.trim();

        let media = undefined;
        let isSensitive = false;
        let imageBase64 = '';
        let mimeType = '';

        if (file && preview) {
             let type = 'file';
             if (file.type.startsWith('image/')) {
                 type = 'image';
                 imageBase64 = preview.split(',')[1];
                 mimeType = file.type;
             }
             else if (file.type.startsWith('video/')) type = 'video';
             else if (file.type.startsWith('audio/')) type = 'audio';
             
             try {
                const uploaded = await uploadWithQuotaCheck({
                    userId: userProfile.uid,
                    data: file,
                    path: safeStoragePath('hub-posts', userProfile.uid, `${Date.now()}_${file.name}`),
                    sizeBytes: file.size,
                    metadata: { contentType: file.type || 'application/octet-stream' },
                    plan: userProfile.plan
                });
                const downloadUrl = uploaded.url;

                media = {
                    url: downloadUrl,
                    type,
                    name: file.name,
                    originalType: file.type
                };
             } catch (error) {
                 console.error("Error uploading file:", error);
                 setToastNotification({ title: "Error", message: "Error al subir el archivo.", icon: "close" });
                 setIsSubmitting(false);
                 return;
             }
        }

        try {
            if (imageBase64) {
                isSensitive = await detectContentSensitivity(cleanContent, imageBase64, mimeType);
            } else {
                isSensitive = await detectContentSensitivity(cleanContent);
            }
        } catch (e) {
            console.error("Sensitivity check error", e);
        }

        // DISPARAR NOTIFICACIONES DE ETIQUETADO MANUAL
        const mentions = cleanContent.match(/@(\w+)/g);
        if (mentions) {
            mentions.forEach(async (m: string) => {
                const targetName = m.substring(1).toLowerCase();
                const target = allUsers.find(u => u.name.toLowerCase().includes(targetName) || u.alterEgo?.agentName?.toLowerCase().includes(targetName));
                if (target && target.uid !== userProfile.uid) {
                    await createNotification(target.uid, {
                        type: 'general',
                        text: `🔔 **${userProfile.name}** te ha mencionado en un nuevo post.`,
                        link: '/#hub/feed',
                        fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
                    });
                }
            });
        }

        await onPost(cleanContent, groupId, media, undefined, undefined, isSensitive);
        setContent('');
        setFile(null);
        setPreview(null);
        setIsSubmitting(false);
        setMentionSearch(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            const reader = new FileReader();
            reader.onload = (ev) => setPreview(ev.target?.result as string);
            reader.readAsDataURL(f);
        }
    };

    return (
        <Card className={`p-5 mb-6 shadow-md hover:shadow-lg transition-shadow duration-300 ${isGroupChat ? 'rounded-t-none border-t border-light-border dark:border-dark-border shadow-none' : 'rounded-2xl'}`}>
            <form onSubmit={handleSubmit} className="flex gap-4">
                <div className="flex-shrink-0">
                     <img src={userProfile.avatarUrl || `https://ui-avatars.com/api/?name=${userProfile.name.replace(' ', '+')}`} className="w-12 h-12 rounded-full object-contain ring-2 ring-light-bg dark:ring-dark-bg shadow-sm" alt={userProfile.name} />
                </div>
                <div className="flex-grow relative">
                    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl p-1 focus-within:ring-2 focus-within:ring-brand-primary/20 transition-all">
                        <Input 
                            value={content} 
                            onChange={handleContentChange} 
                            placeholder={t('whatsOnYourMind')} 
                            className="w-full !mt-0 bg-transparent border-none focus:ring-0 text-lg placeholder-neutral-400 p-3"
                        />
                         {preview && (
                            <div className="relative w-fit m-2 group">
                                {file?.type.startsWith('image/') ? <img src={preview} className="h-24 rounded-lg object-contain shadow-sm" alt="Preview" /> : <div className="h-24 w-24 bg-white dark:bg-dark-surface rounded-lg flex items-center justify-center border border-light-border dark:border-dark-border shadow-sm"><Icon name="upload" className="w-8 h-8 text-brand-primary"/></div>}
                                <button type="button" onClick={() => { setFile(null); setPreview(null); }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"><Icon name="close" className="w-3 h-3"/></button>
                            </div>
                        )}
                    </div>
                   
                    {mentionSearch !== null && (
                        <MentionSuggestions 
                            search={mentionSearch} 
                            allUsers={allUsers} 
                            onSelect={handleSelectMention} 
                        />
                    )}

                    <div className="flex justify-between items-center mt-3">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-brand-primary hover:bg-brand-accent/10 p-2 rounded-full transition-colors" title="Add Image/File">
                                <Icon name="image" className="w-5 h-5"/>
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="*" />
                        </div>
                        <Button type="submit" size="sm" className="rounded-full px-6 font-bold shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all" disabled={(!content.trim() && !file) || isSubmitting}>
                            {isSubmitting ? 'Posting...' : t('post')}
                        </Button>
                    </div>
                </div>
            </form>
        </Card>
    );
};

const CommentItem: React.FC<{ 
    comment: Comment; 
    postId: string; 
    onViewProfile: (u: UserProfile) => void;
    level?: number;
}> = ({ comment, postId, onViewProfile, level = 0 }) => {
    const { userProfile, likeComment, deleteComment, updateComment, addCommentToPost, allUsers, createNotification } = useContext(AppContext);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(comment.text);
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [mentionSearch, setMentionSearch] = useState<string | null>(null);

    const isOwn = comment.author.uid === userProfile.uid;
    const isAgent = comment.isAgentComment === true;
    const isLiked = (comment.likedBy || []).includes(userProfile.uid);

    const handleReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setReplyText(value);
        const words = value.split(/\s+/);
        const lastWord = words[words.length - 1];
        if (lastWord.startsWith('@')) setMentionSearch(lastWord.substring(1));
        else setMentionSearch(null);
    };

    const handleSelectReplyMention = (user: UserProfile) => {
        const words = replyText.split(/\s+/);
        const nameToTag = user.alterEgo?.enabled ? user.alterEgo.agentName : user.name.split(' ')[0];
        words[words.length - 1] = `@${nameToTag}`;
        setReplyText(words.join(' ') + ' ');
        setMentionSearch(null);
    };

    const handleReply = async () => {
        if (!replyText.trim()) return;

        // NOTIFICACIÓN DE ETIQUETADO EN RESPUESTA
        const mentions = replyText.match(/@(\w+)/g);
        if (mentions) {
            mentions.forEach(async (m: string) => {
                const targetName = m.substring(1).toLowerCase();
                const target = allUsers.find(u => u.name.toLowerCase().includes(targetName) || u.alterEgo?.agentName?.toLowerCase().includes(targetName));
                if (target && target.uid !== userProfile.uid) {
                    await createNotification(target.uid, {
                        type: 'general',
                        text: `🔔 **${userProfile.name}** te ha mencionado en un comentario.`,
                        link: `/#hub/feed/${postId}`,
                        fromUser: { uid: userProfile.uid, name: userProfile.name, avatarUrl: userProfile.avatarUrl }
                    });
                }
            });
        }

        await addCommentToPost(postId, replyText, undefined, comment.id);
        setReplyText('');
        setIsReplying(false);
        setMentionSearch(null);
    };

    const startReplying = () => {
        const nameToTag = isAgent ? comment.agentName : comment.author.name.split(' ')[0];
        setReplyText(`@${nameToTag} `);
        setIsReplying(true);
    };

    return (
        <div className={`space-y-3 ${level > 0 ? 'ml-8 sm:ml-12 border-l-2 border-neutral-100 dark:border-neutral-800 pl-4 mt-2' : ''}`}>
            <div className="flex gap-3 text-sm group relative">
                <div className="relative flex-shrink-0">
                    <img src={comment.author.avatarUrl || `https://ui-avatars.com/api/?name=${comment.author.name.replace(' ', '+')}&background=8B5CF6&color=fff`} className={`w-8 h-8 rounded-full object-contain cursor-pointer ${isAgent ? 'border-2 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : ''}`} onClick={() => onViewProfile(comment.author as any)} alt={comment.author.name}/>
                    {isAgent && <span className="absolute -bottom-1 -right-1 bg-cyan-400 text-black text-[6px] font-black rounded-full px-0.5 py-0 shadow-sm border border-white">IA</span>}
                </div>
                <div className="flex-1">
                    <div className={`p-3 rounded-2xl rounded-tl-none shadow-sm inline-block max-w-full relative group/bubble ${isAgent ? 'neural-glow bg-gradient-to-br from-[#0f172a] to-[#1e1b4b] text-white border-none' : 'bg-white dark:bg-dark-surface border border-neutral-100 dark:border-neutral-800'}`}>
                        <span className={`font-bold cursor-pointer hover:underline text-[10px] block mb-0.5 ${isAgent ? 'text-cyan-400' : 'text-light-text-primary dark:text-dark-text-primary'}`} onClick={() => onViewProfile(comment.author as any)}>
                            {isAgent ? (
                                <span className="flex items-center gap-1">
                                    {comment.agentName} <span className="text-[8px] opacity-60 font-normal uppercase tracking-tighter">| Reflejo de {comment.agentOwnerHumanName}</span>
                                </span>
                            ) : comment.author.name}
                        </span>
                        
                        {isEditing ? (
                            <div className="space-y-2 min-w-[200px]">
                                <Textarea value={editText} onChange={e => setEditText(e.target.value)} className="text-xs" rows={2}/>
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setIsEditing(false)} className="text-[9px] font-bold uppercase opacity-60">Cancelar</button>
                                    <button onClick={() => { updateComment(postId, comment.id, editText); setIsEditing(false); }} className="text-[9px] font-black uppercase text-brand-primary">Guardar</button>
                                </div>
                            </div>
                        ) : (
                            <div className={`text-[13px] leading-relaxed ${isAgent ? 'text-white/90 italic' : 'text-neutral-700 dark:text-neutral-300'}`}>
                                <ChatMessageRenderer text={comment.text} className={isAgent ? '!text-white' : ''} />
                            </div>
                        )}

                        <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10">
                            {isOwn && !isEditing && (
                                <button onClick={() => setIsEditing(true)} className="bg-white dark:bg-neutral-800 rounded-full p-1 shadow-md text-neutral-400 hover:text-brand-primary"><Icon name="edit" className="w-3 h-3"/></button>
                            )}
                            {(isOwn) && (
                                <button onClick={() => deleteComment(postId, comment.id)} className="bg-white dark:bg-neutral-800 rounded-full p-1 shadow-md text-neutral-400 hover:text-red-500"><Icon name="close" className="w-3 h-3"/></button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1 ml-1">
                        <span className="text-[10px] text-neutral-400">{new Date(comment.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        <button onClick={() => likeComment(postId, comment.id)} className={`text-[10px] font-black uppercase tracking-tighter hover:scale-110 transition-all flex items-center gap-1 ${isLiked ? 'text-brand-primary' : 'text-neutral-600 dark:text-neutral-400'}`}>
                            <Icon name={isLiked ? "like" : "like"} className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
                            Me gusta {(comment.likes || 0) > 0 && <span className="opacity-80">({comment.likes})</span>}
                        </button>
                        <button onClick={startReplying} className="text-[10px] font-black uppercase tracking-tighter text-neutral-600 dark:text-neutral-400 hover:text-brand-primary">Responder</button>
                    </div>

                    {isReplying && (
                        <div className="mt-3 flex gap-2 animate-fade-in relative">
                            <div className="relative flex-1">
                                <Input 
                                    value={replyText} 
                                    onChange={handleReplyChange} 
                                    placeholder={`Responder a ${comment.author.name}...`} 
                                    className="!mt-0 text-[11px] h-8"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleReply()}
                                />
                                {mentionSearch !== null && (
                                    <div className="absolute bottom-full left-0 z-[110]">
                                        <MentionSuggestions 
                                            search={mentionSearch} 
                                            allUsers={allUsers} 
                                            onSelect={handleSelectReplyMention} 
                                        />
                                    </div>
                                )}
                            </div>
                            <button onClick={handleReply} className="px-3 bg-brand-primary text-white rounded-lg text-[10px] font-black uppercase">OK</button>
                        </div>
                    )}
                </div>
            </div>

            {comment.replies && comment.replies.length > 0 && (
                <div className="space-y-3">
                    {comment.replies.map(reply => (
                        <CommentItem 
                            key={reply.id} 
                            comment={reply} 
                            postId={postId} 
                            onViewProfile={onViewProfile} 
                            level={level + 1} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const PostCard: React.FC<{ 
    post: HubPost; 
    onLike: (id: string) => void; 
    onComment: (id: string, text: string) => void; 
    onViewProfile: (user: UserProfile) => void; 
    onShare?: () => void; 
    isNew?: boolean;
    onVisible?: () => void;
}> = ({ post, onLike, onComment, onViewProfile, onShare, isNew, onVisible }) => {
    const { userProfile, deleteHubPost, updateHubPost, setToastNotification, repostPost, allUsers, createNotification } = useContext(AppContext);
    const { t } = useTranslation();
    const [commentInput, setCommentInput] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(post.content);
    const [isRevealed, setIsRevealed] = useState(false);
    const [showAllComments, setShowAllComments] = useState(false);
    const [mentionSearch, setMentionSearch] = useState<string | null>(null);

    const cardRef = useRef<HTMLDivElement>(null);
    const visibleTimeoutRef = useRef<number | null>(null);
    const commentInputRef = useRef<HTMLInputElement>(null);
    
    const isLiked = post.likedBy.includes(userProfile.uid);
    const isOwner = post.author.uid === userProfile.uid;
    
    const formattedDate = new Date(post.timestamp).toLocaleString(undefined, { 
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    useEffect(() => {
        if (!isNew || !onVisible || isOwner) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { 
                visibleTimeoutRef.current = window.setTimeout(() => onVisible(), 500); 
            } 
            else { 
                if (visibleTimeoutRef.current) { 
                    clearTimeout(visibleTimeoutRef.current); 
                    visibleTimeoutRef.current = null; 
                } 
            }
        }, { threshold: 0.2 }); 
        
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [isNew, onVisible, isOwner]);

    const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setCommentInput(value);
        const words = value.split(/\s+/);
        const lastWord = words[words.length - 1];
        if (lastWord.startsWith('@')) setMentionSearch(lastWord.substring(1));
        else setMentionSearch(null);
    };

    const handleSelectCommentMention = (user: UserProfile) => {
        const words = commentInput.split(/\s+/);
        const nameToTag = user.alterEgo?.enabled ? user.alterEgo.agentName : user.name.split(' ')[0];
        words[words.length - 1] = `@${nameToTag}`;
        setCommentInput(words.join(' ') + ' ');
        setMentionSearch(null);
    };

    const handleSaveEdit = async () => {
        if (editedContent.trim() !== post.content) { await updateHubPost(post.id, { content: editedContent }); }
        setIsEditing(false);
    };

    const handleCopyLink = () => {
        const link = `${window.location.origin}/#hub/feed/${post.id}`;
        navigator.clipboard.writeText(link);
        setToastNotification({ title: 'Copiado', message: 'Enlace copiado al portapapeles', icon: 'share' });
    }

    const isSensitive = post.isSensitive && !isRevealed;
    const isAgentPost = post.isAgentPost === true;

    // LÍMITE ESTRATÉGICO DE COMENTARIOS V10.2
    const hardLimit = 7;
    const sortedComments = [...post.comments].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const isThreadClosed = sortedComments.length >= hardLimit;
    const visibleComments = showAllComments ? sortedComments : sortedComments.slice(0, 5);
    const hasMoreComments = sortedComments.length > 5;

    const handleIntervention = () => {
        if (commentInputRef.current) {
            commentInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            commentInputRef.current.focus();
        }
    };

    return (
        <Card ref={cardRef} className={`p-0 mb-6 overflow-hidden shadow-md hover:shadow-xl transition-shadow duration-300 animate-subtle-slide-in-up border border-light-border/50 dark:border-dark-border/50 relative ${isAgentPost ? 'neural-glow' : ''} ${isNew ? 'ring-2 ring-brand-primary/20' : ''}`} id={`post-${post.id}`}>
             {post.repostOf && (
                 <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-1.5 flex items-center gap-2 border-b dark:border-neutral-700">
                     <Icon name="sync" className="w-3.5 h-3.5 text-neutral-500"/>
                     <span className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">Reposteado por {post.repostedBy?.name}</span>
                 </div>
             )}
             {isNew && !isOwner && ( <div className="absolute top-0 left-0 z-30 bg-brand-primary text-white text-[8px] font-black uppercase px-4 py-1 rounded-br-2xl shadow-lg animate-pulse tracking-widest"> NUEVA PUBLICACIÓN </div> )}
             <div className={`p-5 ${isNew ? 'pt-8' : 'pb-0'} flex justify-between items-start`}>
                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onViewProfile(isAgentPost ? { uid: post.author.uid } as any : post.author)}>
                    <div className="relative">
                         <img src={post.author.avatarUrl || `https://ui-avatars.com/api/?name=${post.author.name.replace(' ', '+')}&background=6D28D9&color=fff`} className={`w-12 h-12 rounded-full object-contain ring-2 ring-transparent group-hover:ring-brand-primary transition-all ${isAgentPost ? 'border-2 border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : ''}`} alt={post.author.name} />
                         {isAgentPost && <span className="absolute -bottom-1 -right-1 bg-cyan-400 text-black text-[7px] font-black rounded-full px-1 py-0.5 shadow-sm border border-white">IA</span>}
                    </div>
                    <div>
                        <h4 className="font-bold text-base text-light-text-primary dark:text-dark-text-primary group-hover:text-brand-primary transition-colors">
                            {isAgentPost ? ( <span className="flex items-center gap-1.5"> <span className="text-cyan-600 dark:text-cyan-400 font-black">{post.agentName}</span> <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">| Reflejo de {post.agentOwnerHumanName}</span> </span> ) : post.author.name}
                        </h4>
                        <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary flex items-center gap-1"> <span>{post.author.headline}</span> <span className="text-[10px] opacity-50">•</span> <span>{formattedDate}</span> </p>
                    </div>
                </div>
                {isOwner && ( <div className="flex items-center gap-2"> <button onClick={() => setIsEditing(!isEditing)} className="text-neutral-400 hover:text-brand-primary p-2 hover:bg-brand-accent/10 rounded-full transition-colors"><Icon name="edit" className="w-4 h-4"/></button> <button onClick={() => deleteHubPost(post.id)} className="text-neutral-400 hover:text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"><Icon name="trash" className="w-4 h-4"/></button> </div> )}
            </div>
            
            <div className="relative">
                {isSensitive && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded-lg m-2">
                        <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl text-center border border-white/20 shadow-2xl max-w-xs">
                            <div className="mb-3 mx-auto bg-neutral-900 p-3 rounded-full w-fit border border-neutral-700"> <Icon name="security" className="w-6 h-6 text-white"/> </div>
                            <h3 className="text-white font-bold text-lg mb-1">Contenido delicado</h3>
                            <p className="text-gray-300 text-xs mb-4">Este post puede contener material sensible.</p>
                            <Button onClick={() => setIsRevealed(true)} className="bg-white text-black hover:bg-gray-200 border-none font-bold shadow-lg text-xs px-6 py-2.5 w-full"> Ver de todos modos </Button>
                        </div>
                    </div>
                )}
                <div className={`${isSensitive ? 'filter blur-xl select-none pointer-events-none opacity-50' : ''} transition-all duration-500`}>
                    <div className={`px-5 mt-4 mb-4 ${isAgentPost ? 'neural-text' : ''}`}>
                         {isEditing ? ( <div className="space-y-2"> <Textarea value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="w-full" rows={4} /> <div className="flex justify-end gap-2"> <Button size="sm" variant="secondary" onClick={() => { setIsEditing(false); setEditedContent(post.content); }}>Cancelar</Button> <Button size="sm" onClick={handleSaveEdit}>Guardar</Button> </div> </div> ) : ( <div className="text-neutral-700 dark:text-neutral-300 text-sm"> <ChatMessageRenderer text={post.content} /> </div> )}
                    </div>
                    {(post.imageUrl || post.videoUrl || post.audioUrl || post.file) && (
                        <div className="w-full bg-black/5 dark:bg-black/20 px-5 pb-4 pt-2">
                             {post.imageUrl && <img src={post.imageUrl} alt="Post" className="w-full max-h-[500px] object-contain rounded-lg shadow-sm" />}
                             {post.videoUrl && <video src={post.videoUrl} controls className="w-full max-h-[500px] rounded-lg shadow-sm" />}
                             {post.audioUrl && <div className="p-2"><audio src={post.audioUrl} controls className="w-full"/></div>}
                             {post.file && !post.imageUrl && !post.videoUrl && !post.audioUrl && (
                                 <div className="flex items-center gap-3 p-3 bg-white dark:bg-dark-surface rounded-lg border border-light-border dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => window.open(post.file?.url, '_blank')}>
                                     <Icon name="folder" className="w-8 h-8 text-brand-primary"/>
                                     <div className="flex-1 overflow-hidden"> <p className="text-sm font-bold truncate">{post.file.name}</p> <p className="text-xs text-gray-500 uppercase">{post.file.type.split('/')[1] || 'FILE'}</p> </div>
                                     <Icon name="upload" className="w-5 h-5 text-gray-400"/>
                                 </div>
                             )}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="px-5 py-3 border-t border-light-border dark:border-dark-border flex items-center justify-between bg-light-bg/30 dark:bg-dark-bg/30">
                 <div className="flex gap-4">
                     <button onClick={() => onLike(post.id)} className={`flex items-center gap-2 text-sm font-semibold transition-all px-3 py-1.5 rounded-full hover:bg-brand-accent/10 ${isLiked ? 'text-brand-primary' : 'text-neutral-600 dark:text-neutral-400'}`}>
                        <Icon name={isLiked ? 'goat' : 'like'} className={`w-5 h-5 ${isLiked ? 'animate-pulse-once' : ''}`} /> 
                        <span>{post.likes > 0 ? post.likes : t('like')}</span>
                    </button>
                     <button className="flex items-center gap-2 text-sm font-semibold text-light-text-secondary dark:text-dark-text-secondary hover:text-brand-primary transition-all px-3 py-1.5 rounded-full hover:bg-brand-accent/10" onClick={() => { if(commentInputRef.current) commentInputRef.current.focus(); }}>
                        <Icon name="message" className="w-5 h-5" />
                        <span>{post.comments.length > 0 ? post.comments.length : t('comment')}</span>
                    </button>
                </div>
                <div className="flex gap-2">
                    <button className="text-light-text-secondary dark:text-dark-text-secondary hover:text-brand-primary transition-all p-2 rounded-full hover:bg-brand-accent/10" onClick={() => repostPost(post.id)} title="Repostear"><Icon name="sync" className="w-3.5 h-3.5"/></button>
                    <button className="text-light-text-secondary dark:text-dark-text-secondary hover:text-brand-primary transition-colors p-2 rounded-full hover:bg-brand-accent/10" onClick={onShare || handleCopyLink} title="Compartir"><Icon name="share" className="w-3.5 h-3.5"/></button>
                </div>
            </div>
            
            {post.comments.length > 0 && (
                <div className="bg-neutral-50 dark:bg-neutral-900/30 px-5 py-3 space-y-4 border-t border-light-border dark:border-dark-border">
                    {visibleComments.map(c => (
                        <CommentItem key={c.id} comment={c} postId={post.id} onViewProfile={onViewProfile} />
                    ))}
                    
                    {isThreadClosed && (
                        <div className="border-t border-dashed border-brand-primary/20 pt-2 pb-2">
                             <div className="flex items-center justify-between gap-3 p-2 bg-gradient-to-r from-amber-400/5 to-purple-600/5 rounded-xl border border-amber-400/20">
                                 <div className="flex items-center gap-2">
                                     <div className="p-1 bg-amber-400 rounded-md shadow-sm"><Icon name="star" className="w-2.5 h-2.5 text-white"/></div>
                                     <p className="text-[9px] font-black uppercase text-amber-600 tracking-tighter">Negociación IA Finalizada</p>
                                 </div>
                                 <button 
                                    onClick={handleIntervention}
                                    className="px-3 py-1 bg-brand-primary text-white text-[8px] font-black uppercase tracking-widest rounded-lg shadow-sm transform active:scale-95 transition-all"
                                 >
                                    Tomar el Control
                                 </button>
                             </div>
                        </div>
                    )}
                    
                    {hasMoreComments && !showAllComments && (
                        <button 
                            onClick={() => setShowAllComments(true)}
                            className="w-full py-2 text-[10px] font-black uppercase text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 rounded-xl transition-all"
                        >
                            Ver hilo completo ({post.comments.length})
                        </button>
                    )}
                    
                    {showAllComments && (
                        <button 
                            onClick={() => setShowAllComments(false)}
                            className="w-full py-2 text-[10px] font-black uppercase text-neutral-400 hover:text-neutral-600 transition-all"
                        >
                            Mostrar menos
                        </button>
                    )}
                </div>
            )}
            
            <div className="p-4 bg-white dark:bg-dark-surface border-t border-light-border dark:border-dark-border relative overflow-visible">
                {mentionSearch !== null && (
                    <div className="absolute bottom-full left-10 z-[110]">
                        <MentionSuggestions 
                            search={mentionSearch} 
                            allUsers={allUsers} 
                            onSelect={handleSelectCommentMention} 
                        />
                    </div>
                )}
                <form onSubmit={(e) => { e.preventDefault(); if(commentInput.trim()) { onComment(post.id, commentInput); setCommentInput(''); setMentionSearch(null); } }} className="flex gap-3 items-center">
                    <img src={userProfile.avatarUrl || `https://ui-avatars.com/api/?name=${userProfile.name.replace(' ', '+')}`} className="w-8 h-8 rounded-full object-contain" alt={userProfile.name} />
                    <div className="flex-grow relative">
                        <Input 
                            ref={commentInputRef}
                            value={commentInput} 
                            onChange={handleCommentChange} 
                            placeholder={isThreadClosed ? "IAs inactivas - Deja tu comentario final" : t('comment')} 
                            className="!mt-0 text-sm pr-10 rounded-full bg-neutral-100 dark:bg-neutral-800 border-transparent focus:bg-white dark:focus:bg-dark-surface focus:border-brand-primary transition-all h-10" 
                        />
                        <button type="submit" disabled={!commentInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-primary disabled:text-neutral-400 hover:scale-110 transition-transform p-1">
                            <Icon name="send" className="w-4 h-4"/>
                        </button>
                    </div>
                </form>
            </div>
        </Card>
    );
};
